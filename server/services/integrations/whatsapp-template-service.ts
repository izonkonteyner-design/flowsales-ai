import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { decryptToken } from "@/server/services/integrations/encryption";
import { checkRateLimit } from "@/server/services/integrations/rate-limiter";
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
    externalId: string | null;
    status: string;
    sentAt: string;
  };
}

export class WhatsAppTemplateService {
  async getApprovedTemplates(organizationId: string): Promise<WhatsAppTemplateDTO[]> {
    if (!organizationId || organizationId === DEMO_ORGANIZATION_ID) {
      return [];
    }

    const supabase = createSupabaseAdminClient();
    const { data: rows, error } = await supabase
      .from("whatsapp_templates")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("status", "APPROVED")
      .order("name", { ascending: true });

    if (error || !rows) {
      return [];
    }

    return rows.map((r) => ({
      id: r.id,
      organizationId: r.organization_id,
      metaTemplateId: r.meta_template_id,
      name: r.name,
      language: r.language,
      category: r.category,
      status: r.status as WhatsAppTemplateDTO["status"],
      components: (r.components as WhatsAppTemplateDTO["components"]) || [],
      lastSyncedAt: r.last_synced_at,
    }));
  }

  async sendTemplateMessage(params: SendTemplateMessageParams): Promise<SendTemplateMessageResult> {
    const {
      organizationId,
      userId,
      userRole,
      conversationId,
      templateName,
      languageCode,
      headerParameters = [],
      bodyParameters = [],
      buttonParameters = [],
      clientIdempotencyKey,
      isTestMode,
    } = params;

    // 1. Authorization check
    if (userRole === "viewer" || organizationId === DEMO_ORGANIZATION_ID) {
      return { success: false, errorCode: "unauthorized", message: "User is not authorized to send template messages." };
    }

    if (!templateName || !templateName.trim() || !languageCode || !languageCode.trim()) {
      return { success: false, errorCode: "invalid_input", message: "Template name and language code are required." };
    }

    // 2. Fetch template definition from catalog
    const supabase = createSupabaseAdminClient();
    const { data: tplRow, error: tplErr } = await supabase
      .from("whatsapp_templates")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("name", templateName.trim())
      .eq("language", languageCode.trim())
      .maybeSingle();

    if (tplErr || !tplRow) {
      return {
        success: false,
        errorCode: "invalid_template",
        message: `Template '${templateName}' (${languageCode}) was not found in the approved template catalog.`,
      };
    }

    if (tplRow.status !== "APPROVED") {
      return {
        success: false,
        errorCode: "invalid_template",
        message: `Template '${templateName}' is currently in '${tplRow.status}' status and cannot be sent. Meta APPROVED status is required.`,
      };
    }

    // 3. Validate parameter counts against template structure
    const components = (tplRow.components as Array<{ type: string; text?: string }>) || [];
    const bodyComp = components.find((c) => c.type === "BODY");

    if (bodyComp?.text) {
      const matches = bodyComp.text.match(/\{\{\d+\}\}/g) || [];
      const requiredBodyParamsCount = matches.length;
      if (bodyParameters.length !== requiredBodyParamsCount) {
        return {
          success: false,
          errorCode: "invalid_input",
          message: `Template '${templateName}' body requires exactly ${requiredBodyParamsCount} parameter(s), but ${bodyParameters.length} was provided.`,
        };
      }
    }

    // 4. Fetch Active Connection & Access Token
    const { data: conv } = await supabase
      .from("conversations")
      .select("id, organization_id, connection_id, external_id")
      .eq("id", conversationId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (!conv || !conv.connection_id) {
      return { success: false, errorCode: "not_found", message: "Conversation not found." };
    }

    const { data: conn } = await supabase
      .from("channel_connections")
      .select("id, phone_number_id, status")
      .eq("id", conv.connection_id)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (!conn || conn.status !== "connected" || !conn.phone_number_id) {
      return { success: false, errorCode: "connection_required", message: "Active WhatsApp connection is required." };
    }

    const recipientPhone = conv.external_id;

    if (isTestMode) {
      const guard = validateTestRecipient(recipientPhone);
      if (!guard.allowed) {
        return { success: false, errorCode: "unauthorized", message: guard.message };
      }
    }

    const { data: tokenRow } = await supabase
      .from("integration_tokens")
      .select("access_token_cipher")
      .eq("connection_id", conn.id)
      .eq("organization_id", organizationId)
      .eq("provider", "whatsapp")
      .maybeSingle();

    if (!tokenRow?.access_token_cipher) {
      return { success: false, errorCode: "connection_required", message: "Connection access token is missing." };
    }

    let accessToken: string;
    try {
      accessToken = decryptToken(tokenRow.access_token_cipher);
    } catch {
      return { success: false, errorCode: "connection_required", message: "Failed to decrypt connection token." };
    }

    // 5. Build Meta Cloud API Payload
    const templateComponents: Array<Record<string, unknown>> = [];

    if (headerParameters.length > 0) {
      templateComponents.push({
        type: "header",
        parameters: headerParameters.map((val) => ({ type: "text", text: val })),
      });
    }

    if (bodyParameters.length > 0) {
      templateComponents.push({
        type: "body",
        parameters: bodyParameters.map((val) => ({ type: "text", text: val })),
      });
    }

    if (buttonParameters.length > 0) {
      for (const btn of buttonParameters) {
        templateComponents.push({
          type: "button",
          sub_type: btn.sub_type,
          index: btn.index,
          parameters: btn.parameters,
        });
      }
    }

    const metaPayload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipientPhone,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(templateComponents.length > 0 ? { components: templateComponents } : {}),
      },
    };

