import "server-only";

import type { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { runOAuthGuard, handleOAuthRouteError, jsonError } from "@/server/services/integrations/oauth-route-guard";
import { getProviderAdapter, validateReturnPath, OAuthConfigurationRequiredError, type ChannelProvider } from "@/server/services/integrations/provider-adapter";
import { createOAuthState } from "@/server/services/integrations/oauth-state";
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
    const adapter = getProviderAdapter(provider);
    const configCheck = process.env.META_CLIENT_ID?.trim() || process.env.META_APP_ID?.trim() || process.env.NEXT_PUBLIC_META_APP_ID?.trim();
    if (!configCheck) throw new OAuthConfigurationRequiredError(provider);
    const { rawStateToken } = await createOAuthState(provider, ctx.organizationId, ctx.userId, returnPath, false);
    const built = adapter.buildAuthorizationUrl({ organizationId: ctx.organizationId, userId: ctx.userId, returnPath, codeVerifier: null, stateToken: rawStateToken });
    const authorizationUrl = new URL(built.url);
    // Keep provider in the registered callback query so the callback can validate it against the stored state.
    authorizationUrl.searchParams.set("redirect_uri", `${process.env.NEXT_PUBLIC_SITE_URL}/api/integrations/meta/callback?provider=${provider}`);
    logger.info("oauth.connect_initiated", { provider, organizationId: ctx.organizationId });
    redirect(authorizationUrl.toString());
  } catch (error) {
    return handleOAuthRouteError(error, { provider, route: "meta/connect" });
  }
}
