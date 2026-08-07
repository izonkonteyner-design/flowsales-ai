import type { NextRequest } from "next/server";
import crypto from "node:crypto";
import { getWhatsAppConfig } from "@/server/services/integrations/whatsapp-config";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { WhatsAppConnectionsRepository } from "@/server/repositories/supabase/whatsapp-connections";
import { checkRateLimit, DistributedRateLimitUnavailableError } from "@/server/services/integrations/rate-limiter";
import { logger } from "@/lib/logger";
import { parseWhatsAppInbound, persistWhatsAppInbound } from "@/server/services/integrations/whatsapp-inbound";
import { recordWhatsAppAuditEvent } from "@/server/services/whatsapp-audit";

const MAX_WEBHOOK_ATTEMPTS = 5;

function rateLimitUnavailableResponse(): Response {
  return Response.json(
    { error: "rate_limit_unavailable", message: "Request protection is temporarily unavailable." },
    { status: 503 }
  );
}

async function markWebhookFailure(input: {
  eventId: string;
  organizationId: string;
  attemptCount: number;
  errorMessage: string;
}) {
  const supabase = createSupabaseAdminClient();
  const deadLetter = input.attemptCount >= MAX_WEBHOOK_ATTEMPTS;
  await supabase.from("webhook_events").update({
    status: "failed",
    error_message: input.errorMessage,
    retry_count: Math.max(1, input.attemptCount),
    last_attempt_at: new Date().toISOString(),
    next_retry_at: deadLetter ? null : new Date(Date.now() + Math.min(60, 2 ** Math.max(1, input.attemptCount)) * 60_000).toISOString(),
    dead_lettered_at: deadLetter ? new Date().toISOString() : null,
  }).eq("id", input.eventId).eq("organization_id", input.organizationId);

  if (deadLetter) {
    await recordWhatsAppAuditEvent({
      organizationId: input.organizationId,
      eventType: "webhook_dead_lettered",
      metadata: { eventId: input.eventId, retryCount: input.attemptCount, reason: input.errorMessage },
    });
  }
  return deadLetter;
}

/** GET /api/webhooks/meta — Meta Webhook Verification Challenge */
export async function GET(request: NextRequest): Promise<Response> {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const clientIp = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown_ip";

  try {
    const rl = await checkRateLimit(clientIp, "webhook_verification_attempts", 20, 60000);
    if (!rl.allowed) return Response.json({ error: "rate_limit_exceeded", message: "Too many verification requests." }, { status: 429 });
  } catch (err) {
    if (err instanceof DistributedRateLimitUnavailableError) return rateLimitUnavailableResponse();
    throw err;
  }

  const expectedToken = getWhatsAppConfig().webhookVerifyToken;
  if (mode === "subscribe" && token && expectedToken && token === expectedToken) {
    logger.info("meta_webhook.verify_success");
    return new Response(challenge || "", { status: 200 });
  }
  logger.warn("meta_webhook.verify_failed");
  return Response.json({ error: "forbidden", message: "Webhook verification failed." }, { status: 403 });
}

