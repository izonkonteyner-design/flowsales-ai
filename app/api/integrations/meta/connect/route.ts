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
  validateReturnPath,
  OAuthConfigurationRequiredError,
  type ChannelProvider,
} from "@/server/services/integrations/provider-adapter";
import { createOAuthState } from "@/server/services/integrations/oauth-state";
import { logger } from "@/lib/logger";

// ============================================================================
// Meta OAuth Connect — /api/integrations/meta/connect
//
// Accepts: ?provider=whatsapp|instagram|facebook  (default: facebook)
//          ?return_path=/settings/integrations   (validated; open redirect safe)
//
// Security:
//   - Auth, workspace, owner/admin, demo block via runOAuthGuard.
//   - CSRF state stored as SHA-256 hash only; raw token embedded in URL.
//   - PKCE not applicable for Meta (no PKCE support in v20 dialog).
//   - If META_CLIENT_ID is missing, returns configuration_required JSON.
//   - Open redirect validation on return_path.
// ============================================================================

export async function GET(request: NextRequest) {
  const guard = await runOAuthGuard(request);
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const searchParams = request.nextUrl.searchParams;
  const rawProvider = searchParams.get("provider") ?? "facebook";
  const rawReturnPath = searchParams.get("return_path") ?? "/settings/integrations";

  // Validate provider value
  const allowedMetaProviders: ChannelProvider[] = ["whatsapp", "instagram", "facebook"];
  if (!allowedMetaProviders.includes(rawProvider as ChannelProvider)) {
    return jsonError(400, "invalid_provider", "provider must be one of: whatsapp, instagram, facebook");
  }

  const provider = rawProvider as ChannelProvider;

  try {
    // Validate return path (open redirect protection)
    const returnPath = validateReturnPath(rawReturnPath);

    // Check configuration before generating state
    const adapter = getProviderAdapter(provider);
    // Attempt to verify config is present by calling assertConfigured indirectly
    const configCheck = process.env.META_CLIENT_ID?.trim();
    if (!configCheck) {
      throw new OAuthConfigurationRequiredError(provider);
    }

    // Generate OAuth state (no PKCE for Meta)
    const { rawStateToken } = await createOAuthState(
      provider,
      ctx.organizationId,
      ctx.userId,
      returnPath,
      false, // Meta does not support PKCE
    );

    // Build authorization URL
    const { url } = adapter.buildAuthorizationUrl({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      returnPath,
      codeVerifier: null,
      stateToken: rawStateToken,
    });

    logger.info("oauth.connect_initiated", {
      provider,
      organizationId: ctx.organizationId,
    });

    // Redirect user to Meta OAuth dialog
    redirect(url);
  } catch (error) {
    return handleOAuthRouteError(error, { provider, route: "meta/connect" });
  }
}
