import { z } from "zod";
import { loadWorkspaceContext } from "@/server/services/workspace-context";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { WhatsAppOutboundService } from "@/server/services/integrations/whatsapp-outbound";
import { recordWhatsAppAuditEvent } from "@/server/services/whatsapp-audit";

export async function POST(_request: Request, context: { params: Promise<{ messageId: string }> }) {
  const workspace = await loadWorkspaceContext();
  if (!workspace?.userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (workspace.mode === "demo" || workspace.role === "viewer") return Response.json({ error: "forbidden" }, { status: 403 });
  const { messageId } = await context.params;
  if (!z.string().uuid().safeParse(messageId).success) return Response.json({ error: "invalid_message" }, { status: 400 });

  const supabase = createSupabaseAdminClient();
  const { data: message } = await supabase.from("messages")
    .select("id,conversation_id,body,direction,message_type,status")
    .eq("id", messageId).eq("organization_id", workspace.organization.id).maybeSingle();
  if (!message) return Response.json({ error: "not_found" }, { status: 404 });
  if (message.direction !== "outbound" || message.status !== "failed" || message.message_type !== "text" || !message.body) {
    return Response.json({ error: "not_retryable", message: "Only failed outbound text messages can be explicitly retried." }, { status: 409 });
  }

  await recordWhatsAppAuditEvent({ organizationId: workspace.organization.id, conversationId: message.conversation_id,
    messageId, actorUserId: workspace.userId, eventType: "message_retry_requested", metadata: { originalMessageId: messageId } });

  const service = new WhatsAppOutboundService();
  const result = await service.sendOutboundReply({
    organizationId: workspace.organization.id,
    userId: workspace.userId,
    userRole: workspace.role,
    conversationId: message.conversation_id,
    text: message.body,
    clientIdempotencyKey: `retry_${crypto.randomUUID()}`.slice(0, 64),
  });
  if (!result.success) return Response.json({ error: result.errorCode || "send_failed", message: result.message }, { status: 409 });
  await recordWhatsAppAuditEvent({ organizationId: workspace.organization.id, conversationId: message.conversation_id,
    messageId: result.data?.messageId ?? null, actorUserId: workspace.userId, eventType: "message_sent",
    metadata: { retryOf: messageId, status: result.data?.status ?? "sent" } });
  return Response.json(result.data, { status: 200 });
}
