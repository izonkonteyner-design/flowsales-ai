import type { NextRequest } from "next/server";
import { runOAuthGuard, jsonOk } from "@/server/services/integrations/oauth-route-guard";
import { WhatsAppDisconnectService } from "@/server/services/integrations/whatsapp-disconnect";

export async function POST(request: NextRequest) {
  // 1. Auth, workspace, owner/admin, demo block guard
  const guard = await runOAuthGuard(request);
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const service = new WhatsAppDisconnectService();
  const result = await service.disconnect(ctx.organizationId, ctx.userId);

  return jsonOk({
    success: true,
    status: result.status,
    disconnectedAt: result.disconnectedAt,
    webhookUnsubscribed: result.webhookUnsubscribed,
  });
}
