import type { NextRequest } from "next/server";
import crypto from "node:crypto";
import { getWhatsAppConfig } from "@/server/services/integrations/whatsapp-config";
import { parseMetaMessagingWebhook, persistMetaMessagingInbound } from "@/server/services/integrations/meta-messaging";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = getWhatsAppConfig().webhookVerifyToken;
  if (mode === "subscribe" && token && expected && token === expected) return new Response(challenge ?? "", { status: 200 });
  return Response.json({ error: "forbidden" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get("x-hub-signature-256");
  if (!signature?.startsWith("sha256=")) return Response.json({ error: "invalid_signature" }, { status: 401 });
  const rawBody = await request.text();
  const secret = getWhatsAppConfig().appSecret;
  if (!secret) return Response.json({ error: "configuration_error" }, { status: 500 });
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = signature.slice(7);
  if (provided.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
    return Response.json({ error: "invalid_signature" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try { payload = JSON.parse(rawBody) as Record<string, unknown>; }
  catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }

  const messages = parseMetaMessagingWebhook(payload);
  if (messages.length === 0) return Response.json({ received: true, status: "ignored" });
  const admin = createSupabaseAdminClient();
  const provider = messages[0].provider;
  const externalEventId = crypto.createHash("sha256").update(rawBody).digest("hex");
  const assetId = messages[0].recipientAssetId;
  const { data: account } = await admin.from("channel_accounts")
    .select("organization_id")
    .eq("provider", provider)
    .or(`external_id.eq.${assetId},parent_external_id.eq.${assetId}`)
    .maybeSingle();
  if (!account) {
    logger.info("meta_messaging_webhook.unknown_asset_ignored", { provider });
    return Response.json({ received: true, status: "ignored", reason: "unknown_asset" });
  }

  const { data: event, error: insertError } = await admin.from("webhook_events").insert({
    organization_id: account.organization_id,
    provider,
    external_event_id: externalEventId,
    event_type: "messages",
    payload,
    status: "received",
    retry_count: 0,
    received_at: new Date().toISOString(),
  }).select("id").single();
  if (insertError?.code === "23505") return Response.json({ received: true, duplicate: true });
  if (insertError || !event) return Response.json({ error: "webhook_persistence_failed" }, { status: 500 });

  try {
    const result = await persistMetaMessagingInbound(messages);
    await admin.from("webhook_events").update({ status: "processed", processed_at: new Date().toISOString() })
      .eq("id", event.id).eq("organization_id", account.organization_id);
    return Response.json({ received: true, persisted: result.length, duplicates: result.filter((x) => x.duplicate).length });
  } catch (error) {
    await admin.from("webhook_events").update({ status: "failed", error_message: "messaging_persistence_failed", retry_count: 1 })
      .eq("id", event.id).eq("organization_id", account.organization_id);
    logger.error("meta_messaging_webhook.persistence_failed", error, { provider, eventId: event.id });
    return Response.json({ error: "messaging_persistence_failed" }, { status: 500 });
  }
}
