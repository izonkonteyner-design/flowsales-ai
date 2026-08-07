import "server-only";

import type { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { runOAuthGuard, handleOAuthRouteError, jsonError } from "@/server/services/integrations/oauth-route-guard";
import { validateReturnPath, OAuthConfigurationRequiredError, type ChannelProvider } from "@/server/services/integrations/provider-adapter";
import { createOAuthState } from "@/server/services/integrations/oauth-state";
import { getWhatsAppConfig } from "@/server/services/integrations/whatsapp-config";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const guard = await runOAuthGuard(request);
  if (!guard.ok) return guard.response;
  const { ctx } = guard;
  const searchParams = request.nextUrl.searchParams;
  const rawProvider = searchParams.get("provider") ?? "facebook";
  const rawReturnPath = searchParams.get("return_path") ?? "/settings/integrations";
  const allowedMetaProviders: ChannelProvider[] = ["whatsapp", "instagram", "facebook"];
  if (!allowedMetaProviders.includes(rawProvider as ChannelProvider)) return jsonError(400, "invalid_provider", "provider must be one of: whatsapp, instagram, facebook");
  const provider = rawProvider as ChannelProvider;

  try {
    const returnPath = validateReturnPath(rawReturnPath);
    const config = getWhatsAppConfig();
    if (!config.appId || !config.appSecret || !config.siteUrl) throw new OAuthConfigurationRequiredError(provider);
    const { rawStateToken } = await createOAuthState(provider, ctx.organizationId, ctx.userId, returnPath, false);
    const redirectUri = `${config.siteUrl}/api/integrations/meta/callback?provider=${provider}`;
    const scopes: Record<"instagram" | "facebook" | "whatsapp", string[]> = {
      instagram: ["pages_show_list", "pages_manage_metadata", "instagram_basic", "instagram_manage_messages"],
      facebook: ["pages_show_list", "pages_manage_metadata", "pages_messaging"],
      whatsapp: ["whatsapp_business_management", "whatsapp_business_messaging"],
    };
    const authorizationUrl = new URL("https://www.facebook.com/v21.0/dialog/oauth");
    authorizationUrl.searchParams.set("client_id", config.appId);
    authorizationUrl.searchParams.set("redirect_uri", redirectUri);
    authorizationUrl.searchParams.set("scope", scopes[provider].join(","));
    authorizationUrl.searchParams.set("state", rawStateToken);
    authorizationUrl.searchParams.set("response_type", "code");
    logger.info("oauth.connect_initiated", { provider, organizationId: ctx.organizationId });
    redirect(authorizationUrl.toString());
  } catch (error) {
    return handleOAuthRouteError(error, { provider, route: "meta/connect" });
  }
}