    // 6. Insert pending message record
    const nowIso = new Date().toISOString();
    const renderedBody = `[Template: ${templateName}] ${bodyParameters.join(" | ")}`.trim();

    const { data: newMsg, error: msgErr } = await supabase
      .from("messages")
      .insert({
        organization_id: organizationId,
        conversation_id: conversationId,
        provider: "whatsapp",
        direction: "outbound",
        message_type: "template",
        body: renderedBody,
        sender_user_id: userId,
        status: "pending",
        metadata: {
          idempotency_key: clientIdempotencyKey,
          template_name: templateName,
          language_code: languageCode,
        },
        sent_at: nowIso,
      })
      .select("id")
      .single();

    if (msgErr || !newMsg) {
      return { success: false, errorCode: "send_failed", message: "Failed to persist outbound template message." };
    }

    // 7. Post to Meta Graph API
    const graphVersion = process.env.META_GRAPH_API_VERSION || "v21.0";
    const graphUrl = `https://graph.facebook.com/${graphVersion}/${conn.phone_number_id}/messages`;

    try {
      const metaRes = await fetch(graphUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(metaPayload),
      });

      const metaJson = await metaRes.json();

      if (!metaRes.ok || !metaJson.messages || !metaJson.messages[0]?.id) {
        const errorCategory = metaJson.error?.message || "Meta API error";
        const errorCodeStr = metaJson.error?.code ? String(metaJson.error.code) : "send_failed";

        await supabase
          .from("messages")
          .update({
            status: "failed",
            failed_at: nowIso,
            error_code: errorCodeStr,
            metadata: {
              idempotency_key: clientIdempotencyKey,
              error_category: errorCategory,
              http_status: metaRes.status,
            },
          })
          .eq("id", newMsg.id)
          .eq("organization_id", organizationId);

        return {
          success: false,
          errorCode: "send_failed",
          message: `WhatsApp API rejection: ${errorCategory}`,
        };
      }

      const wamid = metaJson.messages[0].id;

      await supabase
        .from("messages")
        .update({
          external_id: wamid,
          status: "sent",
          sent_at: nowIso,
          metadata: {
            idempotency_key: clientIdempotencyKey,
            provider_message_id: wamid,
            template_name: templateName,
          },
          updated_at: nowIso,
        })
        .eq("id", newMsg.id)
        .eq("organization_id", organizationId);

      await supabase
        .from("conversations")
        .update({
          last_message_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", conversationId);

      return {
        success: true,
        data: {
          messageId: newMsg.id,
          externalId: wamid,
          status: "sent",
          sentAt: nowIso,
        },
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Network error";
      await supabase
        .from("messages")
        .update({
          status: "failed",
          failed_at: nowIso,
          metadata: {
            idempotency_key: clientIdempotencyKey,
            error_category: errMsg,
          },
        })
        .eq("id", newMsg.id)
        .eq("organization_id", organizationId);

      return { success: false, errorCode: "send_failed", message: `Failed to communicate with Meta API: ${errMsg}` };
    }
  }
}
