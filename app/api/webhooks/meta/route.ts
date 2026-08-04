import type { NextRequest } from "next/server";
import crypto from "node:crypto";
import { getWhatsAppConfig } from "@/server/services/integrations/whatsapp-config";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";

/**
 * GET /api/webhooks/meta — Meta Webhook Verification Challenge
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const verifyToken = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const config = getWhatsAppConfig();

  if (!config.webhookVerifyToken || !verifyToken) {
    return new Response("Forbidden: Webhook verify token is not configured.", { status: 403 });
  }

  if (mode === "subscribe" && verifyToken === config.webhookVerifyToken) {
    return new Response(challenge || "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return new Response("Forbidden: Invalid verify token.", { status: 403 });
}

/**
 * POST /api/webhooks/meta — Meta Webhook Event Ingestion
 */
export async function POST(request: NextRequest) {
  const config = getWhatsAppConfig();

  // Fail-closed if app secret is not configured
  if (!config.appSecret) {
    return Response.json(
      { error: "configuration_required", message: "META_APP_SECRET is not configured." },
      { status: 500 }
    );
  }

  const signatureHeader = request.headers.get("x-hub-signature-256") || "";
  if (!signatureHeader.startsWith("sha256=")) {
    return Response.json(
      { error: "invalid_signature", message: "X-Hub-Signature-256 header is missing or malformed." },
      { status: 401 }
    );
  }

  const rawBody = await request.text();
  const expectedSignature = signatureHeader.slice(7);

  // Compute HMAC-SHA256 over raw body
  const hmac = crypto.createHmac("sha256", config.appSecret);
  hmac.update(rawBody);
  const calculatedSignature = hmac.digest("hex");

  // Constant-time comparison
  const isSignatureValid =
    expectedSignature.length === calculatedSignature.length &&
    crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(calculatedSignature));

  if (!isSignatureValid) {
    return Response.json(
      { error: "invalid_signature", message: "Signature verification failed." },
      { status: 401 }
    );
  }

  // Parse JSON payload safely
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid_json", message: "Failed to parse webhook JSON payload." }, { status: 400 });
  }

  // Extract external event ID for duplicate detection
  const entry = Array.isArray(payload.entry) ? (payload.entry[0] as Record<string, unknown> | undefined) : null;
  const changes = Array.isArray(entry?.changes) ? (entry.changes[0] as Record<string, unknown> | undefined) : null;
  const value = changes?.value as Record<string, unknown> | undefined;
  const messages = Array.isArray(value?.messages) ? (value.messages[0] as Record<string, unknown> | undefined) : null;
  const statuses = Array.isArray(value?.statuses) ? (value.statuses[0] as Record<string, unknown> | undefined) : null;
  const messageId = (messages?.id as string) || (statuses?.id as string);
  const externalEventId = messageId || (entry?.id as string) || `evt_${crypto.randomUUID()}`;
  const eventType = (changes?.field as string) || (payload.object as string) || "whatsapp_business_account";

  const supabase = createSupabaseAdminClient();

  // Idempotency check: duplicate event protection
  const { data: existing } = await supabase
    .from("webhook_events")
    .select("id")
    .eq("provider", "whatsapp")
    .eq("external_event_id", externalEventId)
    .maybeSingle();

  if (existing) {
    return Response.json({ received: true, duplicate: true, status: "duplicate_event_ignored" }, { status: 200 });
  }

  // Record verified webhook event
  await supabase.from("webhook_events").insert({
    provider: "whatsapp",
    external_event_id: externalEventId,
    event_type: eventType,
    payload: payload,
    status: "received",
    received_at: new Date().toISOString(),
  });

  return Response.json({ received: true, status: "processed" }, { status: 200 });
}
