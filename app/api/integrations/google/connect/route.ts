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
// Google OAuth Connect — /api/integrations/google/connect
//
// Accepts: ?return_path=/settings/integrations (validated; open redirect safe)
//
// Security:
//   - Auth, workspace, owner/admin, demo block via runOAuthGuard.
//   - CSRF state stored as SHA-256 hash only.
//   - PKCE (S256) supported — code_verifier generated server-side,
//     encrypted and stored in oauth_states; never sent to browser.
//   - If GOOGLE_CLIENT_ID is missing, returns configuration_required.
//   - Open redirect validation on return_path.
// ============================================================================

export async function GET(request: NextRequest) {
  const guard = await runOAuthGuard(request);
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const rawReturnPath = request.nextUrl.searchParams.get("return_path") ?? "/settings/integrations";

  try {
    const returnPath = validateReturnPath(rawReturnPath);

    const configCheck = process.env.GOOGLE_CLIENT_ID?.trim();
    if (!configCheck) {
      throw new OAuthConfigurationRequiredError("google");
    }

    // Generate PKCE code verifier (stored encrypted in oauth_states)
    const usePkce = true;

    const { rawStateToken, codeVerifier } = await createOAuthState(
      "google",
      ctx.organizationId,
      ctx.userId,
      returnPath,
      usePkce,
    );

    const adapter = getProviderAdapter("google");
    const { url } = adapter.buildAuthorizationUrl({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      returnPath,
      codeVerifier,
      stateToken: rawStateToken,
    });

    logger.info("oauth.connect_initiated", {
      provider: "google",
      organizationId: ctx.organizationId,
      pkce: usePkce && codeVerifier !== null,
    });

    redirect(url);
  } catch (error) {
    return handleOAuthRouteError(error, { provider: "google", route: "google/connect" });
  }
}
