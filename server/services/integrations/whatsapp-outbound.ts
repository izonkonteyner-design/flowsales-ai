import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { decryptToken } from "@/server/services/integrations/encryption";
import { checkRateLimit } from "@/server/services/integrations/rate-limiter";
import { DEMO_ORGANIZATION_ID } from "@/server/repositories/supabase/omnichannel-inbox";
import { validateCustomerWindow } from "@/lib/utils/customer-window";
import { validateTestRecipient } from "@/lib/utils/test-recipient-guard";
import { isSalesRepresentativeRole } from "@/lib/workspace-roles";

export interface OutboundReplyParams {
  organizationId: string;
  userId: string;
  userRole: string;
  conversationId: string;
  text: string;
  clientIdempotencyKey: string;
  isTestMode?: boolean;
}

export interface OutboundReplyResult {
  success: boolean;
  errorCode?: "template_required" | "rate_limit_exceeded" | "rate_limit_unavailable" | "connection_required" | "unauthorized" | "invalid_input" | "not_found" | "send_failed";
  message?: string;
  data?: {
    messageId: string;
    externalId: string | null;
    status: string;
    sentAt: string;
  };
}

export class WhatsAppOutboundService {
  async sendOutboundReply(params: OutboundReplyParams): Promise<OutboundReplyResult> {
    const { organizationId, userId, userRole, conversationId, text, clientIdempotencyKey } = params;

    // 1. Input Validation
    if (!text || !text.trim()) {
      return { success: false, errorCode: "invalid_input", message: "Message text is required." };
    }

    const trimmedText = text.trim();
    if (trimmedText.length > 4096) {
      return { success: false, errorCode: "invalid_input", message: "Message text exceeds maximum length of 4096 characters." };
    }

    if (!clientIdempotencyKey || typeof clientIdempotencyKey !== "string" || clientIdempotencyKey.length < 8 || clientIdempotencyKey.length > 64) {
      return { success: false, errorCode: "invalid_input", message: "Invalid idempotency key format." };
    }

    // 2. Authorization & Role Safeguards
    if (userRole === "viewer") {
      return { success: false, errorCode: "unauthorized", message: "Viewers are read-only and cannot send replies." };
    }

    if (organizationId === DEMO_ORGANIZATION_ID) {
      return { success: false, errorCode: "unauthorized", message: "Demo organization is read-only." };
    }

    const supabase = createSupabaseAdminClient();

    // 3. Fail-Closed Conversation & Organization Verification
    const { data: conv, error: convErr } = await supabase
      .from("conversations")
      .select("id, organization_id, connection_id, external_id, channel_contact_id, metadata")
      .eq("id", conversationId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (convErr || !conv) {
      return { success: false, errorCode: "not_found", message: "Conversation not found." };
    }

    const assignedUserId = (conv.metadata as Record<string, unknown> | null)?.assigned_user_id as string | undefined;
    if (isSalesRepresentativeRole(userRole as "sales" | "sales_rep") && assignedUserId && assignedUserId !== userId) {
      return { success: false, errorCode: "unauthorized", message: "Sales agents can only reply to assigned conversations." };
    }

    // 4. Rate Limiting Check
    try {
      const rateLimitRes = await checkRateLimit(organizationId, "whatsapp_outbound", 30, 60000);
      if (!rateLimitRes.allowed) {
        return { success: false, errorCode: "rate_limit_exceeded", message: "Rate limit exceeded. Please try again later." };
      }
    } catch {
      return { success: false, errorCode: "rate_limit_unavailable", message: "Rate limit service is temporarily unavailable." };
    }

    // 5. Active Connection & Decrypted Access Token Verification
    const { data: conn } = await supabase
      .from("channel_connections")
      .select("id, status, phone_number_id, waba_id")
      .eq("id", conv.connection_id)
      .eq("organization_id", organizationId)
      .eq("provider", "whatsapp")
      .maybeSingle();

    if (!conn || conn.status !== "connected" || !conn.phone_number_id) {
      console.log("DEBUG_CONN:", conn);
      return { success: false, errorCode: "connection_required", message: "Active WhatsApp Business connection is required." };
    }

    const phoneNumberId = conn.phone_number_id;

    // 5. 24-Hour Customer Window Verification
    const { data: lastInboundMsg } = await supabase
      .from("messages")
      .select("sent_at, created_at")
      .eq("conversation_id", conversationId)
      .eq("organization_id", organizationId)
      .eq("direction", "inbound")
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const windowCheck = validateCustomerWindow(lastInboundMsg?.sent_at || lastInboundMsg?.created_at);
    if (!windowCheck.allowed) {
      return {
        success: false,
        errorCode: "template_required",
        message: "24-hour customer service window has expired. A WhatsApp template message is required.",
      };
    }

    // 6. Token Decryption
    const { data: tokenRow, error: tokenErr } = await supabase
      .from("integration_tokens")
      .select("access_token_cipher")
      .eq("connection_id", conn.id)
      .eq("organization_id", organizationId)
      .eq("provider", "whatsapp")
      .maybeSingle();

    if (!tokenRow || !tokenRow.access_token_cipher) {
      console.log("DEBUG_TOKEN_ROW:", tokenRow, "DEBUG_TOKEN_ERR:", tokenErr);
      return { success: false, errorCode: "connection_required", message: "Active WhatsApp connection token is missing." };
    }

    let accessToken: string;
    try {
      accessToken = decryptToken(tokenRow.access_token_cipher);
    } catch {
      return { success: false, errorCode: "connection_required", message: "Failed to decrypt channel connection credentials." };
    }

    // 7. Atomic Idempotency Reservation
    const { data: existingKey, error: keyErr } = await supabase
      .from("outbound_idempotency_keys")
      .insert({
        organization_id: organizationId,
        conversation_id: conversationId,
        user_id: userId,
        idempotency_key: clientIdempotencyKey,
        status: "pending",
      })
      .select("id, message_id, status")
      .maybeSingle();

    if (keyErr && keyErr.code === "23505") {
      // Duplicate idempotency submission: fetch existing reserved message result
      const { data: dupKey } = await supabase
        .from("outbound_idempotency_keys")
        .select("message_id")
        .eq("organization_id", organizationId)
        .eq("conversation_id", conversationId)
        .eq("idempotency_key", clientIdempotencyKey)
        .maybeSingle();

      if (dupKey?.message_id) {
        const { data: existingMsg } = await supabase
          .from("messages")
          .select("id, external_id, status, sent_at, created_at")
          .eq("id", dupKey.message_id)
          .maybeSingle();

        if (existingMsg) {
          return {
            success: true,
            data: {
              messageId: existingMsg.id,
              externalId: existingMsg.external_id,
              status: existingMsg.status,
              sentAt: existingMsg.sent_at || existingMsg.created_at,
            },
          };
        }
      }
    }

    // 8. Insert Outbound Message (Status = Pending)
    const nowIso = new Date().toISOString();
    const { data: newMsg, error: msgErr } = await supabase
      .from("messages")
      .insert({
        organization_id: organizationId,
        conversation_id: conversationId,
        provider: "whatsapp",
        direction: "outbound",
        message_type: "text",
        body: trimmedText,
        sender_user_id: userId,
        status: "pending",
        metadata: {
          idempotency_key: clientIdempotencyKey,
        },
        sent_at: nowIso,
      })
      .select("id")
      .single();

    if (msgErr || !newMsg) {
      return { success: false, errorCode: "send_failed", message: "Failed to persist outbound message record." };
    }

    // Link message_id to idempotency key if inserted
    if (existingKey?.id) {
      await supabase
        .from("outbound_idempotency_keys")
        .update({ message_id: newMsg.id })
        .eq("id", existingKey.id);
    }

    // Fetch recipient phone number from channel_contacts or conversation external_id
    const recipientPhone = conv.external_id;

    if (params.isTestMode) {
      const testGuard = validateTestRecipient(recipientPhone);
      if (!testGuard.allowed) {
        return {
          success: false,
          errorCode: "unauthorized",
          message: testGuard.message,
        };
      }
    }

    // 9. Send Request to Meta Graph API
    const graphVersion = process.env.META_GRAPH_API_VERSION || "v21.0";
    const graphUrl = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`;

    try {
      const metaRes = await fetch(graphUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: recipientPhone,
          type: "text",
          text: {
            body: trimmedText,
          },
        }),
      });

      const metaJson = await metaRes.json();

      if (!metaRes.ok || !metaJson.messages || !metaJson.messages[0]?.id) {
        const errorCategory = metaJson.error?.message || "Meta API error";
        await supabase
          .from("messages")
          .update({
            status: "failed",
            metadata: {
              idempotency_key: clientIdempotencyKey,
              error_category: errorCategory,
              http_status: metaRes.status,
            },
          })
          .eq("id", newMsg.id);

        return {
          success: false,
          errorCode: "send_failed",
          message: `WhatsApp API rejection: ${errorCategory}`,
        };
      }

      const wamid = metaJson.messages[0].id;

      // Update message status to sent & store provider message ID
      const { error: updateMsgErr } = await supabase
        .from("messages")
        .update({
          external_id: wamid,
          status: "sent",
          metadata: {
            idempotency_key: clientIdempotencyKey,
            provider_message_id: wamid,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", newMsg.id)
        .eq("organization_id", organizationId);

      if (updateMsgErr) {
        console.error("FAILED_TO_UPDATE_OUTBOUND_MESSAGE_STATUS:", updateMsgErr);
      }

      // Update conversation last_message_at
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
          metadata: {
            idempotency_key: clientIdempotencyKey,
            error_category: errMsg,
          },
        })
        .eq("id", newMsg.id);

      return { success: false, errorCode: "send_failed", message: `Failed to reach WhatsApp Graph API: ${errMsg}` };
    }
  }
}
