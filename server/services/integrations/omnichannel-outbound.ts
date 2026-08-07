import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { WhatsAppOutboundService } from "@/server/services/integrations/whatsapp-outbound";
import { sendMetaMessagingText } from "@/server/services/integrations/meta-messaging";
import { checkRateLimit } from "@/server/services/integrations/rate-limiter";
import { DEMO_ORGANIZATION_ID } from "@/server/repositories/supabase/omnichannel-inbox";

export async function sendOmnichannelReply(params: {
  organizationId: string;
  userId: string;
  userRole: string;
  conversationId: string;
  text: string;
  clientIdempotencyKey: string;
}) {
  if (!params.text.trim() || params.text.trim().length > 4096) return { success: false, errorCode: "invalid_input" as const, message: "Message text must be 1-4096 characters." };
  if (params.userRole === "viewer" || params.organizationId === DEMO_ORGANIZATION_ID) return { success: false, errorCode: "unauthorized" as const, message: "This workspace is read-only." };
  const admin = createSupabaseAdminClient();
  const { data: conversation } = await admin.from("conversations").select("id,provider,assigned_user_id")
    .eq("id", params.conversationId).eq("organization_id", params.organizationId).maybeSingle();
  if (!conversation) return { success: false, errorCode: "not_found" as const, message: "Conversation not found." };
  if (params.userRole === "sales" && conversation.assigned_user_id && conversation.assigned_user_id !== params.userId) {
    return { success: false, errorCode: "unauthorized" as const, message: "Conversation is assigned to another sales user." };
  }

  if (conversation.provider === "whatsapp") {
    return new WhatsAppOutboundService().sendOutboundReply(params);
  }
  if (!["instagram", "facebook"].includes(conversation.provider)) {
    return { success: false, errorCode: "unsupported_provider" as const, message: "Outbound messaging is not enabled for this channel." };
  }
  const rate = await checkRateLimit(params.organizationId, `omnichannel_outbound_${conversation.provider}`, 30, 60_000);
  if (!rate.allowed) return { success: false, errorCode: "rate_limit_exceeded" as const, message: "Rate limit exceeded." };
  try {
    const sent = await sendMetaMessagingText({ organizationId: params.organizationId, userId: params.userId, conversationId: params.conversationId, text: params.text.trim() });
    return { success: true, data: { messageId: sent.messageId, externalId: sent.externalId, status: "sent", sentAt: new Date().toISOString() } };
  } catch {
    return { success: false, errorCode: "send_failed" as const, message: "Provider rejected the outbound message or the connection is unavailable." };
  }
}
