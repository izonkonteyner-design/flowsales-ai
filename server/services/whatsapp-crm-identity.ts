import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { maskPhoneNumber } from "@/lib/utils/phone-mask";

export type IdentityResolutionStatus =
  | "MATCHED_CUSTOMER"
  | "MATCHED_LEAD"
  | "UNMATCHED"
  | "AMBIGUOUS"
  | "MANUALLY_RESOLVED";

interface Candidate {
  id: string;
  name: string;
  phone: string | null;
  status?: string | null;
  sourceLeadId?: string | null;
  convertedCustomerId?: string | null;
}

interface CandidateRpcResult {
  normalizedPhone?: string | null;
  customers?: Candidate[];
  leads?: Candidate[];
}

export interface WhatsAppIdentityDTO {
  conversationId: string;
  status: IdentityResolutionStatus;
  method: string | null;
  resolvedAt: string | null;
  customer: { id: string; name: string; phone: string } | null;
  lead: { id: string; name: string; phone: string; status: string | null } | null;
  candidates: {
    customers: Array<{ id: string; name: string; maskedPhone: string }>;
    leads: Array<{ id: string; name: string; maskedPhone: string; status: string | null }>;
  };
}

export interface CrmSearchResults {
  customers: Array<{ id: string; name: string; maskedPhone: string }>;
  leads: Array<{ id: string; name: string; maskedPhone: string; status: string | null }>;
}

export class WhatsAppCrmIdentityService {
  async getIdentity(organizationId: string, conversationId: string): Promise<WhatsAppIdentityDTO | null> {
    const supabase = createSupabaseAdminClient();

    const { data: conversation, error } = await supabase
      .from("conversations")
      .select(`
        id,
        organization_id,
        provider,
        customer_id,
        lead_id,
        identity_resolution_status,
        identity_resolution_method,
        identity_resolved_at
      `)
      .eq("id", conversationId)
      .eq("organization_id", organizationId)
      .eq("provider", "whatsapp")
      .maybeSingle();

    if (error || !conversation) return null;

    let customer: WhatsAppIdentityDTO["customer"] = null;
    if (conversation.customer_id) {
      const { data } = await supabase
        .from("contacts")
        .select("id, full_name, phone")
        .eq("id", conversation.customer_id)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (data) customer = { id: data.id, name: data.full_name, phone: maskPhoneNumber(data.phone || "") };
    }

    let lead: WhatsAppIdentityDTO["lead"] = null;
    if (conversation.lead_id) {
      const { data } = await supabase
        .from("leads")
        .select("id, full_name, phone, status")
        .eq("id", conversation.lead_id)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (data) lead = { id: data.id, name: data.full_name, phone: maskPhoneNumber(data.phone || ""), status: data.status };
    }

    const { data: candidateData } = await supabase.rpc("get_whatsapp_identity_candidates", {
      p_organization_id: organizationId,
      p_conversation_id: conversationId,
    });
    const candidates = (candidateData || {}) as CandidateRpcResult;

    return {
      conversationId,
      status: (conversation.identity_resolution_status || "UNMATCHED") as IdentityResolutionStatus,
      method: conversation.identity_resolution_method || null,
      resolvedAt: conversation.identity_resolved_at || null,
      customer,
      lead,
      candidates: {
        customers: (candidates.customers || []).map((item) => ({
          id: item.id,
          name: item.name,
          maskedPhone: maskPhoneNumber(item.phone || ""),
        })),
        leads: (candidates.leads || []).map((item) => ({
          id: item.id,
          name: item.name,
          maskedPhone: maskPhoneNumber(item.phone || ""),
          status: item.status || null,
        })),
      },
    };
  }

  async searchCandidates(organizationId: string, rawQuery: string): Promise<CrmSearchResults> {
    const supabase = createSupabaseAdminClient();
    const query = rawQuery.trim().replace(/[%_,]/g, "").slice(0, 80);
    if (query.length < 2) return { customers: [], leads: [] };

    const [customerResult, leadResult] = await Promise.all([
      supabase
        .from("contacts")
        .select("id, full_name, phone")
        .eq("organization_id", organizationId)
        .or(`full_name.ilike.%${query}%,phone.ilike.%${query}%`)
        .order("updated_at", { ascending: false })
        .limit(8),
      supabase
        .from("leads")
        .select("id, full_name, phone, status")
        .eq("organization_id", organizationId)
        .or(`full_name.ilike.%${query}%,phone.ilike.%${query}%`)
        .order("updated_at", { ascending: false })
        .limit(8),
    ]);

    return {
      customers: (customerResult.data || []).map((item) => ({
        id: item.id,
        name: item.full_name,
        maskedPhone: maskPhoneNumber(item.phone || ""),
      })),
      leads: (leadResult.data || []).map((item) => ({
        id: item.id,
        name: item.full_name,
        maskedPhone: maskPhoneNumber(item.phone || ""),
        status: item.status || null,
      })),
    };
  }

  async resolveManual(params: {
    organizationId: string;
    conversationId: string;
    userId: string;
    customerId?: string | null;
    leadId?: string | null;
  }): Promise<{ success: boolean; error?: string }> {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.rpc("resolve_whatsapp_identity_manual", {
      p_organization_id: params.organizationId,
      p_conversation_id: params.conversationId,
      p_customer_id: params.customerId || null,
      p_lead_id: params.leadId || null,
      p_resolved_by: params.userId,
    });
    return error ? { success: false, error: error.message } : { success: true };
  }

  async createLeadFromConversation(params: {
    organizationId: string;
    conversationId: string;
    userId: string;
  }): Promise<{ success: boolean; leadId?: string; error?: string }> {
    const supabase = createSupabaseAdminClient();
    const { data: conversation } = await supabase
      .from("conversations")
      .select("id, external_id, channel_contacts(display_name, phone_number)")
      .eq("id", params.conversationId)
      .eq("organization_id", params.organizationId)
      .eq("provider", "whatsapp")
      .maybeSingle();

    if (!conversation) return { success: false, error: "Conversation not found." };
    const channelContact = Array.isArray(conversation.channel_contacts)
      ? conversation.channel_contacts[0]
      : conversation.channel_contacts;

    const { data: lead, error } = await supabase
      .from("leads")
      .insert({
        organization_id: params.organizationId,
        full_name: channelContact?.display_name || "WhatsApp Contact",
        phone: channelContact?.phone_number || conversation.external_id,
        source: "WhatsApp",
        status: "new",
        created_by: params.userId,
      })
      .select("id")
      .single();

    if (error || !lead) return { success: false, error: error?.message || "Lead creation failed." };

    const linked = await this.resolveManual({
      organizationId: params.organizationId,
      conversationId: params.conversationId,
      userId: params.userId,
      leadId: lead.id,
    });
    if (!linked.success) return { success: false, error: linked.error };
    return { success: true, leadId: lead.id };
  }
}
