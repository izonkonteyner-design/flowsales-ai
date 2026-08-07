import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { logger } from "@/lib/logger";

export type WhatsAppAuditEventType =
  | "message_sent"
  | "message_failed"
  | "message_retry_requested"
  | "template_sent"
  | "template_failed"
  | "ai_suggestion_generated"
  | "ai_suggestion_reviewed"
  | "crm_note_added"
  | "crm_task_created"
  | "crm_lead_converted"
  | "crm_quote_opened"
  | "conversation_status_changed"
  | "conversation_assignee_changed"
  | "webhook_reprocess_requested"
  | "webhook_reprocess_succeeded"
  | "webhook_dead_lettered";

export async function recordWhatsAppAuditEvent(input: {
  organizationId: string;
  conversationId?: string | null;
  messageId?: string | null;
  actorUserId?: string | null;
  eventType: WhatsAppAuditEventType;
  metadata?: Record<string, unknown>;
}) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("whatsapp_audit_events").insert({
    organization_id: input.organizationId,
    conversation_id: input.conversationId ?? null,
    message_id: input.messageId ?? null,
    actor_user_id: input.actorUserId ?? null,
    event_type: input.eventType,
    metadata: input.metadata ?? {},
  });
  if (error) {
    logger.error("whatsapp_audit.persist_failed", error, { eventType: input.eventType });
    return false;
  }
  return true;
}

export async function listConversationAuditEvents(input: {
  organizationId: string;
  conversationId: string;
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(input.limit ?? 50, 100));
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("whatsapp_audit_events")
    .select("id,event_type,actor_user_id,metadata,created_at")
    .eq("organization_id", input.organizationId)
    .eq("conversation_id", input.conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Unable to load WhatsApp audit history: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    eventType: row.event_type as WhatsAppAuditEventType,
    actorUserId: (row.actor_user_id as string | null) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at as string,
  }));
}
