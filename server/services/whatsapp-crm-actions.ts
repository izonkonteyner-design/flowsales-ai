import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { recordWhatsAppAuditEvent } from "@/server/services/whatsapp-audit";

const MESSAGING_PROVIDERS = ["whatsapp", "instagram", "facebook"];

export class WhatsAppCrmActionsService {
  private supabase = createSupabaseAdminClient();

  private async conversation(organizationId: string, conversationId: string) {
    const { data, error } = await this.supabase
      .from("conversations")
      .select("id,organization_id,provider,lead_id,customer_id,channel_contact_id")
      .eq("organization_id", organizationId)
      .eq("id", conversationId)
      .in("provider", MESSAGING_PROVIDERS)
      .maybeSingle();
    if (error) throw new Error(`Unable to load conversation: ${error.message}`);
    if (!data) throw new Error("Conversation not found in this workspace.");
    return data;
  }

  private async audit(conversation: { provider: string; id: string }, input: { organizationId: string; userId: string; eventType: string; metadata?: Record<string, unknown> }) {
    if (conversation.provider === "whatsapp") {
      await recordWhatsAppAuditEvent({
        organizationId: input.organizationId,
        conversationId: conversation.id,
        actorUserId: input.userId,
        eventType: input.eventType as Parameters<typeof recordWhatsAppAuditEvent>[0]["eventType"],
        metadata: input.metadata,
      });
      return;
    }
    await this.supabase.from("omnichannel_audit_events").insert({
      organization_id: input.organizationId,
      provider: conversation.provider,
      conversation_id: conversation.id,
      actor_user_id: input.userId,
      event_type: input.eventType,
      metadata: input.metadata ?? {},
    });
  }

  private label(provider: string) {
    return provider === "instagram" ? "Instagram" : provider === "facebook" ? "Facebook Messenger" : "WhatsApp";
  }

  async addNote(input: { organizationId: string; conversationId: string; userId: string; note: string }) {
    const note = input.note.trim();
    if (!note || note.length > 2000) throw new Error("Note must be between 1 and 2000 characters.");
    const conversation = await this.conversation(input.organizationId, input.conversationId);
    const label = this.label(conversation.provider);

    if (conversation.lead_id) {
      const { error } = await this.supabase.from("activities").insert({
        organization_id: input.organizationId,
        lead_id: conversation.lead_id,
        type: "conversation_note",
        title: `${label} conversation note`,
        detail: note,
        created_by: input.userId,
      });
      if (error) throw new Error(`Unable to add CRM note: ${error.message}`);
    } else if (conversation.customer_id) {
      const { data: customer, error: customerError } = await this.supabase
        .from("contacts").select("notes")
        .eq("organization_id", input.organizationId).eq("id", conversation.customer_id).single();
      if (customerError) throw new Error(`Unable to load customer: ${customerError.message}`);
      const existing = typeof customer.notes === "string" && customer.notes.trim() ? `${customer.notes.trim()}\n\n` : "";
      const { error } = await this.supabase.from("contacts")
        .update({ notes: `${existing}[${label}] ${note}`.slice(0, 10000) })
        .eq("organization_id", input.organizationId).eq("id", conversation.customer_id);
      if (error) throw new Error(`Unable to add customer note: ${error.message}`);
    } else {
      throw new Error("Link this conversation to a Lead or Customer before adding a CRM note.");
    }

    await this.audit(conversation, { organizationId: input.organizationId, userId: input.userId, eventType: "crm_note_added", metadata: { length: note.length } });
    return { success: true };
  }

  async createTask(input: {
    organizationId: string; conversationId: string; userId: string; title: string;
    dueAt: string; priority: "low" | "medium" | "high"; assignedTo?: string | null;
  }) {
    const title = input.title.trim();
    if (!title || title.length > 200) throw new Error("Task title must be between 1 and 200 characters.");
    const due = new Date(input.dueAt);
    if (!Number.isFinite(due.getTime())) throw new Error("A valid follow-up date is required.");
    const conversation = await this.conversation(input.organizationId, input.conversationId);
    const { error } = await this.supabase.from("tasks").insert({
      organization_id: input.organizationId,
      lead_id: conversation.lead_id ?? null,
      title,
      due_at: due.toISOString(),
      priority: input.priority,
      assigned_to: input.assignedTo ?? input.userId,
      status: "open",
      created_by: input.userId,
    });
    if (error) throw new Error(`Unable to create follow-up task: ${error.message}`);
    await this.audit(conversation, { organizationId: input.organizationId, userId: input.userId, eventType: "crm_task_created", metadata: { priority: input.priority, dueAt: due.toISOString() } });
    return { success: true };
  }

  async convertLeadToCustomer(input: { organizationId: string; conversationId: string; userId: string }) {
    const conversation = await this.conversation(input.organizationId, input.conversationId);
    if (!conversation.lead_id) throw new Error("This conversation is not linked to a Lead.");

    const { data: lead, error: leadError } = await this.supabase
      .from("leads")
      .select("id,full_name,company,email,phone,city,notes,converted_customer_id")
      .eq("organization_id", input.organizationId).eq("id", conversation.lead_id).single();
    if (leadError) throw new Error(`Unable to load Lead: ${leadError.message}`);

    let customerId = lead.converted_customer_id as string | null;
    if (!customerId) {
      const { data: customer, error: customerError } = await this.supabase.from("contacts").insert({
        organization_id: input.organizationId,
        full_name: lead.full_name,
        company: lead.company,
        email: lead.email,
        phone: lead.phone,
        city: lead.city,
        notes: lead.notes,
        source_lead_id: lead.id,
        created_by: input.userId,
      }).select("id").single();
      if (customerError || !customer?.id) throw new Error(`Unable to create Customer: ${customerError?.message ?? "unknown error"}`);
      customerId = customer.id;
    }

    const now = new Date().toISOString();
    const { error: updateLeadError } = await this.supabase.from("leads").update({
      status: "won", converted_at: now, converted_customer_id: customerId, converted_by: input.userId,
    }).eq("organization_id", input.organizationId).eq("id", lead.id);
    if (updateLeadError) throw new Error(`Unable to finalize Lead conversion: ${updateLeadError.message}`);

    const { error: conversationError } = await this.supabase.from("conversations").update({
      customer_id: customerId,
      lead_id: lead.id,
      identity_resolution_status: "MANUALLY_RESOLVED",
      identity_resolution_method: "manual_lead_conversion",
      identity_resolved_at: now,
    }).eq("organization_id", input.organizationId).eq("id", input.conversationId).eq("provider", conversation.provider);
    if (conversationError) throw new Error(`Unable to link converted Customer: ${conversationError.message}`);

    await this.audit(conversation, { organizationId: input.organizationId, userId: input.userId, eventType: "crm_lead_converted", metadata: { leadId: lead.id, customerId } });
    return { success: true, customerId };
  }

  async recordQuoteOpened(input: { organizationId: string; conversationId: string; userId: string }) {
    const conversation = await this.conversation(input.organizationId, input.conversationId);
    if (!conversation.lead_id) throw new Error("A Lead link is required before creating a quote.");
    await this.audit(conversation, { organizationId: input.organizationId, userId: input.userId, eventType: "crm_quote_opened", metadata: { leadId: conversation.lead_id } });
    return { success: true, leadId: conversation.lead_id as string };
  }
}
