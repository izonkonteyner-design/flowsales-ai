import "server-only";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { runOAuthGuard, handleOAuthRouteError, jsonError } from "@/server/services/integrations/oauth-route-guard";
import { OAuthConfigurationRequiredError, OAuthTokenEncryptionNotConfiguredError } from "@/server/services/integrations/provider-adapter";
import { consumeOAuthState } from "@/server/services/integrations/oauth-state";
import { exchangeMetaCode, selectMetaMessagingAccount, stageMetaMessagingConnection } from "@/server/services/integrations/meta-messaging-oauth";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const guard = await runOAuthGuard(request);
  if (!guard.ok) return guard.response;
  const { ctx } = guard;
  const provider = "instagram" as const;
  const searchParams = request.nextUrl.searchParams;
  const rawStateToken = searchParams.get("state");

  if (searchParams.has("error")) {
    logger.warn("oauth.provider_denied", { provider, organizationId: ctx.organizationId });
    return NextResponse.redirect(new URL("/settings/integrations?error=access_denied&provider=instagram", request.url));
  }
  if (!searchParams.has("code") || !rawStateToken) return jsonError(400, "invalid_callback", "Missing code or state parameter.");

  try {
    const stateRecord = await consumeOAuthState(rawStateToken, provider, ctx.organizationId, ctx.userId);
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
    const clientId = process.env.INSTAGRAM_APP_ID?.trim() || process.env.META_INSTAGRAM_APP_ID?.trim() || process.env.META_CLIENT_ID?.trim() || process.env.META_APP_ID?.trim();
    if (!clientId || !siteUrl) throw new OAuthConfigurationRequiredError(provider);
    if (!process.env.TOKEN_ENCRYPTION_KEY?.trim()) throw new OAuthTokenEncryptionNotConfiguredError();

    const redirectUri = `${siteUrl}/api/integrations/meta/callback/instagram`;
    const token = await exchangeMetaCode({ provider, code: searchParams.get("code")!, redirectUri });
    const staged = await stageMetaMessagingConnection({ organizationId: ctx.organizationId, userId: ctx.userId, provider, userToken: token.accessToken, expiresIn: token.expiresIn });

    if (staged.candidates.length === 1) {
      await selectMetaMessagingAccount({ organizationId: ctx.organizationId, userId: ctx.userId, provider, externalAccountId: staged.candidates[0].externalId });
      logger.info("oauth.callback_success", { provider, organizationId: ctx.organizationId, accountSelection: "single_candidate" });
      const target = `${stateRecord.returnPath}${stateRecord.returnPath.includes("?") ? "&" : "?"}connected=instagram`;
      return NextResponse.redirect(new URL(target, request.url));
    }

    logger.info("oauth.callback_account_selection_required", { provider, organizationId: ctx.organizationId, candidateCount: staged.candidates.length });
    return NextResponse.redirect(new URL("/settings/integrations/meta-select?provider=instagram", request.url));
  } catch (error) {
    const response = handleOAuthRouteError(error, { provider, route: "meta/callback/instagram" });
    if (response.status === 503) {
      return NextResponse.redirect(new URL("/settings/integrations?error=configuration_required&provider=instagram", request.url));
    }
    return response;
  }
}
