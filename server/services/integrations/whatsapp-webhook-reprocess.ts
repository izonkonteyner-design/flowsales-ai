import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { WhatsAppConnectionsRepository } from "@/server/repositories/supabase/whatsapp-connections";
import { parseWhatsAppInbound, persistWhatsAppInbound } from "@/server/services/integrations/whatsapp-inbound";
import { recordWhatsAppAuditEvent } from "@/server/services/whatsapp-audit";

const MAX_ATTEMPTS = 5;

function firstValue(payload: Record<string, unknown>) {
  const entry = Array.isArray(payload.entry) ? payload.entry[0] as Record<string, unknown> | undefined : undefined;
  const changes = Array.isArray(entry?.changes) ? entry?.changes?.[0] as Record<string, unknown> | undefined : undefined;
  return changes?.value as Record<string, unknown> | undefined;
}

export class WhatsAppWebhookReprocessService {
  async reprocess(input: { organizationId: string; eventId: string; userId: string }) {
    const supabase = createSupabaseAdminClient();
    const { data: claimed, error: claimError } = await supabase.rpc("claim_webhook_event_for_reprocess", {
      p_event_id: input.eventId,
      p_organization_id: input.organizationId,
      p_max_attempts: MAX_ATTEMPTS,
    });
    if (claimError) throw new Error(`Unable to claim webhook event: ${claimError.message}`);
    const event = Array.isArray(claimed) ? claimed[0] : claimed;
    if (!event) throw new Error("Webhook event is not retryable, is already processing, or reached its retry limit.");

    await recordWhatsAppAuditEvent({ organizationId: input.organizationId, actorUserId: input.userId,
      eventType: "webhook_reprocess_requested", metadata: { eventId: input.eventId, retryCount: event.retry_count } });

    try {
      const payload = (event.payload ?? {}) as Record<string, unknown>;
      const value = firstValue(payload);
      if (!value) throw new Error("Stored webhook payload has no processable change value.");

      const entry = Array.isArray(payload.entry) ? payload.entry[0] as Record<string, unknown> | undefined : undefined;
      const metadata = value.metadata as Record<string, unknown> | undefined;
      const wabaId = typeof entry?.id === "string" ? entry.id : typeof metadata?.waba_id === "string" ? metadata.waba_id : undefined;
      const phoneNumberId = typeof metadata?.phone_number_id === "string" ? metadata.phone_number_id : undefined;
      const repo = new WhatsAppConnectionsRepository();
      const connection = await repo.findActiveConnectionForWebhook(wabaId, phoneNumberId);
      if (!connection || connection.organization_id !== input.organizationId) throw new Error("Active WhatsApp connection no longer matches this webhook event.");

      const messages = Array.isArray(value.messages) ? value.messages : [];
      const statuses = Array.isArray(value.statuses) ? value.statuses as Array<Record<string, unknown>> : [];

      if (messages.length > 0) {
        const inbound = parseWhatsAppInbound(value);
        await persistWhatsAppInbound({ organizationId: input.organizationId, connectionId: connection.id, messages: inbound });
      } else if (statuses.length > 0) {
        for (const status of statuses) {
          if (typeof status.id !== "string" || typeof status.status !== "string") continue;
          const rawTimestamp = typeof status.timestamp === "string" ? Number(status.timestamp) : typeof status.timestamp === "number" ? status.timestamp : Date.now() / 1000;
          const occurredAt = new Date(rawTimestamp * 1000).toISOString();
          const errors = Array.isArray(status.errors) ? status.errors as Array<Record<string, unknown>> : [];
          const firstError = errors[0];
          await supabase.rpc("update_message_delivery_status", {
            p_organization_id: input.organizationId,
            p_provider_message_id: status.id,
            p_new_status: status.status,
            p_occurred_at: occurredAt,
            p_error_payload: errors.length ? {
              errors,
              error_code: firstError?.code ? String(firstError.code) : "failed",
              error_message: firstError?.message ? String(firstError.message) : firstError?.title ? String(firstError.title) : "Delivery failed",
            } : null,
          });
        }
      }

      await supabase.from("webhook_events").update({
        status: "processed", processed_at: new Date().toISOString(), error_message: null,
        next_retry_at: null, dead_lettered_at: null,
      }).eq("id", input.eventId).eq("organization_id", input.organizationId);
      await recordWhatsAppAuditEvent({ organizationId: input.organizationId, actorUserId: input.userId,
        eventType: "webhook_reprocess_succeeded", metadata: { eventId: input.eventId, retryCount: event.retry_count } });
      return { success: true, status: "processed" as const };
    } catch (error) {
      const retryCount = Number(event.retry_count ?? 1);
      const deadLetter = retryCount >= MAX_ATTEMPTS;
      await supabase.from("webhook_events").update({
        status: "failed",
        error_message: error instanceof Error ? error.message.slice(0, 500) : "webhook_reprocess_failed",
        next_retry_at: deadLetter ? null : new Date(Date.now() + Math.min(60, 2 ** retryCount) * 60_000).toISOString(),
        dead_lettered_at: deadLetter ? new Date().toISOString() : null,
      }).eq("id", input.eventId).eq("organization_id", input.organizationId);
      if (deadLetter) {
        await recordWhatsAppAuditEvent({ organizationId: input.organizationId, actorUserId: input.userId,
          eventType: "webhook_dead_lettered", metadata: { eventId: input.eventId, retryCount } });
      }
      throw error;
    }
  }
}
