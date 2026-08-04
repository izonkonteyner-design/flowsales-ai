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
} from "@/server/services/integrations/provider-adapter";
import { consumeOAuthState } from "@/server/services/integrations/oauth-state";
import { logger } from "@/lib/logger";

// ============================================================================
// Google OAuth Callback — /api/integrations/google/callback
//
// Query params from Google:
//   ?code=<authorization_code>
//   ?state=<raw_state_token>
//   ?error=<error_code>      (on denial)
//   ?scope=<granted_scopes>
//
// Security:
//   - Same invariants as meta/callback.
//   - PKCE code_verifier retrieved from oauth_states and used in exchange.
//   - Authorization code NEVER logged.
// ============================================================================

export async function GET(request: NextRequest) {
  const guard = await runOAuthGuard(request);
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const searchParams = request.nextUrl.searchParams;
  const rawStateToken = searchParams.get("state");
  const hasCode = searchParams.has("code");
  const hasError = searchParams.has("error");

  if (hasError) {
    logger.warn("oauth.provider_denied", { provider: "google", organizationId: ctx.organizationId });
    redirect("/settings/integrations?error=access_denied");
  }

  if (!hasCode || !rawStateToken) {
    return jsonError(400, "invalid_callback", "Missing code or state parameter.");
  }

  try {
    const stateRecord = await consumeOAuthState(rawStateToken, "google", ctx.organizationId);

    const configCheck = process.env.GOOGLE_CLIENT_ID?.trim();
    if (!configCheck) {
      throw new OAuthConfigurationRequiredError("google");
    }

    const encryptionKey = process.env.TOKEN_ENCRYPTION_KEY?.trim();
    if (!encryptionKey) {
      throw new OAuthTokenEncryptionNotConfiguredError();
    }

    const adapter = getProviderAdapter("google");
    const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL}/api/integrations/google/callback`;
    const code = searchParams.get("code")!;

    await adapter.exchangeCode({
      code,
      codeVerifier: stateRecord.codeVerifier,
      redirectUri,
      organizationId: ctx.organizationId,
    });

    logger.info("oauth.callback_success", { provider: "google", organizationId: ctx.organizationId });
    redirect(stateRecord.returnPath);
  } catch (error) {
    const response = handleOAuthRouteError(error, { provider: "google", route: "google/callback" });
    if (response.status === 503) {
      redirect(`/settings/integrations?error=configuration_required&provider=google`);
    }
    return response;
  }
}
