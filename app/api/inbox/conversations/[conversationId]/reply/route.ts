import { NextRequest, NextResponse } from "next/server";
import { loadWorkspaceContext } from "@/server/services/workspace-context";
import { WhatsAppOutboundService } from "@/server/services/integrations/whatsapp-outbound";
import { sendMetaMessagingReply } from "@/server/services/integrations/meta-messaging";
import { recordWhatsAppAuditEvent } from "@/server/services/whatsapp-audit";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";

interface RouteParams { params: Promise<{ conversationId: string }> }

function outboundErrorStatus(code: string): number {
  switch (code) {
    case "template_required":
    case "connection_required":
    case "invalid_input":
      return 400;
    case "unauthorized":
      return 403;
    case "not_found":
      return 404;
    case "rate_limit_exceeded":
      return 429;
    case "rate_limit_unavailable":
      return 503;
    case "send_failed":
    case "persistence_failed":
    default:
      return 502;
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { conversationId } = await params;
    if (!conversationId) return NextResponse.json({ error: "invalid_input", message: "Conversation ID is required." }, { status: 400 });

    const ctx = await loadWorkspaceContext();
    if (!ctx || !ctx.userId) return NextResponse.json({ error: "unauthorized", message: "Authentication required." }, { status: 401 });
    if (ctx.mode === "demo" || ctx.role === "viewer") return NextResponse.json({ error: "unauthorized", message: "Read-only access." }, { status: 403 });

    const body = await req.json().catch(() => null) as { text?: string; clientIdempotencyKey?: string } | null;
    if (!body || typeof body !== "object") return NextResponse.json({ error: "invalid_input", message: "Invalid JSON request body." }, { status: 400 });

    const text = typeof body.text === "string" ? body.text.trim() : "";
    const clientIdempotencyKey = typeof body.clientIdempotencyKey === "string" ? body.clientIdempotencyKey.trim() : "";
    if (!text) return NextResponse.json({ error: "invalid_input", message: "Message text is required." }, { status: 400 });
    if (clientIdempotencyKey.length < 8 || clientIdempotencyKey.length > 64) {
      return NextResponse.json({ error: "invalid_input", message: "Invalid idempotency key format." }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { data: conversation } = await admin.from("conversations").select("provider")
      .eq("id", conversationId).eq("organization_id", ctx.organization.id).maybeSingle();
    if (!conversation) return NextResponse.json({ error: "not_found", message: "Conversation not found." }, { status: 404 });

    let result:
      | Awaited<ReturnType<WhatsAppOutboundService["sendOutboundReply"]>>
      | Awaited<ReturnType<typeof sendMetaMessagingReply>>;

    if (conversation.provider === "whatsapp") {
      result = await new WhatsAppOutboundService().sendOutboundReply({
        organizationId: ctx.organization.id, userId: ctx.userId, userRole: ctx.role,
        conversationId, text, clientIdempotencyKey,
      });
      await recordWhatsAppAuditEvent({
        organizationId: ctx.organization.id, conversationId,
        messageId: result.data?.messageId ?? null, actorUserId: ctx.userId,
        eventType: result.success ? "message_sent" : "message_failed",
        metadata: result.success ? { status: result.data?.status ?? "sent" } : { errorCode: result.errorCode ?? "send_failed" },
      });
    } else if (conversation.provider === "instagram" || conversation.provider === "facebook") {
      result = await sendMetaMessagingReply({
        organizationId: ctx.organization.id, userId: ctx.userId, userRole: ctx.role,
        conversationId, text, clientIdempotencyKey,
      });
    } else {
      return NextResponse.json({ error: "unsupported_provider", message: "Reply transport is not enabled for this channel." }, { status: 400 });
    }

    if (!result.success) {
      const code = result.errorCode || "send_failed";
      return NextResponse.json({ error: code, message: result.message }, { status: outboundErrorStatus(code) });
    }
    return NextResponse.json(result.data, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json({ error: "internal_error", message: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}
