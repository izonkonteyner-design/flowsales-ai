import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import {
  runOAuthGuard,
  handleOAuthRouteError,
  jsonError,
} from "@/server/services/integrations/oauth-route-guard";
import { initiateTikTokQrSession } from "@/server/services/integrations/tiktok-qr-service";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  const guard = await runOAuthGuard(request);
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return jsonError(403, "forbidden", "Owner or Admin role required to manage TikTok integrations.");
  }

  try {
    const result = await initiateTikTokQrSession({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
    });

    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }

    logger.info("tiktok_qr.session_initiated", {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      qrSessionId: result.qrSessionId,
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleOAuthRouteError(error, {
      provider: "tiktok",
      route: "/api/integrations/tiktok/qr/initiate",
    });
  }
}
