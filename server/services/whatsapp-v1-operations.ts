import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { WhatsAppOutboundService } from "@/server/services/integrations/whatsapp-outbound";

export type ConversationOperationEvent =
  | "message_sent" | "message_retry" | "template_sent" | "ai_suggestion_generated" | "ai_suggestion_reviewed"
  | "crm_lead_created" | "crm_lead_converted" | "crm_note_added" | "crm_task_created" | "crm_quote_created"
  | "conversation_status_changed" | "conversation_assignee_changed" | "webhook_reprocessed";

export async function writeConversationAudit(params: {
  organizationId: string;
  conversationId: string;
  actorUserId?: string | null;
  messageId?: string | null;
  eventType: ConversationOperationEvent;
  metadata?: Record<string, unknown>;
}) {
  const supabase = createSupabaseAdminClient();
  await supabase.from("conversation_operation_audit").insert({
    organization_id: params.organizationId,
    conversation_id: params.conversationId,
    actor_user_id: params.actorUserId || null,
    message_id: params.messageId || null,
    event_type: params.eventType,
    metadata: params.metadata || {},
  });
}

async function loadConversation(organizationId: string, conversationId: string) {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase.from("conversations")
    .select("id,organization_id,provider,lead_id,customer_id,assigned_user_id")
    .eq("id", conversationId).eq("organization_id", organizationId).eq("provider", "whatsapp").maybeSingle();
  return data;
}

export class WhatsAppV1OperationsService {
  async getAudit(organizationId: string, conversationId: string) {
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase.from("conversation_operation_audit")
      .select("id,event_type,actor_user_id,message_id,metadata,created_at")
      .eq("organization_id", organizationId).eq("conversation_id", conversationId)
      .order("created_at", { ascending: false }).limit(50);
    return data || [];
  }

  async addNote(params: { organizationId: string; conversationId: string; userId: string; detail: string }) {
    const conv = await loadConversation(params.organizationId, params.conversationId);
    if (!conv?.lead_id) return { success: false, error: "A linked Lead is required before adding a CRM note." };
    const detail = params.detail.trim().slice(0, 2000);
    if (!detail) return { success: false, error: "Note is required." };
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("activities").insert({
      organization_id: params.organizationId, lead_id: conv.lead_id, type: "note",
      title: "WhatsApp conversation note", detail, created_by: params.userId,
    });
    if (error) return { success: false, error: "CRM note could not be created." };
    await writeConversationAudit({ organizationId: params.organizationId, conversationId: params.conversationId,
      actorUserId: params.userId, eventType: "crm_note_added", metadata: { lead_id: conv.lead_id } });
    return { success: true };
  }

  async createFollowUp(params: { organizationId: string; conversationId: string; userId: string; dueAt?: string }) {
    const conv = await loadConversation(params.organizationId, params.conversationId);
    if (!conv?.lead_id) return { success: false, error: "A linked Lead is required before creating a follow-up." };
    const due = params.dueAt ? new Date(params.dueAt) : new Date(Date.now() + 24 * 60 * 60 * 1000);
    if (!Number.isFinite(due.getTime())) return { success: false, error: "Invalid follow-up date." };
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.from("tasks").insert({
      organization_id: params.organizationId, lead_id: conv.lead_id,
      title: "Follow up WhatsApp conversation", due_at: due.toISOString(), priority: "medium",
      assigned_to: conv.assigned_user_id || params.userId, status: "open", created_by: params.userId,
    }).select("id").single();
    if (error || !data) return { success: false, error: "Follow-up task could not be created." };
    await writeConversationAudit({ organizationId: params.organizationId, conversationId: params.conversationId,
      actorUserId: params.userId, eventType: "crm_task_created", metadata: { lead_id: conv.lead_id, task_id: data.id } });
    return { success: true, taskId: data.id };
  }

