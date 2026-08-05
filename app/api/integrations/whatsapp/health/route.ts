import type { NextRequest } from "next/server";
import { runOAuthGuard, jsonError, jsonOk } from "@/server/services/integrations/oauth-route-guard";
import { WhatsAppHealthCheckService } from "@/server/services/integrations/whatsapp-health-check";
import { verifySameOrigin } from "@/server/services/integrations/origin-guard";
import { checkRateLimit, hashIp } from "@/server/services/integrations/rate-limiter";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest): Promise<Response> {
  // 1. Same-Origin CSRF Check
  if (!verifySameOrigin(request)) {
    logger.warn("whatsapp.health.csrf_mismatch");
    return jsonError(403, "csrf_origin_mismatch", "Cross-site request blocked.");
  }

  // 2. OAuth Route Guard
  const guard = await runOAuthGuard(request);
  if (!guard.ok) {
    return guard.response;
  }
  const { ctx } = guard;

  // 3. Rate Limit Check (10 requests per minute per IP & User)
  const clientIp = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown_ip";
  const rateLimitKey = `health_${ctx.organizationId}_${ctx.userId}_${hashIp(clientIp)}`;
  const rl = checkRateLimit(rateLimitKey, 10, 60000);
  if (!rl.allowed) {
    logger.warn("whatsapp.health.rate_limit_exceeded", { organizationId: ctx.organizationId });
    return jsonError(429, "rate_limit_exceeded", "Too many health check requests. Please try again later.");
  }

  // 4. Run Health Check
  const service = new WhatsAppHealthCheckService();
  const result = await service.runHealthCheck(ctx.organizationId);

  return jsonOk({
    status: result.status,
    wabaAccess: result.wabaAccess,
    phoneNumberAccess: result.phoneNumberAccess,
    webhookSubscribed: result.webhookSubscribed,
    checkedAt: result.checkedAt,
    ...(result.errorCode ? { errorCode: result.errorCode } : {}),
  });
}
