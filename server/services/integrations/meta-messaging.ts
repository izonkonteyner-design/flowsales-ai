import "server-only";

import crypto from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { decryptToken } from "@/server/services/integrations/encryption";
import type { MetaMessagingProvider } from "@/server/services/integrations/meta-messaging-oauth";
import { checkRateLimit, DistributedRateLimitUnavailableError } from "@/server/services/integrations/rate-limiter";
import { validateCustomerWindow } from "@/lib/utils/customer-window";
import { DEMO_ORGANIZATION_ID } from "@/server/repositories/supabase/omnichannel-inbox";
import { logger } from "@/lib/logger";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION?.trim() || "v26.0";
const FACEBOOK_GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const INSTAGRAM_GRAPH_BASE = `https://graph.instagram.com/${GRAPH_VERSION}`;
const MAX_WEBHOOK_ATTEMPTS = 5;

export type MetaMessagingWebhookPayload = Record<string, unknown>;

type MessagingEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: Array<{ type?: string; payload?: { url?: string } }> };
  delivery?: { mids?: string[]; watermark?: number };
  read?: { watermark?: number };
};

async function audit(input: {
  organizationId: string;
  provider: MetaMessagingProvider;
  conversationId?: string | null;
  messageId?: string | null;
  actorUserId?: string | null;
  eventType: string;
  metadata?: Record<string, unknown>;
}) {
  const admin = createSupabaseAdminClient();
  await admin.from("omnichannel_audit_events").insert({
    organization_id: input.organizationId,
    provider: input.provider,
    conversation_id: input.conversationId ?? null,
    message_id: input.messageId ?? null,
    actor_user_id: input.actorUserId ?? null,
    event_type: input.eventType,
    metadata: input.metadata ?? {},
  });
}

async function findConnectedAccount(provider: MetaMessagingProvider, accountId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("channel_connections")
    .select("id,organization_id,external_account_id,status")
    .eq("provider", provider)
    .eq("external_account_id", accountId)
    .eq("status", "connected");
  if (error) throw new Error("Failed to resolve Meta messaging connection.");
  if (!data || data.length !== 1) return null;
  return data[0] as { id: string; organization_id: string; external_account_id: string; status: string };
}

async function findConnectionForEvent(provider: MetaMessagingProvider, entryId: string, event: MessagingEvent) {
  const candidates = [entryId, event.recipient?.id, event.sender?.id]
    .filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);
  for (const accountId of candidates) {
    const connection = await findConnectedAccount(provider, accountId);
    if (connection) return { connection, accountId };
  }
  return null;
}

async function persistInbound(params: {
  provider: MetaMessagingProvider;
  connectionId: string;
  organizationId: string;
  customerExternalId: string;
  accountExternalId: string;
  event: MessagingEvent;
}) {
  const admin = createSupabaseAdminClient();
  const externalMessageId = params.event.message?.mid;
  if (!externalMessageId || params.event.message?.is_echo) return { duplicate: false, ignored: true };

  const { data: existing } = await admin.from("messages").select("id")
    .eq("organization_id", params.organizationId).eq("provider", params.provider).eq("external_id", externalMessageId).maybeSingle();
  if (existing?.id) return { duplicate: true, ignored: false, messageId: existing.id };

  const contactPayload = {
    organization_id: params.organizationId,
    provider: params.provider,
    external_id: params.customerExternalId,
    display_name: params.provider === "instagram" ? "Instagram Contact" : "Messenger Contact",
    metadata: { account_external_id: params.accountExternalId },
    updated_at: new Date().toISOString(),
  };
  const { data: contact, error: contactError } = await admin.from("channel_contacts")
    .upsert(contactPayload, { onConflict: "organization_id,provider,external_id" })
    .select("id").single();
  if (contactError || !contact) throw new Error("Failed to persist Meta channel contact.");

  const { data: conversation, error: convError } = await admin.from("conversations").upsert({
    organization_id: params.organizationId,
    connection_id: params.connectionId,
    provider: params.provider,
    external_id: params.customerExternalId,
    status: "open",
    channel_contact_id: contact.id,
    last_message_at: new Date(params.event.timestamp || Date.now()).toISOString(),
    metadata: { account_external_id: params.accountExternalId },
    updated_at: new Date().toISOString(),
  }, { onConflict: "organization_id,provider,external_id" }).select("id,unread_count").single();
  if (convError || !conversation) throw new Error("Failed to persist Meta conversation.");

  const attachments = params.event.message?.attachments ?? [];
  const messageType = attachments.length > 0
    ? (["image", "video", "audio"].includes(attachments[0]?.type || "") ? attachments[0]!.type! : "document")
    : "text";
  const sentAt = new Date(params.event.timestamp || Date.now()).toISOString();
  const { data: message, error: messageError } = await admin.from("messages").insert({
    organization_id: params.organizationId,
    conversation_id: conversation.id,
    provider: params.provider,
    external_id: externalMessageId,
    direction: "inbound",
    message_type: messageType,
    body: params.event.message?.text ?? null,
    sender_contact_id: contact.id,
    status: "delivered",
    sent_at: sentAt,
    delivered_at: sentAt,
    metadata: { account_external_id: params.accountExternalId },
  }).select("id").single();
  if (messageError || !message) {
    if (messageError?.code === "23505") return { duplicate: true, ignored: false };
    throw new Error("Failed to persist Meta inbound message.");
  }

  if (attachments.length) {
    await admin.from("message_attachments").insert(attachments.map((attachment) => ({
      organization_id: params.organizationId,
      message_id: message.id,
      attachment_type: ["image", "video", "audio"].includes(attachment.type || "") ? attachment.type : "document",
      external_url: attachment.payload?.url ?? null,
      metadata: { provider: params.provider },
    })));
  }

  await admin.from("conversations").update({
    unread_count: Number(conversation.unread_count ?? 0) + 1,
    last_message_at: sentAt,
    updated_at: new Date().toISOString(),
  }).eq("id", conversation.id).eq("organization_id", params.organizationId);
  await audit({ organizationId: params.organizationId, provider: params.provider, conversationId: conversation.id, messageId: message.id, eventType: "message_received" });
  return { duplicate: false, ignored: false, conversationId: conversation.id, messageId: message.id };
}

