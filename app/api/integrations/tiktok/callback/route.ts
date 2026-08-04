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
// TikTok OAuth Callback — /api/integrations/tiktok/callback
//
// Query params from TikTok:
//   ?code=<authorization_code>
//   ?state=<raw_state_token>
//   ?error_code=<code>           (on denial)
//
// Security: same invariants as google/callback.
// ============================================================================

export async function GET(request: NextRequest) {
  const guard = await runOAuthGuard(request);
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const searchParams = request.nextUrl.searchParams;
  const rawStateToken = searchParams.get("state");
  const hasCode = searchParams.has("code");
  const hasError = searchParams.has("error_code");

  if (hasError) {
    logger.warn("oauth.provider_denied", { provider: "tiktok", organizationId: ctx.organizationId });
    redirect("/settings/integrations?error=access_denied");
  }

  if (!hasCode || !rawStateToken) {
    return jsonError(400, "invalid_callback", "Missing code or state parameter.");
  }

  try {
    const stateRecord = await consumeOAuthState(rawStateToken, "tiktok", ctx.organizationId, ctx.userId);

    const configCheck = process.env.TIKTOK_CLIENT_KEY?.trim();
    if (!configCheck) {
      throw new OAuthConfigurationRequiredError("tiktok");
    }

    const encryptionKey = process.env.TOKEN_ENCRYPTION_KEY?.trim();
    if (!encryptionKey) {
      throw new OAuthTokenEncryptionNotConfiguredError();
    }

    const adapter = getProviderAdapter("tiktok");
    const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL}/api/integrations/tiktok/callback`;
    const code = searchParams.get("code")!;

    await adapter.exchangeCode({
      code,
      codeVerifier: stateRecord.codeVerifier,
      redirectUri,
      organizationId: ctx.organizationId,
    });

    logger.info("oauth.callback_success", { provider: "tiktok", organizationId: ctx.organizationId });
    redirect(stateRecord.returnPath);
  } catch (error) {
    const response = handleOAuthRouteError(error, { provider: "tiktok", route: "tiktok/callback" });
    if (response.status === 503) {
      redirect(`/settings/integrations?error=configuration_required&provider=tiktok`);
    }
    return response;
  }
}
