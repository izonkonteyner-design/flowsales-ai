import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { decryptToken } from "@/server/services/integrations/encryption";
import { WhatsAppTemplateService } from "@/server/services/integrations/whatsapp-template-service";
import { normalizeTestRecipient, TEST_RECIPIENT_CANONICAL } from "@/lib/utils/test-recipient-guard";

const TARGET_TEMPLATE = "flowsales_notification";

export class WhatsAppTemplateVerificationService {
  async syncTemplateCatalog(organizationId: string) {
    const supabase = createSupabaseAdminClient();
    const { data: connection } = await supabase.from("channel_connections")
      .select("id,waba_id,status").eq("organization_id", organizationId).eq("provider", "whatsapp").maybeSingle();
    if (!connection?.id || connection.status !== "connected" || !connection.waba_id) {
      return { success: false as const, error: "connection_required" };
    }
    const { data: tokenRow } = await supabase.from("integration_tokens")
      .select("access_token_cipher").eq("organization_id", organizationId).eq("connection_id", connection.id).eq("provider", "whatsapp").maybeSingle();
    if (!tokenRow?.access_token_cipher) return { success: false as const, error: "token_missing" };
    let token: string;
    try { token = decryptToken(tokenRow.access_token_cipher); } catch { return { success: false as const, error: "token_decrypt_failed" }; }
    const graphVersion = process.env.META_GRAPH_API_VERSION || "v21.0";
    const url = `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(connection.waba_id)}/message_templates?fields=id,name,language,status,category,components&limit=250`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" });
    const json = await response.json().catch(() => null) as { data?: Array<Record<string, unknown>>; error?: { message?: string; code?: number } } | null;
    if (!response.ok || !Array.isArray(json?.data)) return { success: false as const, error: "meta_template_sync_failed", metaCode: json?.error?.code || null };
    const now = new Date().toISOString();
    for (const item of json.data) {
      const name = typeof item.name === "string" ? item.name : "";
      const language = typeof item.language === "string" ? item.language : "";
      const status = typeof item.status === "string" ? item.status : "PENDING";
      if (!name || !language || !["APPROVED","PENDING","REJECTED","PAUSED","DISABLED"].includes(status)) continue;
      await supabase.from("whatsapp_templates").upsert({
        organization_id: organizationId, connection_id: connection.id, meta_template_id: String(item.id || `${name}:${language}`),
        name, language, category: typeof item.category === "string" ? item.category : "UTILITY", status,
        components: Array.isArray(item.components) ? item.components : [], last_synced_at: now, updated_at: now,
      }, { onConflict: "organization_id,name,language" });
    }
    const target = json.data.find((item) => item.name === TARGET_TEMPLATE);
    return { success: true as const, target: target ? { id: String(target.id || ""), name: TARGET_TEMPLATE, language: String(target.language || ""), status: String(target.status || "PENDING"), category: String(target.category || "") } : null };
  }

  async verifyApprovedDelivery(params: { organizationId: string; userId: string; userRole: string }) {
    const sync = await this.syncTemplateCatalog(params.organizationId);
    if (!sync.success) return sync;
    if (!sync.target) return { success: false as const, error: "template_not_found" };
    if (sync.target.status !== "APPROVED") return { success: false as const, error: sync.target.status === "REJECTED" ? "template_rejected" : "template_pending", target: sync.target };
    const supabase = createSupabaseAdminClient();
    const { data: conversations } = await supabase.from("conversations")
      .select("id,external_id").eq("organization_id", params.organizationId).eq("provider", "whatsapp");
    const testConversation = (conversations || []).find((row) => normalizeTestRecipient(row.external_id || "") === TEST_RECIPIENT_CANONICAL);
    if (!testConversation) return { success: false as const, error: "test_conversation_not_found", target: sync.target };

    // Idempotent proof: never emit a second automated verification for the same Meta template id.
    const { data: prior } = await supabase.from("messages").select("id,external_id,status,metadata")
      .eq("organization_id", params.organizationId).eq("conversation_id", testConversation.id).eq("message_type", "template")
      .contains("metadata", { verification_template_id: sync.target.id }).maybeSingle();
    if (prior?.id && prior.external_id) return { success: true as const, alreadyVerified: true, target: sync.target, messageId: prior.id, externalId: prior.external_id, status: prior.status };

    const result = await new WhatsAppTemplateService().sendTemplateMessage({
      organizationId: params.organizationId, userId: params.userId, userRole: params.userRole,
      conversationId: testConversation.id, templateName: sync.target.name, languageCode: sync.target.language,
      clientIdempotencyKey: `template_verify_${sync.target.id}`.slice(0,64), isTestMode: true,
    });
    if (!result.success) return { success: false as const, error: result.errorCode || "send_failed", message: result.message, target: sync.target };
    await supabase.from("messages").update({ metadata: {
      verification_template_id: sync.target.id, template_name: sync.target.name, language_code: sync.target.language,
      verification_recipient: TEST_RECIPIENT_CANONICAL, verification_type: "controlled_test",
    }}).eq("id", result.data!.messageId).eq("organization_id", params.organizationId);
    return { success: true as const, alreadyVerified: false, target: sync.target, ...result.data };
  }
}
