import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { maskPhoneNumber } from "@/lib/utils/phone-mask";
import {
  WhatsAppCrmIdentityService,
  type CrmSearchResults,
  type IdentityResolutionStatus,
  type WhatsAppIdentityDTO,
} from "@/server/services/whatsapp-crm-identity";

const SUPPORTED_PROVIDERS = ["whatsapp", "instagram", "facebook"] as const;
type MessagingProvider = (typeof SUPPORTED_PROVIDERS)[number];

function providerLabel(provider: MessagingProvider) {
  return provider === "whatsapp" ? "WhatsApp" : provider === "instagram" ? "Instagram" : "Facebook Messenger";
}

export class OmnichannelCrmIdentityService {
  private supabase = createSupabaseAdminClient();
  private whatsapp = new WhatsAppCrmIdentityService();

  private async conversation(organizationId: string, conversationId: string) {
    const { data, error } = await this.supabase
      .from("conversations")
      .select("id,organization_id,provider,external_id,customer_id,lead_id,identity_resolution_status,identity_resolution_method,identity_resolved_at,channel_contacts(display_name,phone_number)")
      .eq("organization_id", organizationId)
      .eq("id", conversationId)
      .maybeSingle();
    if (error || !data || !SUPPORTED_PROVIDERS.includes(data.provider as MessagingProvider)) return null;
    return data;
  }

  async getIdentity(organizationId: string, conversationId: string): Promise<WhatsAppIdentityDTO | null> {
    const conversation = await this.conversation(organizationId, conversationId);
    if (!conversation) return null;
    if (conversation.provider === "whatsapp") return this.whatsapp.getIdentity(organizationId, conversationId);

    let customer: WhatsAppIdentityDTO["customer"] = null;
    if (conversation.customer_id) {
      const { data } = await this.supabase.from("contacts").select("id,full_name,phone")
        .eq("organization_id", organizationId).eq("id", conversation.customer_id).maybeSingle();
      if (data) customer = { id: data.id, name: data.full_name, phone: maskPhoneNumber(data.phone || "") };
    }

    let lead: WhatsAppIdentityDTO["lead"] = null;
    if (conversation.lead_id) {
      const { data } = await this.supabase.from("leads").select("id,full_name,phone,status")
        .eq("organization_id", organizationId).eq("id", conversation.lead_id).maybeSingle();
      if (data) lead = { id: data.id, name: data.full_name, phone: maskPhoneNumber(data.phone || ""), status: data.status };
    }

    return {
      conversationId,
      status: (conversation.identity_resolution_status || (customer || lead ? "MANUALLY_RESOLVED" : "UNMATCHED")) as IdentityResolutionStatus,
      method: conversation.identity_resolution_method || null,
      resolvedAt: conversation.identity_resolved_at || null,
      customer,
      lead,
      candidates: { customers: [], leads: [] },
    };
  }

  searchCandidates(organizationId: string, rawQuery: string): Promise<CrmSearchResults> {
    return this.whatsapp.searchCandidates(organizationId, rawQuery);
  }

  async resolveManual(params: { organizationId: string; conversationId: string; userId: string; customerId?: string | null; leadId?: string | null }) {
    const conversation = await this.conversation(params.organizationId, params.conversationId);
    if (!conversation) return { success: false, error: "Conversation not found." };
    if (conversation.provider === "whatsapp") return this.whatsapp.resolveManual(params);
    if (params.customerId && params.leadId) return { success: false, error: "Choose either a Customer or a Lead." };

    if (params.customerId) {
      const { data } = await this.supabase.from("contacts").select("id").eq("organization_id", params.organizationId).eq("id", params.customerId).maybeSingle();
      if (!data) return { success: false, error: "Customer is not in this workspace." };
    }
    if (params.leadId) {
      const { data } = await this.supabase.from("leads").select("id").eq("organization_id", params.organizationId).eq("id", params.leadId).maybeSingle();
      if (!data) return { success: false, error: "Lead is not in this workspace." };
    }

    const now = new Date().toISOString();
    const unlink = !params.customerId && !params.leadId;
    const { error } = await this.supabase.from("conversations").update({
      customer_id: params.customerId || null,
      lead_id: params.leadId || null,
      identity_resolution_status: unlink ? "UNMATCHED" : "MANUALLY_RESOLVED",
      identity_resolution_method: unlink ? "manual_unlink" : "manual_channel_link",
      identity_resolved_at: now,
    }).eq("organization_id", params.organizationId).eq("id", params.conversationId).eq("provider", conversation.provider);
    if (error) return { success: false, error: error.message };

    await this.supabase.from("omnichannel_audit_events").insert({
      organization_id: params.organizationId,
      provider: conversation.provider,
      conversation_id: params.conversationId,
      actor_user_id: params.userId,
      event_type: unlink ? "crm_identity_unlinked" : "crm_identity_linked",
      metadata: { customer_id: params.customerId || null, lead_id: params.leadId || null },
    });
    return { success: true };
  }

  async createLeadFromConversation(params: { organizationId: string; conversationId: string; userId: string }) {
    const conversation = await this.conversation(params.organizationId, params.conversationId);
    if (!conversation) return { success: false, error: "Conversation not found." };
    if (conversation.provider === "whatsapp") return this.whatsapp.createLeadFromConversation(params);

    const channelContact = Array.isArray(conversation.channel_contacts) ? conversation.channel_contacts[0] : conversation.channel_contacts;
    const provider = conversation.provider as MessagingProvider;
    const { data: lead, error } = await this.supabase.from("leads").insert({
      organization_id: params.organizationId,
      full_name: channelContact?.display_name || `${providerLabel(provider)} Contact`,
      phone: channelContact?.phone_number || null,
      source: providerLabel(provider),
      status: "new",
      created_by: params.userId,
    }).select("id").single();
    if (error || !lead) return { success: false, error: error?.message || "Lead creation failed." };

    const linked = await this.resolveManual({ ...params, leadId: lead.id });
    if (!linked.success) {
      await this.supabase.from("leads").delete().eq("organization_id", params.organizationId).eq("id", lead.id);
      return { success: false, error: linked.error };
    }
    return { success: true, leadId: lead.id };
  }
}
