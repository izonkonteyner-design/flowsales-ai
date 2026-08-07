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
      switch (result.errorCode) {
        case "template_required":
          return NextResponse.json({ error: "template_required", message: result.message }, { status: 400 });
        case "connection_required":
          return NextResponse.json({ error: "connection_required", message: result.message }, { status: 400 });
        case "invalid_input":
          return NextResponse.json({ error: "invalid_input", message: result.message }, { status: 400 });
        case "unauthorized":
          return NextResponse.json({ error: "unauthorized", message: result.message }, { status: 403 });
        case "not_found":
          return NextResponse.json({ error: "not_found", message: result.message }, { status: 404 });
        case "rate_limit_exceeded":
          return NextResponse.json({ error: "rate_limit_exceeded", message: result.message }, { status: 429 });
        case "rate_limit_unavailable":
          return NextResponse.json({ error: "rate_limit_unavailable", message: result.message }, { status: 503 });
        case "unsupported_provider":
          return NextResponse.json({ error: "unsupported_provider", message: result.message }, { status: 400 });
        case "send_failed":
        default:
          return NextResponse.json({ error: "send_failed", message: result.message }, { status: 502 });
      }
    }
    return NextResponse.json(result.data, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: "internal_error", message }, { status: 500 });
  }
}