async function recordWebhook(params: {
  organizationId: string;
  provider: MetaMessagingProvider;
  externalEventId: string;
  eventType: string;
  payload: unknown;
}) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("webhook_events").insert({
    organization_id: params.organizationId,
    provider: params.provider,
    external_event_id: params.externalEventId,
    event_type: params.eventType,
    payload: params.payload,
    status: "received",
    retry_count: 0,
    last_attempt_at: new Date().toISOString(),
  }).select("id").single();
  if (!error && data) return { id: data.id as string, duplicate: false };
  if (error?.code === "23505") return { id: null, duplicate: true };
  throw new Error("Failed to persist Meta webhook event.");
}

export async function handleMetaMessagingWebhook(payload: MetaMessagingWebhookPayload): Promise<Response> {
  const object = typeof payload.object === "string" ? payload.object : "";
  const provider: MetaMessagingProvider | null = object === "instagram" ? "instagram" : object === "page" ? "facebook" : null;
  if (!provider) return Response.json({ received: true, status: "ignored", reason: "unsupported_object" }, { status: 200 });

  const entries = Array.isArray(payload.entry) ? payload.entry as Array<Record<string, unknown>> : [];
  let processed = 0;
  let duplicates = 0;
  let unmatched = 0;
  for (const entry of entries) {
    const entryId = typeof entry.id === "string" ? entry.id : "";
    const events = Array.isArray(entry.messaging) ? entry.messaging as MessagingEvent[] : [];
    for (const event of events) {
      const senderId = event.sender?.id || "";
      if (!entryId || !senderId) continue;
      const resolved = await findConnectionForEvent(provider, entryId, event);
      if (!resolved) {
        unmatched += 1;
        logger.warn("meta_messaging_webhook.connection_not_found", { provider, entryId, hasRecipient: Boolean(event.recipient?.id), hasSender: Boolean(event.sender?.id) });
        continue;
      }
      const { connection, accountId } = resolved;

      const externalEventId = event.message?.mid
        || `${provider}_${senderId}_${accountId}_${event.timestamp || ""}_${crypto.createHash("sha256").update(JSON.stringify(event)).digest("hex").slice(0, 16)}`;
      const stored = await recordWebhook({ organizationId: connection.organization_id, provider, externalEventId, eventType: event.message ? "message" : event.delivery ? "delivery" : event.read ? "read" : "event", payload: event });
      if (stored.duplicate) { duplicates += 1; continue; }

      const admin = createSupabaseAdminClient();
      try {
        if (event.message) {
          await persistInbound({ provider, connectionId: connection.id, organizationId: connection.organization_id, customerExternalId: senderId, accountExternalId: accountId, event });
        }
        if (stored.id) await admin.from("webhook_events").update({ status: "processed", processed_at: new Date().toISOString() }).eq("id", stored.id).eq("organization_id", connection.organization_id);
        processed += 1;
      } catch (error) {
        if (stored.id) await admin.from("webhook_events").update({
          status: "failed", retry_count: 1, error_message: "meta_messaging_processing_failed", last_attempt_at: new Date().toISOString(),
          next_retry_at: new Date(Date.now() + 120_000).toISOString(), dead_lettered_at: null,
        }).eq("id", stored.id).eq("organization_id", connection.organization_id);
        logger.error("meta_messaging_webhook.processing_failed", error, { provider, organizationId: connection.organization_id });
        throw error;
      }
    }
  }
  logger.info("meta_messaging_webhook.processed", { provider, entries: entries.length, processed, duplicates, unmatched });
  return Response.json({ received: true, provider, processed, duplicates, unmatched }, { status: 200 });
}

