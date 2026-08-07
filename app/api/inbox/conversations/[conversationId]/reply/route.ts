import { NextRequest, NextResponse } from "next/server";
import { loadWorkspaceContext } from "@/server/services/workspace-context";
import { sendOmnichannelReply } from "@/server/services/integrations/omnichannel-outbound";
import { recordWhatsAppAuditEvent } from "@/server/services/whatsapp-audit";

interface RouteParams {
  params: Promise<{ conversationId: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { conversationId } = await params;
    if (!conversationId) return NextResponse.json({ error: "invalid_input", message: "Conversation ID is required." }, { status: 400 });
    const ctx = await loadWorkspaceContext();
    if (!ctx || !ctx.userId) return NextResponse.json({ error: "unauthorized", message: "Authentication required." }, { status: 401 });
    if (ctx.mode === "demo" || ctx.role === "viewer") return NextResponse.json({ error: "unauthorized", message: "Read-only access." }, { status: 403 });

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return NextResponse.json({ error: "invalid_input", message: "Invalid JSON request body." }, { status: 400 });
    const { text, clientIdempotencyKey } = body as { text?: string; clientIdempotencyKey?: string };

    const result = await sendOmnichannelReply({
      organizationId: ctx.organization.id,
      userId: ctx.userId,
      userRole: ctx.role,
      conversationId,
      text: typeof text === "string" ? text : "",
      clientIdempotencyKey: typeof clientIdempotencyKey === "string" ? clientIdempotencyKey : "",
    });

    await recordWhatsAppAuditEvent({
      organizationId: ctx.organization.id,
      conversationId,
      messageId: result.data?.messageId ?? null,
      actorUserId: ctx.userId,
      eventType: result.success ? "message_sent" : "message_failed",
      metadata: result.success ? { status: result.data?.status ?? "sent", omnichannel: true } : { errorCode: result.errorCode ?? "send_failed", omnichannel: true },
    });

    if (!result.success) {
      const status = result.errorCode === "unauthorized" ? 403
        : result.errorCode === "not_found" ? 404
        : result.errorCode === "rate_limit_exceeded" ? 429
        : result.errorCode === "rate_limit_unavailable" ? 503
        : result.errorCode === "send_failed" ? 502 : 400;
      return NextResponse.json({ error: result.errorCode ?? "send_failed", message: result.message }, { status });
    }
    return NextResponse.json(result.data, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: "internal_error", message }, { status: 500 });
  }
}