/** POST /api/webhooks/meta — Meta Webhook Event Ingestion */
export async function POST(request: NextRequest): Promise<Response> {
  const clientIp = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown_ip";
  try {
    const postRl = await checkRateLimit(clientIp, "webhook_post", 100, 60000);
    if (!postRl.allowed) return Response.json({ error: "rate_limit_exceeded", message: "Too many webhook requests." }, { status: 429 });
  } catch (err) {
    if (err instanceof DistributedRateLimitUnavailableError) return rateLimitUnavailableResponse();
    throw err;
  }

  const signatureHeader = request.headers.get("x-hub-signature-256");
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    try { await checkRateLimit(clientIp, "invalid_webhook_signature", 10, 600000); }
    catch (err) { if (err instanceof DistributedRateLimitUnavailableError) return rateLimitUnavailableResponse(); throw err; }
    logger.warn("meta_webhook.missing_signature_header");
    return Response.json({ error: "invalid_signature", message: "Missing or invalid signature header." }, { status: 401 });
  }

  const rawBody = await request.text();
  const appSecret = getWhatsAppConfig().appSecret;
  if (!appSecret) return Response.json({ error: "configuration_error", message: "Webhook secret is not configured." }, { status: 500 });
  const expectedSignature = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const providedSignature = signatureHeader.slice(7);
  const validSignature = providedSignature.length === expectedSignature.length
    && crypto.timingSafeEqual(Buffer.from(providedSignature, "utf-8"), Buffer.from(expectedSignature, "utf-8"));
  if (!validSignature) {
    let remainingAttempts = 0;
    try { remainingAttempts = (await checkRateLimit(clientIp, "invalid_webhook_signature", 10, 600000)).remaining; }
    catch (err) { if (err instanceof DistributedRateLimitUnavailableError) return rateLimitUnavailableResponse(); throw err; }
    logger.warn("meta_webhook.signature_mismatch", { remainingAttempts });
    return Response.json({ error: "invalid_signature", message: "HMAC signature verification failed." }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try { payload = JSON.parse(rawBody) as Record<string, unknown>; }
  catch { return Response.json({ error: "invalid_json", message: "Failed to parse webhook JSON payload." }, { status: 400 }); }

  const entry = Array.isArray(payload.entry) ? payload.entry[0] as Record<string, unknown> | undefined : undefined;
  const changes = Array.isArray(entry?.changes) ? entry?.changes?.[0] as Record<string, unknown> | undefined : undefined;
  const value = changes?.value as Record<string, unknown> | undefined;
  const metadata = value?.metadata as Record<string, unknown> | undefined;
  const wabaId = typeof entry?.id === "string" ? entry.id : typeof metadata?.waba_id === "string" ? metadata.waba_id : undefined;
  const phoneNumberId = typeof metadata?.phone_number_id === "string" ? metadata.phone_number_id : undefined;
  const messages = Array.isArray(value?.messages) ? value?.messages?.[0] as Record<string, unknown> | undefined : undefined;
  const statuses = Array.isArray(value?.statuses) ? value?.statuses?.[0] as Record<string, unknown> | undefined : undefined;

  let externalEventId: string;
  if (typeof messages?.id === "string") externalEventId = messages.id;
  else if (typeof statuses?.id === "string") externalEventId = `${statuses.id}_${String(statuses.status || "status")}_${String(statuses.timestamp || "")}`;
  else if (entry?.id && changes?.field) externalEventId = `${entry.id}_${changes.field}_${String(value?.timestamp || "")}`;
  else externalEventId = crypto.createHash("sha256").update(rawBody).digest("hex");
  const eventType = typeof changes?.field === "string" ? changes.field : typeof payload.object === "string" ? payload.object : "whatsapp_business_account";

  const repo = new WhatsAppConnectionsRepository();
  let activeConnection: { id: string; organization_id: string } | null = null;
  try { activeConnection = await repo.findActiveConnectionForWebhook(wabaId, phoneNumberId); }
  catch (err) {
    logger.error("meta_webhook.active_connection_lookup_error", err);
    return Response.json({ error: "database_error", message: "Failed to query channel connections." }, { status: 500 });
  }
  if (!activeConnection) {
    logger.info("meta_webhook.unknown_connection_ignored", { eventType });
    return Response.json({ received: true, status: "ignored", reason: "unknown_connection" }, { status: 200 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: inserted, error: insertErr } = await supabase.from("webhook_events").insert({
    organization_id: activeConnection.organization_id,
    provider: "whatsapp",
    external_event_id: externalEventId,
    event_type: eventType,
    payload,
    status: "received",
    retry_count: 0,
    last_attempt_at: new Date().toISOString(),
    received_at: new Date().toISOString(),
  }).select("id,retry_count").single();

  let eventId = inserted?.id as string | undefined;
  let attemptCount = 1;
  let retryingFailedEvent = false;

  if (insertErr) {
    if (insertErr.code !== "23505") {
      logger.error("meta_webhook.persistence_failed", insertErr);
      return Response.json({ error: "webhook_persistence_failed", message: "Failed to persist webhook event." }, { status: 500 });
    }

    const { data: existing } = await supabase.from("webhook_events")
      .select("id,status,retry_count,dead_lettered_at")
      .eq("organization_id", activeConnection.organization_id)
      .eq("provider", "whatsapp")
      .eq("external_event_id", externalEventId)
      .maybeSingle();

    if (!existing || existing.status !== "failed") {
      logger.info("meta_webhook.duplicate_event_ignored");
      return Response.json({ received: true, duplicate: true, status: "duplicate_event_ignored" }, { status: 200 });
    }

    const previousAttempts = Number(existing.retry_count ?? 1);
    if (existing.dead_lettered_at || previousAttempts >= MAX_WEBHOOK_ATTEMPTS) {
      if (!existing.dead_lettered_at) {
        await supabase.from("webhook_events").update({ dead_lettered_at: new Date().toISOString(), next_retry_at: null })
          .eq("id", existing.id).eq("organization_id", activeConnection.organization_id);
        await recordWhatsAppAuditEvent({ organizationId: activeConnection.organization_id, eventType: "webhook_dead_lettered",
          metadata: { eventId: existing.id, retryCount: previousAttempts, reason: "retry_limit_reached" } });
      }
      return Response.json({ received: true, duplicate: true, status: "dead_lettered" }, { status: 200 });
    }

    attemptCount = previousAttempts + 1;
    const { data: claimed } = await supabase.from("webhook_events").update({
      status: "received", error_message: null, retry_count: attemptCount,
      last_attempt_at: new Date().toISOString(), next_retry_at: null,
    }).eq("id", existing.id).eq("organization_id", activeConnection.organization_id).eq("status", "failed")
      .select("id").maybeSingle();
    if (!claimed?.id) return Response.json({ received: true, duplicate: true, status: "duplicate_event_ignored" }, { status: 200 });
    eventId = claimed.id;
    retryingFailedEvent = true;
  }

  if (!eventId) return Response.json({ error: "webhook_persistence_failed" }, { status: 500 });
  logger.info(retryingFailedEvent ? "meta_webhook.failed_event_retry_started" : "meta_webhook.event_received", { eventId, eventType, attemptCount });

  if (messages) {
    try {
      const inbound = parseWhatsAppInbound(value ?? {});
      const persisted = await persistWhatsAppInbound({ organizationId: activeConnection.organization_id, connectionId: activeConnection.id, messages: inbound });
      await supabase.from("webhook_events").update({ status: "processed", processed_at: new Date().toISOString(), next_retry_at: null })
        .eq("id", eventId).eq("organization_id", activeConnection.organization_id);
      logger.info("meta_webhook.inbound_messages_persisted", { eventId, count: persisted.length, duplicates: persisted.filter((item) => item.duplicate).length });
    } catch (err) {
      const deadLetter = await markWebhookFailure({ eventId, organizationId: activeConnection.organization_id, attemptCount, errorMessage: "inbound_persistence_failed" });
      logger.error("meta_webhook.inbound_persistence_failed", err, { eventId, attemptCount, deadLetter });
      return deadLetter ? Response.json({ received: true, status: "dead_lettered" }, { status: 200 }) : Response.json({ error: "inbound_persistence_failed" }, { status: 500 });
    }
  } else if (Array.isArray(value?.statuses)) {
    try {
      for (const st of value.statuses as Array<Record<string, unknown>>) {
        if (typeof st.id !== "string" || typeof st.status !== "string") continue;
        const tsNum = typeof st.timestamp === "string" ? Number(st.timestamp) : typeof st.timestamp === "number" ? st.timestamp : Date.now() / 1000;
        const errList = Array.isArray(st.errors) ? st.errors as Array<Record<string, unknown>> : [];
        const firstErr = errList[0];
        await supabase.rpc("update_message_delivery_status", {
          p_organization_id: activeConnection.organization_id,
          p_provider_message_id: st.id,
          p_new_status: st.status,
          p_occurred_at: new Date(tsNum * 1000).toISOString(),
          p_error_payload: errList.length ? {
            errors: errList,
            error_code: firstErr?.code ? String(firstErr.code) : firstErr?.title ? String(firstErr.title) : "failed",
            error_message: firstErr?.message ? String(firstErr.message) : firstErr?.title ? String(firstErr.title) : "Delivery failed",
          } : null,
        });
      }
      await supabase.from("webhook_events").update({ status: "processed", processed_at: new Date().toISOString(), next_retry_at: null })
        .eq("id", eventId).eq("organization_id", activeConnection.organization_id);
      logger.info("meta_webhook.statuses_updated", { eventId, count: value.statuses.length });
    } catch (err) {
      const deadLetter = await markWebhookFailure({ eventId, organizationId: activeConnection.organization_id, attemptCount, errorMessage: "status_update_failed" });
      logger.error("meta_webhook.status_update_failed", err, { eventId, attemptCount, deadLetter });
      return deadLetter ? Response.json({ received: true, status: "dead_lettered" }, { status: 200 }) : Response.json({ error: "status_update_failed" }, { status: 500 });
    }
  } else {
    await supabase.from("webhook_events").update({ status: "processed", processed_at: new Date().toISOString(), next_retry_at: null })
      .eq("id", eventId).eq("organization_id", activeConnection.organization_id);
  }

  return Response.json({ received: true, eventId }, { status: 200 });
}