export async function sendMetaMessagingReply(params: {
  organizationId: string;
  userId: string;
  userRole: string;
  conversationId: string;
  text: string;
  clientIdempotencyKey: string;
}) {
  if (params.organizationId === DEMO_ORGANIZATION_ID || params.userRole === "viewer") {
    return { success: false as const, errorCode: "unauthorized", message: "Read-only access." };
  }
  const text = params.text?.trim();
  if (!text || text.length > 4000) return { success: false as const, errorCode: "invalid_input", message: "Message text must be between 1 and 4000 characters." };
  if (!params.clientIdempotencyKey || params.clientIdempotencyKey.length > 160) return { success: false as const, errorCode: "invalid_input", message: "A client idempotency key is required." };

  const admin = createSupabaseAdminClient();
  const { data: conversation } = await admin.from("conversations")
    .select("id,organization_id,provider,external_id,connection_id")
    .eq("id", params.conversationId).eq("organization_id", params.organizationId).maybeSingle();
  if (!conversation || !["instagram", "facebook"].includes(conversation.provider)) return { success: false as const, errorCode: "not_found", message: "Meta messaging conversation not found." };
  const provider = conversation.provider as MetaMessagingProvider;

  const { data: duplicate } = await admin.from("messages").select("id,external_id,status")
    .eq("organization_id", params.organizationId).eq("conversation_id", params.conversationId).eq("direction", "outbound")
    .contains("metadata", { client_idempotency_key: params.clientIdempotencyKey }).maybeSingle();
  if (duplicate) return { success: true as const, data: { messageId: duplicate.id, externalMessageId: duplicate.external_id, status: duplicate.status, duplicate: true } };

  const { data: lastInbound } = await admin.from("messages").select("sent_at,created_at")
    .eq("organization_id", params.organizationId)
    .eq("conversation_id", params.conversationId)
    .eq("direction", "inbound")
    .order("sent_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const window = validateCustomerWindow(lastInbound?.sent_at || lastInbound?.created_at);
  if (!window.allowed) {
    return {
      success: false as const,
      errorCode: "window_closed",
      message: "The 24-hour Meta standard messaging window is closed. FlowSales will not send a standard reply outside the permitted window.",
    };
  }

  try {
    const rate = await checkRateLimit(
      `${params.organizationId}_${params.userId}_${provider}`,
      "meta_messaging_outbound_reply",
      30,
      60_000,
    );
    if (!rate.allowed) return { success: false as const, errorCode: "rate_limit_exceeded", message: "Too many outbound replies. Please retry later." };
  } catch (error) {
    if (error instanceof DistributedRateLimitUnavailableError) {
      return { success: false as const, errorCode: "rate_limit_unavailable", message: "Outbound request protection is temporarily unavailable." };
    }
    throw error;
  }

  const { data: connection } = await admin.from("channel_connections").select("id,status,external_account_id")
    .eq("id", conversation.connection_id).eq("organization_id", params.organizationId).eq("provider", provider).maybeSingle();
  if (!connection || connection.status !== "connected" || !connection.external_account_id) return { success: false as const, errorCode: "connection_required", message: `${provider} connection must be reconnected.` };
  const { data: tokenRow } = await admin.from("integration_tokens").select("access_token_cipher")
    .eq("connection_id", connection.id).eq("organization_id", params.organizationId).maybeSingle();
  if (!tokenRow?.access_token_cipher) return { success: false as const, errorCode: "connection_required", message: "Encrypted Meta messaging token is missing." };
  const token = decryptToken(tokenRow.access_token_cipher);

  const graphBase = provider === "instagram" ? INSTAGRAM_GRAPH_BASE : FACEBOOK_GRAPH_BASE;
  const response = await fetch(`${graphBase}/${encodeURIComponent(connection.external_account_id)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: conversation.external_id }, message: { text }, ...(provider === "facebook" ? { messaging_type: "RESPONSE" } : {}) }),
    cache: "no-store",
  });
  const result = (await response.json().catch(() => ({}))) as { message_id?: string; recipient_id?: string; error?: { code?: number } };
  if (!response.ok || !result.message_id) {
    await audit({ organizationId: params.organizationId, provider, conversationId: params.conversationId, actorUserId: params.userId, eventType: "message_failed", metadata: { httpStatus: response.status, errorCode: result.error?.code ?? null } });
    return { success: false as const, errorCode: "send_failed", message: `Meta messaging send failed (${response.status}).` };
  }

  const now = new Date().toISOString();
  const { data: message, error } = await admin.from("messages").insert({
    organization_id: params.organizationId, conversation_id: params.conversationId, provider, external_id: result.message_id,
    direction: "outbound", message_type: "text", body: text, sender_user_id: params.userId, status: "sent", sent_at: now,
    metadata: { client_idempotency_key: params.clientIdempotencyKey, account_external_id: connection.external_account_id },
  }).select("id").single();
  if (error || !message) return { success: false as const, errorCode: "persistence_failed", message: "Message was accepted by Meta but local persistence failed." };
  await admin.from("conversations").update({ last_message_at: now, updated_at: now }).eq("id", params.conversationId).eq("organization_id", params.organizationId);
  await audit({ organizationId: params.organizationId, provider, conversationId: params.conversationId, messageId: message.id, actorUserId: params.userId, eventType: "message_sent", metadata: { externalMessageId: result.message_id } });
  return { success: true as const, data: { messageId: message.id, externalMessageId: result.message_id, status: "sent", duplicate: false } };
}

export { MAX_WEBHOOK_ATTEMPTS };