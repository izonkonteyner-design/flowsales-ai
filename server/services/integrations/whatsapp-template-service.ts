import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { decryptToken } from "@/server/services/integrations/encryption";
import { DEMO_ORGANIZATION_ID } from "@/server/repositories/supabase/omnichannel-inbox";
import { validateTestRecipient } from "@/lib/utils/test-recipient-guard";

export interface WhatsAppTemplateDTO {
  id: string;
  organizationId: string;
  metaTemplateId: string;
  name: string;
  language: string;
  category: string;
  status: "APPROVED" | "PENDING" | "REJECTED" | "PAUSED" | "DISABLED";
  components: Array<{
    type: string;
    text?: string;
    format?: string;
    buttons?: Array<Record<string, unknown>>;
  }>;
  lastSyncedAt: string;
}

export interface SendTemplateMessageParams {
  organizationId: string;
  userId: string;
  userRole: string;
  conversationId: string;
  templateName: string;
  languageCode: string;
  headerParameters?: string[];
  bodyParameters?: string[];
  buttonParameters?: Array<{ sub_type: string; index: string; parameters: Array<Record<string, unknown>> }>;
  clientIdempotencyKey: string;
  isTestMode?: boolean;
}

export interface SendTemplateMessageResult {
  success: boolean;
  errorCode?: "invalid_template" | "rate_limit_exceeded" | "connection_required" | "unauthorized" | "invalid_input" | "not_found" | "send_failed";
  message?: string;
  data?: {
    messageId: string;
    externalMessageId: string;
    status: string;
  };
}

export class WhatsAppTemplateService {
  private supabase = createSupabaseAdminClient();

