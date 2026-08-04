import type { NextRequest } from "next/server";
import { runOAuthGuard, jsonError, jsonOk } from "@/server/services/integrations/oauth-route-guard";
import { WhatsAppHealthCheckService } from "@/server/services/integrations/whatsapp-health-check";

export async function POST(request: NextRequest) {
  // 1. Auth, workspace, owner/admin, demo block guard
  const guard = await runOAuthGuard(request);
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const service = new WhatsAppHealthCheckService();
  const result = await service.runHealthCheck(ctx.organizationId);

  if (result.status === 'configuration_required') {
    return jsonError(503, result.errorCode || 'configuration_required', result.errorMessage || 'WhatsApp integration configuration is missing.');
  }

  return jsonOk({
    status: result.status,
    wabaAccess: result.wabaAccess,
    phoneNumberAccess: result.phoneNumberAccess,
    webhookSubscribed: result.webhookSubscribed,
    checkedAt: result.checkedAt,
    errorCode: result.errorCode,
    errorMessage: result.errorMessage,
  });
}
