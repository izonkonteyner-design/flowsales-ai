import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import {
  runOAuthGuard,
  jsonError,
} from "@/server/services/integrations/oauth-route-guard";
import { cancelTikTokQrSession } from "@/server/services/integrations/tiktok-qr-service";

export async function POST(request: NextRequest) {
  const guard = await runOAuthGuard(request);
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  let body: { qrSessionId?: string };
  try {
    body = (await request.json()) as { qrSessionId?: string };
  } catch {
    return jsonError(400, "invalid_request", "Invalid JSON body.");
  }

  if (body?.qrSessionId) {
    try {
      await cancelTikTokQrSession({
        qrSessionId: body.qrSessionId.trim(),
        organizationId: ctx.organizationId,
        userId: ctx.userId,
      });
    } catch {
      // Best-effort session cancellation
    }
  }

  return NextResponse.json({ ok: true });
}
