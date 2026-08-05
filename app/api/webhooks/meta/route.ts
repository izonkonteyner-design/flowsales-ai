import type { NextRequest } from "next/server";
import crypto from "node:crypto";
import { getWhatsAppConfig } from "@/server/services/integrations/whatsapp-config";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { WhatsAppConnectionsRepository } from "@/server/repositories/supabase/whatsapp-connections";
import { checkRateLimit } from "@/server/services/integrations/rate-limiter";
import { logger } from "@/lib/logger";

/**
 * GET /api/webhooks/meta — Meta Webhook Verification Challenge
 */
export async function GET(request: NextRequest): Promise<Response> {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const clientIp = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown_ip";

  // Rate limit GET challenge attempts (20 requests per minute per IP)
  const rl = await checkRateLimit(clientIp, "webhook_verification_attempts", 20, 60000);
  if (!rl.allowed) {
    logger.warn("meta_webhook.get_rate_limit_exceeded");
    return Response.json({ error: "rate_limit_exceeded", message: "Too many verification requests." }, { status: 429 });
  }

  const config = getWhatsAppConfig();
  const expectedToken = config.webhookVerifyToken;

  if (mode === "subscribe" && token && expectedToken && token === expectedToken) {
    logger.info("meta_webhook.verify_success");
    return new Response(challenge || "", { status: 200 });
  }

  logger.warn("meta_webhook.verify_failed");
  return Response.json({ error: "forbidden", message: "Webhook verification failed." }, { status: 403 });
}

/**
 * POST /api/webhooks/meta — Meta Webhook Event Ingestion
 */
export async function POST(request: NextRequest): Promise<Response> {
  const clientIp = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown_ip";

  // Rate limit total POST requests (100 requests per minute per IP)
  const postRl = await checkRateLimit(clientIp, "webhook_post", 100, 60000);
  if (!postRl.allowed) {
    logger.warn("meta_webhook.post_rate_limit_exceeded");
    return Response.json({ error: "rate_limit_exceeded", message: "Too many webhook requests." }, { status: 429 });
  }

  // 1. Signature Verification (HMAC-SHA256)
  const signatureHeader = request.headers.get("x-hub-signature-256");
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    await checkRateLimit(clientIp, "invalid_webhook_signature", 10, 600000);
    logger.warn("meta_webhook.missing_signature_header");
    return Response.json({ error: "invalid_signature", message: "Missing or invalid signature header." }, { status: 401 });
  }

  const rawBody = await request.text();
  const config = getWhatsAppConfig();
  const appSecret = config.appSecret;

  if (!appSecret) {
    logger.error("meta_webhook.missing_app_secret");
    return Response.json({ error: "configuration_error", message: "Webhook secret is not configured." }, { status: 500 });
  }

  const expectedSignature = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const providedSignature = signatureHeader.slice(7);

  const isValidSignature =
    providedSignature.length === expectedSignature.length &&
    crypto.timingSafeEqual(Buffer.from(providedSignature, "utf-8"), Buffer.from(expectedSignature, "utf-8"));

  if (!isValidSignature) {
    const sigRl = await checkRateLimit(clientIp, "invalid_webhook_signature", 10, 600000);
    logger.warn("meta_webhook.signature_mismatch", { remainingAttempts: sigRl.remaining });
    return Response.json({ error: "invalid_signature", message: "HMAC signature verification failed." }, { status: 401 });
  }

  // 2. Parse JSON payload safely
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    logger.warn("meta_webhook.invalid_json_payload");
    return Response.json({ error: "invalid_json", message: "Failed to parse webhook JSON payload." }, { status: 400 });
  }

  // 3. Extract identifiers for workspace resolution and deterministik idempotency
  const entry = Array.isArray(payload.entry) ? (payload.entry[0] as Record<string, unknown> | undefined) : null;
  const changes = Array.isArray(entry?.changes) ? (entry.changes[0] as Record<string, unknown> | undefined) : null;
  const value = changes?.value as Record<string, unknown> | undefined;
  const metadata = value?.metadata as Record<string, unknown> | undefined;

  const wabaId = (entry?.id as string) || (metadata?.waba_id as string) || undefined;
  const phoneNumberId = (metadata?.phone_number_id as string) || undefined;

  const messages = Array.isArray(value?.messages) ? (value.messages[0] as Record<string, unknown> | undefined) : null;
  const statuses = Array.isArray(value?.statuses) ? (value.statuses[0] as Record<string, unknown> | undefined) : null;

  // 4. Deterministik Idempotency Key
  let externalEventId: string;
  if (messages?.id && typeof messages.id === "string") {
    externalEventId = messages.id;
  } else if (statuses?.id && typeof statuses.id === "string") {
    const statusVal = (statuses.status as string) || "status";
    const tsVal = (statuses.timestamp as string) || "";
    externalEventId = `${statuses.id}_${statusVal}_${tsVal}`;
  } else if (entry?.id && changes?.field) {
    const tsVal = (value?.timestamp as string) || "";
    externalEventId = `${entry.id}_${changes.field}_${tsVal}`;
  } else {
    // Fallback: SHA-256 hash of rawBody
    externalEventId = crypto.createHash("sha256").update(rawBody).digest("hex");
  }

  const eventType = (changes?.field as string) || (payload.object as string) || "whatsapp_business_account";

  // 5. Workspace Resolution — Match active WhatsApp connection
  const repo = new WhatsAppConnectionsRepository();
  let activeConnection: { id: string; organization_id: string } | null = null;

  try {
    activeConnection = await repo.findActiveConnectionForWebhook(wabaId, phoneNumberId);
  } catch (err) {
    logger.error("meta_webhook.active_connection_lookup_error", err);
    // Transient database error -> return 500 so Meta retries delivery
    return Response.json({ error: "database_error", message: "Failed to query channel connections." }, { status: 500 });
  }

  if (!activeConnection) {
    // Valid signature but unknown / revoked WABA -> return 200 OK ignored to prevent infinite Meta retry storms
    logger.info("meta_webhook.unknown_connection_ignored", { eventType });
    return Response.json(
      { received: true, status: "ignored", reason: "unknown_connection", message: "No active WhatsApp connection registered for this account or phone number." },
      { status: 200 }
    );
  }

  // 6. Persistence into webhook_events associated with active workspace
  const supabase = createSupabaseAdminClient();
  const { data: inserted, error: insertErr } = await supabase
    .from("webhook_events")
    .insert({
      organization_id: activeConnection.organization_id,
      provider: "whatsapp",
      external_event_id: externalEventId,
      event_type: eventType,
      payload: payload,
      status: "received",
      received_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertErr) {
    // Handle unique constraint violation (duplicate event)
    if (insertErr.code === "23505") {
      logger.info("meta_webhook.duplicate_event_ignored", { externalEventId });
      return Response.json({ received: true, duplicate: true, status: "duplicate_event_ignored" }, { status: 200 });
    }

    logger.error("meta_webhook.persistence_failed", insertErr);
    return Response.json({ error: "webhook_persistence_failed", message: "Failed to persist webhook event." }, { status: 500 });
  }

  logger.info("meta_webhook.event_received", { eventId: inserted.id, eventType });
  return Response.json({ received: true, eventId: inserted.id }, { status: 200 });
}
