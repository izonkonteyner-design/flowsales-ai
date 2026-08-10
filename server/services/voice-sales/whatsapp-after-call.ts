import crypto from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { loadWorkspaceContext } from "@/server/services/workspace-context";
import { WhatsAppOutboundService } from "@/server/services/integrations/whatsapp-outbound";
import { recordWhatsAppAuditEvent } from "@/server/services/whatsapp-audit";

function normalize(value: string) { return value.replace(/\D/g, ""); }

async function findWhatsAppConversation(organizationId: string, leadId: string | null, phone: string) {
  const admin = createSupabaseAdminClient();
  if (leadId) {
    const { data } = await admin.from("conversations").select("id,external_id").eq("organization_id", organizationId).eq("provider", "whatsapp").eq("lead_id", leadId).order("last_message_at", { ascending: false }).limit(1).maybeSingle();
    if (data) return data;
  }
  const { data: candidates } = await admin.from("conversations").select("id,external_id").eq("organization_id", organizationId).eq("provider", "whatsapp").order("last_message_at", { ascending: false }).limit(100);
  return (candidates ?? []).find((item) => normalize(item.external_id ?? "") === normalize(phone)) ?? null;
}

export async function approveAndSendVoiceAfterCallAction(actionId: string) {
  const ctx = await loadWorkspaceContext();
  if (!ctx || !ctx.userId || ctx.mode !== "live") throw new Error("Canlı kullanıcı oturumu gerekli.");
  if (ctx.role === "viewer") throw new Error("Salt okunur kullanıcı mesaj gönderemez.");
  const admin = createSupabaseAdminClient();
  const { data: action } = await admin.from("voice_after_call_actions").select("id,organization_id,call_id,lead_id,action_type,status,payload,customer_consented_at").eq("id", actionId).eq("organization_id", ctx.organization.id).maybeSingle();
  if (!action) throw new Error("Telefon sonrası WhatsApp aksiyonu bulunamadı.");
  if (!action.customer_consented_at) throw new Error("Müşteri onayı bulunmuyor.");
  if (!['approval_required','approved'].includes(action.status)) throw new Error("Bu aksiyon artık gönderilebilir durumda değil.");

  const { data: call } = await admin.from("voice_calls").select("from_number").eq("id", action.call_id).eq("organization_id", ctx.organization.id).maybeSingle();
  if (!call) throw new Error("Telefon görüşmesi bulunamadı.");
  const payload = (action.payload ?? {}) as Record<string, unknown>;
  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  if (!text) throw new Error("Gönderilecek doğrulanmış mesaj içeriği bulunmuyor.");

  const conversation = await findWhatsAppConversation(ctx.organization.id, action.lead_id, call.from_number);
  if (!conversation) throw new Error("Bu müşteri için mevcut bir WhatsApp görüşmesi bulunamadı. Yeni konuşma için onaylı WhatsApp template akışı gerekir.");

  await admin.from("voice_after_call_actions").update({ status: "approved", approved_by: ctx.userId, approved_at: new Date().toISOString() }).eq("id", action.id);
  const result = await new WhatsAppOutboundService().sendOutboundReply({
    organizationId: ctx.organization.id,
    userId: ctx.userId,
    userRole: ctx.role,
    conversationId: conversation.id,
    text,
    clientIdempotencyKey: `voice-${action.id.slice(0, 8)}-${crypto.randomUUID().slice(0, 8)}`,
  });
  await recordWhatsAppAuditEvent({ organizationId: ctx.organization.id, conversationId: conversation.id, messageId: result.data?.messageId ?? null, actorUserId: ctx.userId, eventType: result.success ? "message_sent" : "message_failed", metadata: { source: "voice_after_call", voiceActionId: action.id, errorCode: result.errorCode ?? null } });
  if (!result.success) {
    await admin.from("voice_after_call_actions").update({ status: "failed" }).eq("id", action.id);
    throw new Error(result.message ?? "WhatsApp gönderimi başarısız.");
  }
  await admin.from("voice_after_call_actions").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", action.id);
  return result.data;
}

export async function listVoiceAfterCallActions(organizationId: string, callId: string) {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("voice_after_call_actions").select("id,action_type,status,payload,customer_consented_at,approved_at,sent_at,created_at").eq("organization_id", organizationId).eq("call_id", callId).order("created_at", { ascending: false });
  return data ?? [];
}
