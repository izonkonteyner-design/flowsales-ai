import "server-only";

import type { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import {
  runOAuthGuard,
  handleOAuthRouteError,
  jsonError,
} from "@/server/services/integrations/oauth-route-guard";
import {
  getProviderAdapter,
  OAuthConfigurationRequiredError,
  OAuthTokenEncryptionNotConfiguredError,
  type ChannelProvider,
} from "@/server/services/integrations/provider-adapter";
import { consumeOAuthState } from "@/server/services/integrations/oauth-state";
import { logger } from "@/lib/logger";

// ============================================================================
// Meta OAuth Callback — /api/integrations/meta/callback
//
// Query params from Meta:
//   ?code=<authorization_code>
//   ?state=<raw_state_token>
//   ?error=<error_code>          (on denial)
//   ?error_description=<msg>    (on denial)
//
// Also reads: ?provider=whatsapp|instagram|facebook (must match stored state)
//
// Security:
//   - Auth, workspace, owner/admin, demo block via runOAuthGuard.
//   - State validated: hash lookup, expiry, single-use (consumed_at set atomically).
//   - Authorization code is NEVER logged.
//   - Raw provider error is NEVER forwarded to client.
//   - Token exchange only runs if TOKEN_ENCRYPTION_KEY is set.
//   - Returns configuration_required if provider creds missing.
//   - Idempotent: replayed callbacks see "state already consumed" and are rejected.
// ============================================================================

export async function GET(request: NextRequest) {
  const guard = await runOAuthGuard(request);
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const searchParams = request.nextUrl.searchParams;
  const rawStateToken = searchParams.get("state");
  const rawProvider = searchParams.get("provider") ?? "facebook";
  // Note: we intentionally do NOT log the code parameter at any point.
  const hasCode = searchParams.has("code");
  const hasError = searchParams.has("error");

  // Validate provider value
  const allowedMetaProviders: ChannelProvider[] = ["whatsapp", "instagram", "facebook"];
  if (!allowedMetaProviders.includes(rawProvider as ChannelProvider)) {
    return jsonError(400, "invalid_provider", "provider must be one of: whatsapp, instagram, facebook");
  }

  const provider = rawProvider as ChannelProvider;

  // Provider denied authorization
  if (hasError) {
    logger.warn("oauth.provider_denied", {
      provider,
      organizationId: ctx.organizationId,
      // Do NOT log error_description as it may contain user-facing details
    });
    redirect("/settings/integrations?error=access_denied");
  }

  if (!hasCode || !rawStateToken) {
    return jsonError(400, "invalid_callback", "Missing code or state parameter.");
  }

  try {
    // Consume state (validates hash, expiry, single-use, org isolation, user binding)
    const stateRecord = await consumeOAuthState(rawStateToken, provider, ctx.organizationId, ctx.userId);

    // Provider config check
    const configCheck = process.env.META_CLIENT_ID?.trim();
    if (!configCheck) {
      throw new OAuthConfigurationRequiredError(provider);
    }

    // Encryption check before token exchange
    const encryptionKey = process.env.TOKEN_ENCRYPTION_KEY?.trim();
    if (!encryptionKey) {
      throw new OAuthTokenEncryptionNotConfiguredError();
    }

    // Token exchange
    // NOTE: getProviderAdapter + exchangeCode stubs throw OAuthConfigurationRequiredError
    // for now. When real credentials are present, this will return ciphertext tokens.
    const adapter = getProviderAdapter(provider);
    const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL}/api/integrations/meta/callback`;
    const code = searchParams.get("code")!;

    // Exchange code for tokens — stubs throw; real implementation stores ciphertext
    await adapter.exchangeCode({
      code, // used by adapter; never logged here
      codeVerifier: stateRecord.codeVerifier,
      redirectUri,
      organizationId: ctx.organizationId,
    });

    logger.info("oauth.callback_success", {
      provider,
      organizationId: ctx.organizationId,
    });

    redirect(stateRecord.returnPath);
  } catch (error) {
    const response = handleOAuthRouteError(error, { provider, route: "meta/callback" });
    // For redirect-based flows, redirect to error page rather than returning JSON
    if (response.status === 503) {
      redirect(`/settings/integrations?error=configuration_required&provider=${provider}`);
    }
    return response;
  }
}