  async getApprovedTemplates(organizationId: string): Promise<WhatsAppTemplateDTO[]> {
    if (!organizationId || organizationId === DEMO_ORGANIZATION_ID) return [];

    const { data, error } = await this.supabase
      .from("whatsapp_templates")
      .select("id, organization_id, meta_template_id, name, language, category, status, components, last_synced_at")
      .eq("organization_id", organizationId)
      .eq("status", "APPROVED")
      .order("name", { ascending: true });

    if (error || !data) return [];

    return data.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      metaTemplateId: row.meta_template_id,
      name: row.name,
      language: row.language,
      category: row.category,
      status: row.status as WhatsAppTemplateDTO["status"],
      components: (row.components || []) as WhatsAppTemplateDTO["components"],
      lastSyncedAt: row.last_synced_at,
    }));
  }

  async syncTemplates(organizationId: string): Promise<{ success: boolean; count: number; error?: string }> {
    if (!organizationId || organizationId === DEMO_ORGANIZATION_ID) return { success: false, count: 0, error: "Demo organization is read-only." };

    const { data: connection } = await this.supabase
      .from("channel_connections")
      .select("id, external_account_id, status")
      .eq("organization_id", organizationId)
      .eq("provider", "whatsapp")
      .eq("status", "connected")
      .maybeSingle();

    if (!connection?.external_account_id) return { success: false, count: 0, error: "Connected WhatsApp Business Account required." };

    const { data: tokenRow } = await this.supabase
      .from("integration_tokens")
      .select("access_token_encrypted")
      .eq("organization_id", organizationId)
      .eq("connection_id", connection.id)
      .maybeSingle();

    if (!tokenRow?.access_token_encrypted) return { success: false, count: 0, error: "WhatsApp access token is not configured." };

    let token: string;
    try {
      token = decryptToken(tokenRow.access_token_encrypted);
    } catch {
      return { success: false, count: 0, error: "WhatsApp access token could not be decrypted." };
    }

    const response = await fetch(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(connection.external_account_id)}/message_templates?fields=id,name,language,category,status,components&limit=250`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
    );

    const json = (await response.json().catch(() => null)) as {
      data?: Array<{ id: string; name: string; language: string; category: string; status: WhatsAppTemplateDTO["status"]; components?: WhatsAppTemplateDTO["components"] }>;
      error?: { message?: string };
    } | null;

    if (!response.ok || !json?.data) return { success: false, count: 0, error: json?.error?.message || "Meta template sync failed." };

    let count = 0;
    for (const template of json.data) {
      const { error } = await this.supabase
        .from("whatsapp_templates")
        .upsert({
          organization_id: organizationId,
          meta_template_id: template.id,
          name: template.name,
          language: template.language,
          category: template.category,
          status: template.status,
          components: template.components || [],
          last_synced_at: new Date().toISOString(),
        }, { onConflict: "organization_id,name,language" });
      if (!error) count += 1;
    }

    return { success: true, count };
  }

  async sendTemplateMessage(params: SendTemplateMessageParams): Promise<SendTemplateMessageResult> {
    const { organizationId, userRole, conversationId, templateName, languageCode, clientIdempotencyKey } = params;
    if (!organizationId || !conversationId || !templateName || !languageCode || !clientIdempotencyKey) {
      return { success: false, errorCode: "invalid_input", message: "Missing required template send fields." };
    }
    if (organizationId === DEMO_ORGANIZATION_ID || userRole === "viewer") {
      return { success: false, errorCode: "unauthorized", message: "Read-only access." };
    }

    const { data: conversation } = await this.supabase
      .from("conversations")
      .select("id, organization_id, connection_id, external_id, provider")
      .eq("id", conversationId)
      .eq("organization_id", organizationId)
      .eq("provider", "whatsapp")
      .maybeSingle();
    if (!conversation) return { success: false, errorCode: "not_found", message: "WhatsApp conversation not found." };

    if (params.isTestMode) {
      const guard = validateTestRecipient(conversation.external_id);
      if (!guard.allowed) {
        return { success: false, errorCode: "unauthorized", message: "Automated/test WhatsApp sends are restricted to the configured test recipient." };
      }
    }

    const { data: template } = await this.supabase
      .from("whatsapp_templates")
      .select("id, meta_template_id, name, language, status, components")
      .eq("organization_id", organizationId)
      .eq("name", templateName)
      .eq("language", languageCode)
      .eq("status", "APPROVED")
      .maybeSingle();
    if (!template) return { success: false, errorCode: "invalid_template", message: "Approved WhatsApp template not found." };

    const components = (template.components || []) as WhatsAppTemplateDTO["components"];
    const bodyComponent = components.find((item) => item.type === "BODY");
    const headerComponent = components.find((item) => item.type === "HEADER");
    const expectedBodyCount = bodyComponent?.text?.match(/\{\{\d+\}\}/g)?.length || 0;
    const expectedHeaderCount = headerComponent?.text?.match(/\{\{\d+\}\}/g)?.length || 0;
    const bodyParameters = params.bodyParameters || [];
    const headerParameters = params.headerParameters || [];
    if (bodyParameters.length !== expectedBodyCount || headerParameters.length !== expectedHeaderCount) {
      return { success: false, errorCode: "invalid_template", message: "Template parameter count does not match the approved Meta template structure." };
    }

    const { data: connection } = await this.supabase
      .from("channel_connections")
      .select("id, status, metadata")
      .eq("id", conversation.connection_id)
      .eq("organization_id", organizationId)
      .eq("provider", "whatsapp")
      .eq("status", "connected")
      .maybeSingle();
    if (!connection) return { success: false, errorCode: "connection_required", message: "Connected WhatsApp channel required." };

    const metadata = (connection.metadata || {}) as Record<string, unknown>;
    const phoneNumberId = typeof metadata.phone_number_id === "string" ? metadata.phone_number_id : null;
    if (!phoneNumberId) return { success: false, errorCode: "connection_required", message: "WhatsApp Phone Number ID is missing." };

    const { data: tokenRow } = await this.supabase
      .from("integration_tokens")
      .select("access_token_encrypted")
      .eq("organization_id", organizationId)
      .eq("connection_id", connection.id)
      .maybeSingle();
    if (!tokenRow?.access_token_encrypted) return { success: false, errorCode: "connection_required", message: "WhatsApp access token is missing." };

    let accessToken: string;
    try {
      accessToken = decryptToken(tokenRow.access_token_encrypted);
    } catch {
      return { success: false, errorCode: "connection_required", message: "WhatsApp access token could not be decrypted." };
    }

    const payloadComponents: Array<Record<string, unknown>> = [];
    if (headerParameters.length) payloadComponents.push({ type: "header", parameters: headerParameters.map((text) => ({ type: "text", text })) });
    if (bodyParameters.length) payloadComponents.push({ type: "body", parameters: bodyParameters.map((text) => ({ type: "text", text })) });
    if (params.buttonParameters?.length) {
      for (const button of params.buttonParameters) payloadComponents.push({ type: "button", sub_type: button.sub_type, index: button.index, parameters: button.parameters });
    }

    const response = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(phoneNumberId)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: conversation.external_id,
        type: "template",
        template: { name: template.name, language: { code: template.language }, components: payloadComponents },
      }),
    });

    const json = (await response.json().catch(() => null)) as { messages?: Array<{ id: string }>; error?: { code?: number; message?: string } } | null;
    if (!response.ok || !json?.messages?.[0]?.id) {
      return { success: false, errorCode: "send_failed", message: json?.error?.message || "Meta template send failed." };
    }

    const externalMessageId = json.messages[0].id;
    const { data: messageRow, error: messageError } = await this.supabase
      .from("messages")
      .upsert({
        organization_id: organizationId,
        conversation_id: conversationId,
        provider: "whatsapp",
        external_id: externalMessageId,
        direction: "outbound",
        message_type: "template",
        body: `[Template: ${template.name}]`,
        status: "sent",
        metadata: { template_name: template.name, template_language: template.language, client_idempotency_key: clientIdempotencyKey },
        sent_at: new Date().toISOString(),
      }, { onConflict: "organization_id,provider,external_id" })
      .select("id, status")
      .single();
    if (messageError || !messageRow) return { success: false, errorCode: "send_failed", message: "Template was sent but local persistence failed." };

    await this.supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", conversationId)
      .eq("organization_id", organizationId);

    return {
      success: true,
      data: { messageId: messageRow.id, externalMessageId, status: messageRow.status || "sent" },
    };
  }
}
