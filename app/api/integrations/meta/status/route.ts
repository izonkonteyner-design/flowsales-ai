import { NextRequest } from "next/server";

import { runOAuthGuard } from "@/server/services/integrations/oauth-route-guard";

export async function GET(request: NextRequest) {
  const guard = await runOAuthGuard(request);
  if (!guard.ok) return guard.response;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "";
  const appId = process.env.META_CLIENT_ID?.trim() || process.env.META_APP_ID?.trim() || "";
  const appSecretConfigured = Boolean(process.env.META_CLIENT_SECRET?.trim() || process.env.META_APP_SECRET?.trim());
  const verifyTokenConfigured = Boolean(process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() || process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim());
  const encryptionConfigured = Boolean(process.env.TOKEN_ENCRYPTION_KEY?.trim());
  const whatsappConfigId = process.env.META_EMBEDDED_SIGNUP_CONFIG_ID?.trim() || process.env.NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID?.trim() || "";

  return Response.json({
    configured: Boolean(appId && appSecretConfigured && siteUrl && verifyTokenConfigured && encryptionConfigured),
    appIdConfigured: Boolean(appId),
    appSecretConfigured,
    siteUrlConfigured: Boolean(siteUrl),
    encryptionConfigured,
    verifyTokenConfigured,
    whatsappEmbeddedSignupConfigured: Boolean(whatsappConfigId),
    callbackUrls: siteUrl ? {
      facebook: `${siteUrl}/api/integrations/meta/callback?provider=facebook`,
      instagram: `${siteUrl}/api/integrations/meta/callback?provider=instagram`,
      webhook: `${siteUrl}/api/webhooks/meta-messaging`,
    } : null,
    requestedScopes: {
      facebook: ["pages_show_list", "pages_manage_metadata", "pages_messaging", "pages_read_engagement"],
      instagram: ["pages_show_list", "pages_manage_metadata", "pages_read_engagement", "instagram_basic", "instagram_manage_messages"],
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
