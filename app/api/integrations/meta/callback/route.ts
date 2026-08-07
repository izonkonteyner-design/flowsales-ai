import "server-only";

import type { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { runOAuthGuard, handleOAuthRouteError, jsonError } from "@/server/services/integrations/oauth-route-guard";
import { OAuthConfigurationRequiredError, OAuthTokenEncryptionNotConfiguredError, type ChannelProvider } from "@/server/services/integrations/provider-adapter";
import { consumeOAuthState } from "@/server/services/integrations/oauth-state";
import { logger } from "@/lib/logger";
import { exchangeMetaCode } from "@/server/services/integrations/meta-messaging";
import { upsertChannelConnection } from "@/server/services/integrations/channel-connections";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { encryptToken } from "@/server/services/integrations/encryption";

export async function GET(request: NextRequest) {
  const guard = await runOAuthGuard(request);
  if (!guard.ok) return guard.response;
  const { ctx } = guard;
  const searchParams = request.nextUrl.searchParams;
  const rawStateToken = searchParams.get("state");
  const rawProvider = searchParams.get("provider") ?? "facebook";
  const hasCode = searchParams.has("code");
  const hasError = searchParams.has("error");
  const allowedMetaProviders: ChannelProvider[] = ["whatsapp", "instagram", "facebook"];
  if (!allowedMetaProviders.includes(rawProvider as ChannelProvider)) return jsonError(400, "invalid_provider", "provider must be one of: whatsapp, instagram, facebook");
  const provider = rawProvider as ChannelProvider;

  if (hasError) {
    logger.warn("oauth.provider_denied", { provider, organizationId: ctx.organizationId });
    redirect("/settings/integrations?error=access_denied");
  }
  if (!hasCode || !rawStateToken) return jsonError(400, "invalid_callback", "Missing code or state parameter.");

  try {
    const stateRecord = await consumeOAuthState(rawStateToken, provider, ctx.organizationId, ctx.userId);
    if (!process.env.META_APP_ID?.trim() && !process.env.NEXT_PUBLIC_META_APP_ID?.trim()) throw new OAuthConfigurationRequiredError(provider);
    if (!process.env.TOKEN_ENCRYPTION_KEY?.trim()) throw new OAuthTokenEncryptionNotConfiguredError();
    if (provider === "whatsapp") redirect(stateRecord.returnPath);

    const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL}/api/integrations/meta/callback?provider=${provider}`;
    const exchanged = await exchangeMetaCode(searchParams.get("code")!, redirectUri);
    const connection = await upsertChannelConnection({
      organizationId: ctx.organizationId,
      provider,
      status: "connecting",
      displayName: provider === "instagram" ? "Instagram" : "Facebook Messenger",
      externalAccountId: null,
      scopes: provider === "instagram" ? ["instagram_basic", "instagram_manage_messages"] : ["pages_manage_metadata", "pages_messaging"],
      createdByUserId: ctx.userId,
    });
    if ("error" in connection) throw new Error(connection.error);

    const admin = createSupabaseAdminClient();
    const expiresAt = exchanged.expiresIn ? new Date(Date.now() + exchanged.expiresIn * 1000).toISOString() : null;
    const { error: tokenError } = await admin.from("integration_tokens").upsert({
      organization_id: ctx.organizationId,
      connection_id: connection.id,
      provider,
      access_token_cipher: encryptToken(exchanged.accessToken),
      refresh_token_cipher: null,
      token_type: "bearer",
      expires_at: expiresAt,
      scopes: provider === "instagram" ? ["instagram_basic", "instagram_manage_messages"] : ["pages_manage_metadata", "pages_messaging"],
      updated_at: new Date().toISOString(),
    }, { onConflict: "connection_id" });
    if (tokenError) throw new Error("Failed to persist encrypted Meta OAuth token.");

    logger.info("oauth.callback_asset_selection_required", { provider, organizationId: ctx.organizationId });
    redirect(`/settings/integrations/meta-assets?provider=${provider}`);
  } catch (error) {
    const response = handleOAuthRouteError(error, { provider, route: "meta/callback" });
    if (response.status === 503) redirect(`/settings/integrations?error=configuration_required&provider=${provider}`);
    return response;
  }
}
