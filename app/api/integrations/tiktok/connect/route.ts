import "server-only";

import { NextResponse, type NextRequest } from "next/server";
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
// TikTok OAuth Connect — /api/integrations/tiktok/connect
//
// Accepts: ?return_path=/settings/integrations
//
// Security: same invariants as google/connect; PKCE (S256) supported.
// ============================================================================

export async function GET(request: NextRequest) {
  const guard = await runOAuthGuard(request);
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const rawReturnPath = request.nextUrl.searchParams.get("return_path") ?? "/settings/integrations";

  try {
    const returnPath = validateReturnPath(rawReturnPath);

    const configCheck =
      process.env.TIKTOK_CLIENT_KEY?.trim() ||
      process.env.TIKTOK_CLIENT_ID?.trim() ||
      process.env.TIKTOK_APP_ID?.trim();
    if (!configCheck) {
      throw new OAuthConfigurationRequiredError("tiktok");
    }

    const { rawStateToken, codeVerifier } = await createOAuthState(
      "tiktok",
      ctx.organizationId,
      ctx.userId,
      returnPath,
      true, // TikTok supports PKCE
    );

    const adapter = getProviderAdapter("tiktok");
    const { url } = adapter.buildAuthorizationUrl({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      returnPath,
      codeVerifier,
      stateToken: rawStateToken,
    });

    logger.info("oauth.connect_initiated", {
      provider: "tiktok",
      organizationId: ctx.organizationId,
      pkce: codeVerifier !== null,
    });

    return NextResponse.redirect(url);
  } catch (error) {
    return handleOAuthRouteError(error, { provider: "tiktok", route: "tiktok/connect" });
  }
}
