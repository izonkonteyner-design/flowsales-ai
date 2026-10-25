import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import {
  runOAuthGuard,
  handleOAuthRouteError,
  jsonError,
} from "@/server/services/integrations/oauth-route-guard";
import { checkTikTokQrStatus } from "@/server/services/integrations/tiktok-qr-service";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  const guard = await runOAuthGuard(request);
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return jsonError(403, "forbidden", "Owner or Admin role required to check TikTok integration status.");
  }

  let body: { qrSessionId?: string };
  try {
    body = (await request.json()) as { qrSessionId?: string };
  } catch {
    return jsonError(400, "invalid_request", "Invalid JSON body.");
  }

  if (!body?.qrSessionId || typeof body.qrSessionId !== "string") {
    return jsonError(400, "missing_parameter", "qrSessionId is required.");
  }

  try {
    const result = await checkTikTokQrStatus({
      qrSessionId: body.qrSessionId.trim(),
      organizationId: ctx.organizationId,
      userId: ctx.userId,
    });

    if (result.status === "confirmed") {
      logger.info("tiktok_qr.connection_confirmed", {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        displayName: result.displayName,
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    return handleOAuthRouteError(error, {
      provider: "tiktok",
      route: "/api/integrations/tiktok/qr/status",
    });
  }
}
