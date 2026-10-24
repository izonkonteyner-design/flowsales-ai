import "server-only";

import type { NextRequest } from "next/server";
import { runOAuthGuard, jsonError, jsonOk, handleOAuthRouteError } from "@/server/services/integrations/oauth-route-guard";
import { verifySameOrigin } from "@/server/services/integrations/origin-guard";
import { checkRateLimit, DistributedRateLimitUnavailableError } from "@/server/services/integrations/rate-limiter";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { decryptToken } from "@/server/services/integrations/encryption";
import { WhatsAppHealthCheckService } from "@/server/services/integrations/whatsapp-health-check";
import { resolveWorkspaceGoogleCalendarAuth } from "@/server/services/integrations/google-calendar";
import { type ChannelProvider } from "@/server/services/integrations/provider-adapter";
import { logger } from "@/lib/logger";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION?.trim() || "v26.0";

type RouteProps = {
  params: Promise<{ provider: string }>;
};

export async function POST(request: NextRequest, props: RouteProps): Promise<Response> {
  const { provider: rawProvider } = await props.params;
  const validProviders: ChannelProvider[] = ["whatsapp", "instagram", "facebook", "google", "tiktok", "youtube"];

  if (!validProviders.includes(rawProvider as ChannelProvider)) {
    return jsonError(400, "invalid_provider", `Unsupported provider: ${rawProvider}`);
  }

  const provider = rawProvider as ChannelProvider;

  try {
    if (!verifySameOrigin(request)) {
      return jsonError(403, "csrf_origin_mismatch", "Cross-site request blocked.");
    }

    const guard = await runOAuthGuard(request);
    if (!guard.ok) return guard.response;
    const { ctx } = guard;

    const clientIp = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown_ip";
    const rl = await checkRateLimit(`${ctx.organizationId}_${ctx.userId}_${clientIp}`, `${provider}_test`, 15, 60000);
    if (!rl.allowed) {
      return jsonError(429, "rate_limit_exceeded", "Too many diagnostic requests. Please wait a moment.");
    }

    const admin = createSupabaseAdminClient();
    const { data: connection } = await admin
      .from("channel_connections")
      .select("id, status, display_name, external_account_id, scopes, last_synced_at")
      .eq("organization_id", ctx.organizationId)
      .eq("provider", provider)
      .maybeSingle();

    if (!connection || connection.status !== "connected") {
      return jsonOk({
        ok: false,
        connected: false,
        provider,
        status: connection?.status || "not_connected",
        message: "Channel is not connected yet.",
        testedAt: new Date().toISOString(),
      });
    }

    // Retrieve encrypted token
    const { data: tokenRow } = await admin
      .from("integration_tokens")
      .select("access_token_cipher, expires_at")
      .eq("organization_id", ctx.organizationId)
      .eq("connection_id", connection.id)
      .maybeSingle();

    if (provider === "whatsapp") {
      const healthService = new WhatsAppHealthCheckService();
      const health = await healthService.runHealthCheck(ctx.organizationId);
      const isHealthy = health.status === "healthy";
      return jsonOk({
        ok: isHealthy,
        connected: true,
        provider,
        status: health.status,
        displayName: connection.display_name,
        testedAt: health.checkedAt,
        message: isHealthy ? "WhatsApp Business Cloud API active and verified." : "WhatsApp connection degraded.",
        details: {
          wabaAccess: health.wabaAccess,
          phoneNumberAccess: health.phoneNumberAccess,
          webhookSubscribed: health.webhookSubscribed,
        },
      });
    }

    if (provider === "facebook" || provider === "instagram") {
      if (!tokenRow?.access_token_cipher) {
        return jsonOk({
          ok: false,
          connected: true,
          provider,
          status: "error",
          message: "Stored access token is missing or not encrypted.",
          testedAt: new Date().toISOString(),
        });
      }

      const token = decryptToken(tokenRow.access_token_cipher);
      const targetUrl =
        provider === "instagram"
          ? "https://graph.instagram.com/me?fields=id,username"
          : `https://graph.facebook.com/${GRAPH_VERSION}/me?fields=id,name`;

      let probeRes: Response;
      try {
        probeRes = await fetch(targetUrl, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
      } catch (networkErr) {
        return jsonOk({
          ok: false,
          connected: true,
          provider,
          status: "error",
          message: `Network error connecting to Meta Graph API: ${networkErr instanceof Error ? networkErr.message : String(networkErr)}`,
          testedAt: new Date().toISOString(),
        });
      }

      const isLiveOk = probeRes.ok;
      return jsonOk({
        ok: isLiveOk,
        connected: true,
        provider,
        status: isLiveOk ? "healthy" : "expired",
        displayName: connection.display_name,
        testedAt: new Date().toISOString(),
        message: isLiveOk
          ? `${provider === "instagram" ? "Instagram" : "Facebook"} API connection verified and active.`
          : `Meta API returned status ${probeRes.status}. Please reconnect the account.`,
      });
    }

    if (provider === "google") {
      const auth = await resolveWorkspaceGoogleCalendarAuth(ctx.organizationId);
      if (!auth.ok) {
        return jsonOk({
          ok: false,
          connected: true,
          provider,
          status: "error",
          message: auth.errorMessage,
          testedAt: new Date().toISOString(),
        });
      }

      let calRes: Response;
      try {
        calRes = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1", {
          headers: { Authorization: `Bearer ${auth.accessToken}` },
          cache: "no-store",
        });
      } catch (err) {
        return jsonOk({
          ok: false,
          connected: true,
          provider,
          status: "error",
          message: `Google API network error: ${err instanceof Error ? err.message : String(err)}`,
          testedAt: new Date().toISOString(),
        });
      }

      const isOk = calRes.ok;
      return jsonOk({
        ok: isOk,
        connected: true,
        provider,
        status: isOk ? "healthy" : "expired",
        displayName: connection.display_name,
        testedAt: new Date().toISOString(),
        message: isOk
          ? "Google Calendar & Business Profile connection active and verified."
          : `Google API returned status ${calRes.status}.`,
      });
    }

    if (provider === "youtube") {
      if (!tokenRow?.access_token_cipher) {
        return jsonOk({
          ok: false,
          connected: true,
          provider,
          status: "error",
          message: "Stored access token is missing or not encrypted.",
          testedAt: new Date().toISOString(),
        });
      }

      const token = decryptToken(tokenRow.access_token_cipher);
      let ytRes: Response;
      try {
        ytRes = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
      } catch (err) {
        return jsonOk({
          ok: false,
          connected: true,
          provider,
          status: "error",
          message: `YouTube API network error: ${err instanceof Error ? err.message : String(err)}`,
          testedAt: new Date().toISOString(),
        });
      }

      const isOk = ytRes.ok;
      return jsonOk({
        ok: isOk,
        connected: true,
        provider,
        status: isOk ? "healthy" : "expired",
        displayName: connection.display_name,
        testedAt: new Date().toISOString(),
        message: isOk
          ? "YouTube Channel API connection active and verified."
          : `YouTube API returned status ${ytRes.status}.`,
      });
    }

    if (provider === "tiktok") {
      const isExpired = tokenRow?.expires_at ? new Date(tokenRow.expires_at) < new Date() : false;
      return jsonOk({
        ok: !isExpired,
        connected: true,
        provider,
        status: isExpired ? "expired" : "healthy",
        displayName: connection.display_name,
        testedAt: new Date().toISOString(),
        message: isExpired
          ? "TikTok token has expired. Please reconnect."
          : "TikTok connection record active.",
      });
    }

    return jsonOk({
      ok: true,
      connected: true,
      provider,
      status: "healthy",
      testedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof DistributedRateLimitUnavailableError) {
      return jsonError(503, "rate_limit_unavailable", "Request protection is temporarily unavailable.");
    }
    logger.error("integration.test_connection_error", {
      provider,
      error: error instanceof Error ? error.message : String(error),
    });
    return handleOAuthRouteError(error, { provider, route: `/api/integrations/${provider}/test` });
  }
}
