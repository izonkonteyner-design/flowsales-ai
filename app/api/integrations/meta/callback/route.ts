import "server-only";

import type { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { runOAuthGuard, handleOAuthRouteError, jsonError } from "@/server/services/integrations/oauth-route-guard";
import { OAuthConfigurationRequiredError, OAuthTokenEncryptionNotConfiguredError } from "@/server/services/integrations/provider-adapter";
import { consumeOAuthState } from "@/server/services/integrations/oauth-state";
import { exchangeMetaCode, selectMetaMessagingAccount, stageMetaMessagingConnection, type MetaMessagingProvider } from "@/server/services/integrations/meta-messaging-oauth";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const guard = await runOAuthGuard(request);
  if (!guard.ok) return guard.response;
  const { ctx } = guard;
  const searchParams = request.nextUrl.searchParams;
  const rawStateToken = searchParams.get("state");
  const rawProvider = searchParams.get("provider") ?? "facebook";
  if (rawProvider !== "instagram" && rawProvider !== "facebook") return jsonError(400, "invalid_provider", "Meta messaging provider must be instagram or facebook.");
  const provider = rawProvider as MetaMessagingProvider;

  if (searchParams.has("error")) {
    logger.warn("oauth.provider_denied", { provider, organizationId: ctx.organizationId });
    redirect(`/settings/integrations?error=access_denied&provider=${provider}`);
  }
  if (!searchParams.has("code") || !rawStateToken) return jsonError(400, "invalid_callback", "Missing code or state parameter.");

  try {
    const stateRecord = await consumeOAuthState(rawStateToken, provider, ctx.organizationId, ctx.userId);
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
    if (!(process.env.META_CLIENT_ID?.trim() || process.env.META_APP_ID?.trim()) || !siteUrl) throw new OAuthConfigurationRequiredError(provider);
    if (!process.env.TOKEN_ENCRYPTION_KEY?.trim()) throw new OAuthTokenEncryptionNotConfiguredError();

    const redirectUri = `${siteUrl}/api/integrations/meta/callback?provider=${provider}`;
    const token = await exchangeMetaCode({ code: searchParams.get("code")!, redirectUri });
    const staged = await stageMetaMessagingConnection({
      organizationId: ctx.organizationId, userId: ctx.userId, provider,
      userToken: token.accessToken, expiresIn: token.expiresIn,
    });

    // Safe auto-selection is allowed only when discovery returned exactly one eligible account.
    if (staged.candidates.length === 1) {
      await selectMetaMessagingAccount({
        organizationId: ctx.organizationId, userId: ctx.userId, provider,
        externalAccountId: staged.candidates[0].externalId,
      });
      logger.info("oauth.callback_success", { provider, organizationId: ctx.organizationId, accountSelection: "single_candidate" });
      redirect(`${stateRecord.returnPath}${stateRecord.returnPath.includes("?") ? "&" : "?"}connected=${provider}`);
    }

    logger.info("oauth.callback_account_selection_required", { provider, organizationId: ctx.organizationId, candidateCount: staged.candidates.length });
    redirect(`/settings/integrations?select=${provider}`);
  } catch (error) {
    const response = handleOAuthRouteError(error, { provider, route: "meta/callback" });
    if (response.status === 503) redirect(`/settings/integrations?error=configuration_required&provider=${provider}`);
    return response;
  }
}
