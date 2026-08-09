import "server-only";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { runOAuthGuard, handleOAuthRouteError, jsonError } from "@/server/services/integrations/oauth-route-guard";
import { validateReturnPath, OAuthConfigurationRequiredError, type ChannelProvider } from "@/server/services/integrations/provider-adapter";
import { createOAuthState } from "@/server/services/integrations/oauth-state";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const guard = await runOAuthGuard(request);
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const rawProvider = request.nextUrl.searchParams.get("provider") ?? "facebook";
  const rawReturnPath = request.nextUrl.searchParams.get("return_path") ?? "/settings/integrations";
  const allowed: ChannelProvider[] = ["instagram", "facebook"];
  if (!allowed.includes(rawProvider as ChannelProvider)) return jsonError(400, "invalid_provider", "Meta messaging provider must be instagram or facebook.");
  const provider = rawProvider as "instagram" | "facebook";

  try {
    const returnPath = validateReturnPath(rawReturnPath);
    const clientId = provider === "instagram"
      ? process.env.INSTAGRAM_APP_ID?.trim() || process.env.META_INSTAGRAM_APP_ID?.trim() || process.env.META_CLIENT_ID?.trim() || process.env.META_APP_ID?.trim()
      : process.env.META_CLIENT_ID?.trim() || process.env.META_APP_ID?.trim();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
    if (!clientId || !siteUrl) throw new OAuthConfigurationRequiredError(provider);

    const { rawStateToken } = await createOAuthState(provider, ctx.organizationId, ctx.userId, returnPath, false);
    const redirectUri = provider === "instagram"
      ? `${siteUrl}/api/integrations/meta/callback/instagram`
      : `${siteUrl}/api/integrations/meta/callback?provider=facebook`;

    let oauth: URL;
    if (provider === "instagram") {
      oauth = new URL("https://www.instagram.com/oauth/authorize");
      oauth.searchParams.set("client_id", clientId);
      oauth.searchParams.set("redirect_uri", redirectUri);
      oauth.searchParams.set("scope", [
        "instagram_business_basic",
        "instagram_business_manage_messages",
        "instagram_business_manage_comments",
      ].join(","));
      oauth.searchParams.set("state", rawStateToken);
      oauth.searchParams.set("response_type", "code");
      oauth.searchParams.set("force_reauth", "true");
    } else {
      const scopes = ["pages_show_list", "pages_manage_metadata", "pages_messaging", "pages_read_engagement"];
      oauth = new URL(`https://www.facebook.com/${process.env.META_GRAPH_VERSION?.trim() || "v26.0"}/dialog/oauth`);
      oauth.searchParams.set("client_id", clientId);
      oauth.searchParams.set("redirect_uri", redirectUri);
      oauth.searchParams.set("scope", scopes.join(","));
      oauth.searchParams.set("state", rawStateToken);
      oauth.searchParams.set("response_type", "code");
    }

    logger.info("oauth.connect_initiated", { provider, organizationId: ctx.organizationId });
    return NextResponse.redirect(oauth);
  } catch (error) {
    return handleOAuthRouteError(error, { provider, route: "meta/connect" });
  }
}
