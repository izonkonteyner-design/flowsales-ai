import "server-only";

import type { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import {
  runOAuthGuard,
  handleOAuthRouteError,
} from "@/server/services/integrations/oauth-route-guard";
import {
  getProviderAdapter,
  validateReturnPath,
  OAuthConfigurationRequiredError,
} from "@/server/services/integrations/provider-adapter";
import { createOAuthState } from "@/server/services/integrations/oauth-state";
import { logger } from "@/lib/logger";

// ============================================================================
// YouTube OAuth Connect — /api/integrations/youtube/connect
//
// Accepts: ?return_path=/settings/integrations (validated; open redirect safe)
//
// Security:
//   - Auth, workspace, owner/admin, demo block via runOAuthGuard.
//   - CSRF state stored as SHA-256 hash only.
//   - PKCE (S256) supported — code_verifier generated server-side,
//     encrypted and stored in oauth_states; never sent to browser.
//   - If YOUTUBE_CLIENT_ID / GOOGLE_CLIENT_ID is missing, returns configuration_required.
//   - Open redirect validation on return_path.
// ============================================================================

export async function GET(request: NextRequest) {
  const guard = await runOAuthGuard(request);
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const rawReturnPath = request.nextUrl.searchParams.get("return_path") ?? "/settings/integrations";

  try {
    const returnPath = validateReturnPath(rawReturnPath);

    const configCheck = process.env.YOUTUBE_CLIENT_ID?.trim() || process.env.GOOGLE_CLIENT_ID?.trim();
    if (!configCheck) {
      throw new OAuthConfigurationRequiredError("youtube");
    }

    const usePkce = true;

    const { rawStateToken, codeVerifier } = await createOAuthState(
      "youtube",
      ctx.organizationId,
      ctx.userId,
      returnPath,
      usePkce,
    );

    const adapter = getProviderAdapter("youtube");
    const { url } = adapter.buildAuthorizationUrl({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      returnPath,
      codeVerifier,
      stateToken: rawStateToken,
    });

    logger.info("oauth.connect_initiated", {
      provider: "youtube",
      organizationId: ctx.organizationId,
      pkce: usePkce && codeVerifier !== null,
    });

    redirect(url);
  } catch (error) {
    return handleOAuthRouteError(error, { provider: "youtube", route: "youtube/connect" });
  }
}
