import "server-only";

import type { NextRequest } from "next/server";
import { runOAuthGuard, jsonError, handleOAuthRouteError } from "@/server/services/integrations/oauth-route-guard";
import { verifySameOrigin } from "@/server/services/integrations/origin-guard";
import { checkRateLimit, DistributedRateLimitUnavailableError } from "@/server/services/integrations/rate-limiter";
import { revokeChannelConnection } from "@/server/services/integrations/channel-connections";

export async function POST(request: NextRequest): Promise<Response> {
  try {
    if (!verifySameOrigin(request)) return jsonError(403, "csrf_origin_mismatch", "Cross-site request blocked.");
    const guard = await runOAuthGuard(request);
    if (!guard.ok) return guard.response;
    const { ctx } = guard;

    const clientIp = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown_ip";
    const rl = await checkRateLimit(`${ctx.organizationId}_${ctx.userId}_${clientIp}`, "tiktok_disconnect", 5, 600000);
    if (!rl.allowed) return jsonError(429, "rate_limit_exceeded", "Too many disconnect requests. Please try again later.");

    const form = await request.formData();
    const connectionId = form.get("connectionId");
    if (typeof connectionId !== "string" || !connectionId) return jsonError(400, "invalid_input", "Connection ID is required.");

    await revokeChannelConnection(connectionId, ctx.organizationId, ctx.userId);
    return Response.redirect(new URL("/settings/integrations?disconnected=tiktok", request.url), 303);
  } catch (error) {
    if (error instanceof DistributedRateLimitUnavailableError) return jsonError(503, "rate_limit_unavailable", "Request protection is temporarily unavailable.");
    return handleOAuthRouteError(error, { provider: "tiktok", route: "/api/integrations/tiktok/disconnect" });
  }
}
