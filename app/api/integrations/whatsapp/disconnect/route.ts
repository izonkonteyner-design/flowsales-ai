import type { NextRequest } from "next/server";
import { runOAuthGuard, jsonError, jsonOk } from "@/server/services/integrations/oauth-route-guard";
import { WhatsAppDisconnectService } from "@/server/services/integrations/whatsapp-disconnect";
import { verifySameOrigin } from "@/server/services/integrations/origin-guard";
import { checkRateLimit } from "@/server/services/integrations/rate-limiter";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest): Promise<Response> {
  // 1. Same-Origin CSRF Check
  if (!verifySameOrigin(request)) {
    logger.warn("whatsapp.disconnect.csrf_mismatch");
    return jsonError(403, "csrf_origin_mismatch", "Cross-site request blocked.");
  }

  // 2. OAuth Route Guard
  const guard = await runOAuthGuard(request);
  if (!guard.ok) {
    return guard.response;
  }
  const { ctx } = guard;

  // 3. Serverless Distributed Rate Limit Check (5 requests per 10 minutes per User & IP)
  const clientIp = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown_ip";
  const rlKey = `${ctx.organizationId}_${ctx.userId}_${clientIp}`;
  const rl = await checkRateLimit(rlKey, "disconnect", 5, 600000);
  if (!rl.allowed) {
    logger.warn("whatsapp.disconnect.rate_limit_exceeded", { organizationId: ctx.organizationId });
    return jsonError(429, "rate_limit_exceeded", "Too many disconnect requests. Please try again later.");
  }

  // 4. Disconnect WhatsApp
  const service = new WhatsAppDisconnectService();
  const result = await service.disconnect(ctx.organizationId, ctx.userId);

  return jsonOk({
    success: result.success,
    status: result.status,
    disconnectedAt: result.disconnectedAt,
    webhookUnsubscribed: result.webhookUnsubscribed,
  });
}
