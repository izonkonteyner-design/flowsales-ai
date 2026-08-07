import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { WhatsAppConnectionsRepository } from "@/server/repositories/supabase/whatsapp-connections";
import { parseWhatsAppInbound, persistWhatsAppInbound } from "@/server/services/integrations/whatsapp-inbound";
import { writeConversationAudit } from "@/server/services/whatsapp-v1-operations";

const MAX_REPROCESS_ATTEMPTS = 3;

export class WhatsAppWebhookRecoveryService {
  async listFailed(organizationId: string) {
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase.from("webhook_events")
      .select("id,external_event_id,event_type,status,retry_count,error_message,last_error_code,last_attempt_at,dead_lettered_at,received_at")
      .eq("organization_id", organizationId).eq("provider", "whatsapp").eq("status", "failed")
      .order("received_at", { ascending: false }).limit(100);
    return data || [];
  }

  async reprocess(params: { organizationId: string; eventId: string; actorUserId: string }) {
    const supabase = createSupabaseAdminClient();
    const { data: event } = await supabase.from("webhook_events")
      .select("id,payload,status,retry_count,dead_lettered_at").eq("id", params.eventId)
      .eq("organization_id", params.organizationId).eq("provider", "whatsapp").maybeSingle();
    if (!event || event.status !== "failed") return { success: false, error: "failed_event_not_found" };
    const attempts = Number(event.retry_count || 0) + 1;
    if (attempts > MAX_REPROCESS_ATTEMPTS || event.dead_lettered_at) return { success: false, error: "dead_letter_limit_reached" };
    const now = new Date().toISOString();
    await supabase.from("webhook_events").update({ status: "processing", processing_started_at: now, retry_count: attempts, last_attempt_at: now }).eq("id", event.id);
    try {
      const payload = event.payload as Record<string, unknown>;
      const entry = Array.isArray(payload.entry) ? payload.entry[0] as Record<string, unknown> : undefined;
      const change = Array.isArray(entry?.changes) ? entry!.changes[0] as Record<string, unknown> : undefined;
      const value = change?.value as Record<string, unknown> | undefined;
      const metadata = value?.metadata as Record<string, unknown> | undefined;
      const wabaId = typeof entry?.id === "string" ? entry.id : typeof metadata?.waba_id === "string" ? metadata.waba_id : undefined;
      const phoneNumberId = typeof metadata?.phone_number_id === "string" ? metadata.phone_number_id : undefined;
      const connection = await new WhatsAppConnectionsRepository().findActiveConnectionForWebhook(wabaId, phoneNumberId);
      if (!connection || connection.organization_id !== params.organizationId) throw new Error("connection_unavailable");
      if (Array.isArray(value?.messages)) {
        const inbound = parseWhatsAppInbound(value || {});
        await persistWhatsAppInbound({ organizationId: params.organizationId, connectionId: connection.id, messages: inbound });
      } else if (Array.isArray(value?.statuses)) {
        for (const st of value.statuses as Array<Record<string, unknown>>) {
          if (typeof st.id !== "string" || typeof st.status !== "string") continue;
          const ts = typeof st.timestamp === "string" ? Number(st.timestamp) : typeof st.timestamp === "number" ? st.timestamp : Date.now() / 1000;
          const errors = Array.isArray(st.errors) ? st.errors as Array<Record<string, unknown>> : [];
          const first = errors[0];
          await supabase.rpc("update_message_delivery_status", {
            p_organization_id: params.organizationId, p_provider_message_id: st.id, p_new_status: st.status,
            p_occurred_at: new Date(ts * 1000).toISOString(),
            p_error_payload: errors.length ? { errors, error_code: first?.code ? String(first.code) : "failed", error_message: first?.message ? String(first.message) : "Delivery failed" } : null,
          });
        }
      }
      await supabase.from("webhook_events").update({ status: "processed", processed_at: new Date().toISOString(), error_message: null, last_error_code: null, dead_lettered_at: null }).eq("id", event.id);
      // Webhook event may not map to one conversation, so audit every conversation affected only when resolvable from a message id.
      const message = Array.isArray(value?.messages) ? value!.messages[0] as Record<string, unknown> : undefined;
      if (typeof message?.from === "string") {
        const { data: conv } = await supabase.from("conversations").select("id").eq("organization_id", params.organizationId).eq("provider", "whatsapp").eq("external_id", message.from).maybeSingle();
        if (conv?.id) await writeConversationAudit({ organizationId: params.organizationId, conversationId: conv.id, actorUserId: params.actorUserId, eventType: "webhook_reprocessed", metadata: { webhook_event_id: event.id, attempt: attempts } });
      }
      return { success: true, attempts };
    } catch (error) {
      const code = error instanceof Error ? error.message.slice(0, 100) : "reprocess_failed";
      const deadLetter = attempts >= MAX_REPROCESS_ATTEMPTS;
      await supabase.from("webhook_events").update({ status: "failed", error_message: "manual_reprocess_failed", last_error_code: code, dead_lettered_at: deadLetter ? new Date().toISOString() : null }).eq("id", event.id);
      return { success: false, error: code, attempts, deadLettered: deadLetter };
    }
  }
}