  async createDraftQuote(params: { organizationId: string; conversationId: string; userId: string }) {
    const conv = await loadConversation(params.organizationId, params.conversationId);
    if (!conv?.lead_id) return { success: false, error: "A linked Lead is required before creating a quote." };
    const supabase = createSupabaseAdminClient();
    const now = new Date();
    const expiry = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const quoteNumber = `WA-${now.toISOString().slice(0,10).replaceAll("-", "")}-${crypto.randomUUID().slice(0,8).toUpperCase()}`;
    const { data, error } = await supabase.from("quotes").insert({
      organization_id: params.organizationId, lead_id: conv.lead_id, quote_number: quoteNumber,
      issue_date: now.toISOString().slice(0,10), expiry_date: expiry.toISOString().slice(0,10), status: "draft",
      currency: "TRY", notes: "Created from WhatsApp Inbox; add products and commercial terms before sending.",
      subtotal: 0, discount_total: 0, tax_total: 0, total: 0, created_by: params.userId,
    }).select("id").single();
    if (error || !data) return { success: false, error: "Draft quote could not be created." };
    await writeConversationAudit({ organizationId: params.organizationId, conversationId: params.conversationId,
      actorUserId: params.userId, eventType: "crm_quote_created", metadata: { lead_id: conv.lead_id, quote_id: data.id } });
    return { success: true, quoteId: data.id };
  }

  async convertLead(params: { organizationId: string; conversationId: string; userId: string }) {
    const conv = await loadConversation(params.organizationId, params.conversationId);
    if (!conv?.lead_id) return { success: false, error: "A linked Lead is required before conversion." };
    const supabase = createSupabaseAdminClient();
    const { data: lead } = await supabase.from("leads")
      .select("id,full_name,company,email,phone,city,notes,converted_customer_id")
      .eq("id", conv.lead_id).eq("organization_id", params.organizationId).maybeSingle();
    if (!lead) return { success: false, error: "Linked Lead was not found." };
    if (lead.converted_customer_id) return { success: true, customerId: lead.converted_customer_id, alreadyConverted: true };
    const { data: customer, error } = await supabase.from("contacts").insert({
      organization_id: params.organizationId, full_name: lead.full_name, company: lead.company,
      email: lead.email, phone: lead.phone, city: lead.city, notes: lead.notes,
      source_lead_id: lead.id, created_by: params.userId,
    }).select("id").single();
    if (error || !customer) return { success: false, error: "Customer could not be created from Lead." };
    const now = new Date().toISOString();
    const { error: updateError } = await supabase.from("leads").update({
      status: "won", converted_at: now, converted_customer_id: customer.id, converted_by: params.userId,
    }).eq("id", lead.id).eq("organization_id", params.organizationId);
    if (updateError) return { success: false, error: "Lead conversion metadata could not be saved." };
    await supabase.from("conversations").update({
      customer_id: customer.id, lead_id: lead.id, identity_resolution_status: "MATCHED_CUSTOMER",
      identity_resolution_method: "verified_conversion", identity_resolved_at: now, updated_at: now,
    }).eq("id", params.conversationId).eq("organization_id", params.organizationId);
    await writeConversationAudit({ organizationId: params.organizationId, conversationId: params.conversationId,
      actorUserId: params.userId, eventType: "crm_lead_converted", metadata: { lead_id: lead.id, customer_id: customer.id } });
    return { success: true, customerId: customer.id };
  }

  async retryFailedMessage(params: { organizationId: string; conversationId: string; userId: string; userRole: string; messageId: string }) {
    const supabase = createSupabaseAdminClient();
    const { data: message } = await supabase.from("messages")
      .select("id,body,status,direction,message_type")
      .eq("id", params.messageId).eq("organization_id", params.organizationId)
      .eq("conversation_id", params.conversationId).maybeSingle();
    if (!message || message.status !== "failed" || message.direction !== "outbound" || message.message_type !== "text" || !message.body) {
      return { success: false, error: "Only failed outbound text messages can be manually retried." };
    }
    const outbound = new WhatsAppOutboundService();
    const result = await outbound.sendOutboundReply({
      organizationId: params.organizationId, userId: params.userId, userRole: params.userRole,
      conversationId: params.conversationId, text: message.body,
      clientIdempotencyKey: `retry_${crypto.randomUUID()}`.slice(0,64),
    });
    if (result.success) {
      await writeConversationAudit({ organizationId: params.organizationId, conversationId: params.conversationId,
        actorUserId: params.userId, messageId: result.data?.messageId, eventType: "message_retry",
        metadata: { original_message_id: message.id } });
    }
    return result.success ? { success: true, data: result.data } : { success: false, error: result.message, errorCode: result.errorCode };
  }
}
