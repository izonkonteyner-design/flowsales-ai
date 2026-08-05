import type { NextRequest } from "next/server";
import crypto from "node:crypto";
import { getWhatsAppConfig } from "@/server/services/integrations/whatsapp-config";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { WhatsAppConnectionsRepository } from "@/server/repositories/supabase/whatsapp-connections";
import { checkRateLimit, DistributedRateLimitUnavailableError } from "@/server/services/integrations/rate-limiter";
import { logger } from "@/lib/logger";
import { parseWhatsAppInbound, persistWhatsAppInbound } from "@/server/services/integrations/whatsapp-inbound";

function rateLimitUnavailableResponse(): Response {
  return Response.json(
    { error: "rate_limit_unavailable", message: "Request protection is temporarily unavailable." },
    { status: 503 }
  );
}

const DEMO_ORGANIZATION_ID = "d3e00000-0000-0000-0000-000000000000";

async function rebindSignedSingleOrganizationConnection(
  repo: WhatsAppConnectionsRepository,
  wabaId: string | undefined,
  phoneNumberId: string | undefined,
  metadata: Record<string, unknown> | undefined,
): Promise<{ id: string; organization_id: string } | null> {
  if (process.env.META_AUTO_BIND_SINGLE_OWNER !== "true" || !wabaId || !phoneNumberId) return null;
  if (!/^\d{1,64}$/.test(wabaId) || !/^\d{1,64}$/.test(phoneNumberId)) return null;
  const supabase = createSupabaseAdminClient();
  const { data: memberships, error } = await supabase.from("organization_members")
    .select("organization_id, user_id, role").in("role", ["owner", "admin"])
    .neq("organization_id", DEMO_ORGANIZATION_ID);
  if (error) throw new Error("Authorized organization resolution failed.");
  const organizationIds = [...new Set((memberships ?? []).map((row) => row.organization_id))];
  if (organizationIds.length !== 1) return null;
  const organizationId = organizationIds[0];
  const actor = (memberships ?? []).find((row) => row.organization_id === organizationId && row.role === "owner")
    ?? (memberships ?? []).find((row) => row.organization_id === organizationId);
  if (!actor?.user_id) return null;
  const conflict = await repo.findGlobalExistingConnection(wabaId, phoneNumberId);
  if (conflict && conflict.organization_id !== organizationId) {
    logger.error("meta_webhook.rebind_cross_workspace_conflict");
    return null;
  }
  const current = await repo.getWhatsAppConnectionForOrg(organizationId);
  if (!current || current.status !== "connected") return null;
  const displayPhoneNumber = typeof metadata?.display_phone_number === "string" ? metadata.display_phone_number : "";
  const verifiedName = typeof metadata?.verified_name === "string" ? metadata.verified_name : "WhatsApp Business";
  const connection = await repo.upsertWhatsAppConnection({ organizationId, wabaId, phoneNumberId,
    verifiedName, displayPhoneNumber, webhookSubscribedAt: new Date().toISOString(),
    createdBy: actor.user_id, status: "connected" });
  await repo.reconcileWhatsAppAccount(organizationId, connection.id, { phoneNumberId, verifiedName, displayPhoneNumber, wabaId });
  logger.info("meta_webhook.signed_single_org_rebind_completed");
  return { id: connection.id, organization_id: organizationId };
}

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
  try {
    const rl = await checkRateLimit(clientIp, "webhook_verification_attempts", 20, 60000);
    if (!rl.allowed) {
      logger.warn("meta_webhook.get_rate_limit_exceeded");
      return Response.json({ error: "rate_limit_exceeded", message: "Too many verification requests." }, { status: 429 });
    }
  } catch (err) {
    if (err instanceof DistributedRateLimitUnavailableError) {
      return rateLimitUnavailableResponse();
    }
    throw err;
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
  try {
    const postRl = await checkRateLimit(clientIp, "webhook_post", 100, 60000);
    if (!postRl.allowed) {
      logger.warn("meta_webhook.post_rate_limit_exceeded");
      return Response.json({ error: "rate_limit_exceeded", message: "Too many webhook requests." }, { status: 429 });
    }
  } catch (err) {
    if (err instanceof DistributedRateLimitUnavailableError) {
      return rateLimitUnavailableResponse();
    }
    throw err;
  }

  // 1. Signature Verification (HMAC-SHA256)
  const signatureHeader = request.headers.get("x-hub-signature-256");
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    try {
      await checkRateLimit(clientIp, "invalid_webhook_signature", 10, 600000);
    } catch (err) {
      if (err instanceof DistributedRateLimitUnavailableError) {
        return rateLimitUnavailableResponse();
      }
      throw err;
    }
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
    let remainingAttempts = 0;
    try {
      const sigRl = await checkRateLimit(clientIp, "invalid_webhook_signature", 10, 600000);
      remainingAttempts = sigRl.remaining;
    } catch (err) {
      if (err instanceof DistributedRateLimitUnavailableError) {
        return rateLimitUnavailableResponse();
      }
      throw err;
    }
    logger.warn("meta_webhook.signature_mismatch", { remainingAttempts });
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
    if (!activeConnection) {
      activeConnection = await rebindSignedSingleOrganizationConnection(repo, wabaId, phoneNumberId, metadata);
    }
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

  let eventId = inserted?.id as string | undefined;
  let retryingFailedEvent = false;

  if (insertErr) {
    // Handle unique constraint violation (duplicate event)
    if (insertErr.code === "23505") {
      const { data: claimed } = await supabase
        .from("webhook_events")
        .update({ status: "received", error_message: null })
        .eq("organization_id", activeConnection.organization_id)
        .eq("provider", "whatsapp")
        .eq("external_event_id", externalEventId)
        .eq("status", "failed")
        .select("id")
        .maybeSingle();
      if (!claimed?.id) {
        logger.info("meta_webhook.duplicate_event_ignored");
        return Response.json({ received: true, duplicate: true, status: "duplicate_event_ignored" }, { status: 200 });
      }
      eventId = claimed.id;
      retryingFailedEvent = true;
    } else {
      logger.error("meta_webhook.persistence_failed", insertErr);
      return Response.json({ error: "webhook_persistence_failed", message: "Failed to persist webhook event." }, { status: 500 });
    }
  }

  if (!eventId) return Response.json({ error: "webhook_persistence_failed" }, { status: 500 });
  logger.info(retryingFailedEvent ? "meta_webhook.failed_event_retry_started" : "meta_webhook.event_received", { eventId, eventType });
  if (messages) {
    try {
      const inbound = parseWhatsAppInbound(value ?? {});
      const persisted = await persistWhatsAppInbound({
        organizationId: activeConnection.organization_id,
        connectionId: activeConnection.id,
        messages: inbound,
      });
      await supabase.from("webhook_events").update({ status: "processed", processed_at: new Date().toISOString() }).eq("id", eventId);
      logger.info("meta_webhook.inbound_messages_persisted", {
        eventId,
        count: persisted.length,
        duplicates: persisted.filter((item) => item.duplicate).length,
      });
    } catch (err) {
      await supabase.from("webhook_events").update({ status: "failed", error_message: "inbound_persistence_failed" }).eq("id", eventId);
      logger.error("meta_webhook.inbound_persistence_failed", err, { eventId });
      return Response.json({ error: "inbound_persistence_failed" }, { status: 500 });
    }
  }
  return Response.json({ received: true, eventId }, { status: 200 });
}
