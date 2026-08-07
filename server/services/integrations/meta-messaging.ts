import "server-only";

import crypto from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { decryptToken, encryptToken } from "@/server/services/integrations/encryption";
import { getWhatsAppConfig } from "@/server/services/integrations/whatsapp-config";

export type MetaMessagingProvider = "instagram" | "facebook";

type GraphPage = {
  id: string;
  name?: string;
  access_token?: string;
  instagram_business_account?: { id: string; username?: string; name?: string; profile_picture_url?: string };
};

export type MetaMessagingInbound = {
  provider: MetaMessagingProvider;
  recipientAssetId: string;
  senderId: string;
  messageId: string;
  text: string | null;
  timestamp: string;
  attachments: Array<{ type: string; url: string | null }>;
};

function baseUrl() {
  const { apiVersion } = getWhatsAppConfig();
  return `https://graph.facebook.com/${apiVersion}`;
}

async function graphJson(url: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  const json = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || json.error) {
    const error = json.error as Record<string, unknown> | undefined;
    throw new Error(typeof error?.message === "string" ? error.message : `Meta Graph request failed (${response.status})`);
  }
  return json;
}

export async function exchangeMetaCode(code: string, redirectUri: string) {
  const config = getWhatsAppConfig();
  const params = new URLSearchParams({ client_id: config.appId, client_secret: config.appSecret, redirect_uri: redirectUri, code });
  const token = await graphJson(`${baseUrl()}/oauth/access_token?${params.toString()}`);
  if (typeof token.access_token !== "string") throw new Error("Meta OAuth response did not include an access token.");
  return { accessToken: token.access_token, expiresIn: typeof token.expires_in === "number" ? token.expires_in : null };
}

export async function discoverMetaMessagingAssets(userAccessToken: string): Promise<GraphPage[]> {
  const query = new URLSearchParams({ fields: "id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}", access_token: userAccessToken });
  const result = await graphJson(`${baseUrl()}/me/accounts?${query.toString()}`);
  return Array.isArray(result.data) ? result.data as GraphPage[] : [];
}

export async function connectMetaMessagingAsset(params: {
  organizationId: string;
  userId: string;
  provider: MetaMessagingProvider;
  page: GraphPage;
}) {
  const admin = createSupabaseAdminClient();
  const asset = params.provider === "facebook" ? { id: params.page.id, name: params.page.name ?? "Facebook Page", username: null, picture: null }
    : params.page.instagram_business_account ? {
      id: params.page.instagram_business_account.id,
      name: params.page.instagram_business_account.name ?? params.page.instagram_business_account.username ?? "Instagram",
      username: params.page.instagram_business_account.username ?? null,
      picture: params.page.instagram_business_account.profile_picture_url ?? null,
    } : null;
  if (!asset) throw new Error("Selected Facebook Page is not linked to an Instagram professional account.");
  if (!params.page.access_token) throw new Error("Meta did not return a Page access token for the selected asset.");

  const { data: connection, error: connectionError } = await admin.from("channel_connections").upsert({
    organization_id: params.organizationId,
    provider: params.provider,
    status: "connected",
    display_name: asset.name,
    external_account_id: asset.id,
    scopes: params.provider === "facebook" ? ["pages_manage_metadata", "pages_messaging"] : ["instagram_basic", "instagram_manage_messages"],
    created_by: params.userId,
    updated_by: params.userId,
    last_connected_at: new Date().toISOString(),
    error_message: null,
  }, { onConflict: "organization_id,provider" }).select("id").single();
  if (connectionError || !connection) throw new Error("Failed to save Meta channel connection.");

  await admin.from("channel_accounts").upsert({
    organization_id: params.organizationId,
    connection_id: connection.id,
    provider: params.provider,
    external_id: asset.id,
    parent_external_id: params.page.id,
    external_username: asset.username,
    display_name: asset.name,
    profile_picture_url: asset.picture,
    metadata: { page_id: params.page.id },
  }, { onConflict: "organization_id,provider,external_id" });

  await admin.from("integration_tokens").upsert({
    organization_id: params.organizationId,
    connection_id: connection.id,
    provider: params.provider,
    access_token_cipher: encryptToken(params.page.access_token),
    refresh_token_cipher: null,
    token_type: "bearer",
    scopes: params.provider === "facebook" ? ["pages_manage_metadata", "pages_messaging"] : ["instagram_basic", "instagram_manage_messages"],
    updated_at: new Date().toISOString(),
  }, { onConflict: "connection_id" });

  const subscribed = await graphJson(`${baseUrl()}/${encodeURIComponent(params.page.id)}/subscribed_apps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${params.page.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ subscribed_fields: "messages,messaging_postbacks,message_reads" }),
  }).then((r) => r.success === true).catch(() => false);

  if (subscribed) {
    await admin.from("channel_accounts").update({ webhook_subscribed_at: new Date().toISOString() })
      .eq("organization_id", params.organizationId).eq("provider", params.provider).eq("external_id", asset.id);
  }

  return { connectionId: connection.id, assetId: asset.id, subscribed };
}

export function parseMetaMessagingWebhook(payload: Record<string, unknown>): MetaMessagingInbound[] {
  const object = payload.object;
  const provider: MetaMessagingProvider | null = object === "instagram" ? "instagram" : object === "page" ? "facebook" : null;
  if (!provider || !Array.isArray(payload.entry)) return [];
  const output: MetaMessagingInbound[] = [];

  for (const entryRaw of payload.entry as Array<Record<string, unknown>>) {
    const assetId = typeof entryRaw.id === "string" ? entryRaw.id : "";
    const messaging = Array.isArray(entryRaw.messaging) ? entryRaw.messaging as Array<Record<string, unknown>> : [];
    for (const event of messaging) {
      const sender = event.sender as Record<string, unknown> | undefined;
      const recipient = event.recipient as Record<string, unknown> | undefined;
      const message = event.message as Record<string, unknown> | undefined;
      if (!message || typeof message.mid !== "string" || typeof sender?.id !== "string") continue;
      const attachments = Array.isArray(message.attachments) ? message.attachments as Array<Record<string, unknown>> : [];
      output.push({
        provider,
        recipientAssetId: typeof recipient?.id === "string" ? recipient.id : assetId,
        senderId: sender.id,
        messageId: message.mid,
        text: typeof message.text === "string" ? message.text : null,
        timestamp: new Date(typeof event.timestamp === "number" ? event.timestamp : Date.now()).toISOString(),
        attachments: attachments.map((a) => ({ type: typeof a.type === "string" ? a.type : "document", url: typeof (a.payload as Record<string, unknown> | undefined)?.url === "string" ? String((a.payload as Record<string, unknown>).url) : null })),
      });
    }
  }
  return output;
}

export async function persistMetaMessagingInbound(items: MetaMessagingInbound[]) {
  const admin = createSupabaseAdminClient();
  const persisted: Array<{ messageId: string; duplicate: boolean }> = [];
  for (const item of items) {
    const { data: account } = await admin.from("channel_accounts")
      .select("connection_id,organization_id,external_id,parent_external_id")
      .eq("provider", item.provider)
      .or(`external_id.eq.${item.recipientAssetId},parent_external_id.eq.${item.recipientAssetId}`)
      .maybeSingle();
    if (!account) continue; // fail closed: never guess tenant

    const { data: contact, error: contactError } = await admin.from("channel_contacts").upsert({
      organization_id: account.organization_id,
      provider: item.provider,
      external_id: item.senderId,
      display_name: `${item.provider === "instagram" ? "Instagram" : "Messenger"} Contact`,
      metadata: {},
    }, { onConflict: "organization_id,provider,external_id" }).select("id").single();
    if (contactError || !contact) throw new Error("Failed to persist channel contact.");

    const externalConversationId = `${item.recipientAssetId}:${item.senderId}`;
    const { data: conversation, error: conversationError } = await admin.from("conversations").upsert({
      organization_id: account.organization_id,
      connection_id: account.connection_id,
      provider: item.provider,
      external_id: externalConversationId,
      status: "open",
      channel_contact_id: contact.id,
      last_message_at: item.timestamp,
      metadata: { recipient_asset_id: item.recipientAssetId },
    }, { onConflict: "organization_id,provider,external_id" }).select("id").single();
    if (conversationError || !conversation) throw new Error("Failed to persist conversation.");

    const messageType = item.attachments[0]?.type && ["image","video","audio"].includes(item.attachments[0].type) ? item.attachments[0].type : item.attachments.length ? "document" : "text";
    const { data: message, error: messageError } = await admin.from("messages").insert({
      organization_id: account.organization_id,
      conversation_id: conversation.id,
      provider: item.provider,
      external_id: item.messageId,
      direction: "inbound",
      message_type: messageType,
      body: item.text,
      sender_contact_id: contact.id,
      status: "delivered",
      sent_at: item.timestamp,
      delivered_at: item.timestamp,
      metadata: {},
    }).select("id").single();
    if (messageError?.code === "23505") { persisted.push({ messageId: item.messageId, duplicate: true }); continue; }
    if (messageError || !message) throw new Error("Failed to persist Meta message.");

    for (const attachment of item.attachments) {
      await admin.from("message_attachments").insert({
        organization_id: account.organization_id,
        message_id: message.id,
        attachment_type: ["image","video","audio"].includes(attachment.type) ? attachment.type : "document",
        external_url: attachment.url,
        metadata: { provider: item.provider },
      });
    }
    persisted.push({ messageId: item.messageId, duplicate: false });
  }
  return persisted;
}

export async function sendMetaMessagingText(params: { organizationId: string; userId: string; conversationId: string; text: string }) {
  const admin = createSupabaseAdminClient();
  const { data: conversation } = await admin.from("conversations")
    .select("id,provider,external_id,connection_id,metadata")
    .eq("id", params.conversationId).eq("organization_id", params.organizationId).maybeSingle();
  if (!conversation || !["instagram","facebook"].includes(conversation.provider)) throw new Error("Conversation is not an Instagram or Messenger thread.");
  const { data: token } = await admin.from("integration_tokens").select("access_token_cipher")
    .eq("connection_id", conversation.connection_id).eq("organization_id", params.organizationId).maybeSingle();
  if (!token?.access_token_cipher) throw new Error("Channel access token is unavailable.");
  const accessToken = decryptToken(token.access_token_cipher);
  const parts = String(conversation.external_id).split(":");
  const recipientId = parts.at(-1);
  const assetId = (conversation.metadata as Record<string, unknown> | null)?.recipient_asset_id;
  if (!recipientId || typeof assetId !== "string") throw new Error("Conversation addressing metadata is incomplete.");

  const result = await graphJson(`${baseUrl()}/${encodeURIComponent(assetId)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: recipientId }, message: { text: params.text } }),
  });
  const externalId = typeof result.message_id === "string" ? result.message_id : typeof result.id === "string" ? result.id : crypto.randomUUID();
  const { data: message, error } = await admin.from("messages").insert({
    organization_id: params.organizationId,
    conversation_id: params.conversationId,
    provider: conversation.provider,
    external_id: externalId,
    direction: "outbound",
    message_type: "text",
    body: params.text,
    sender_user_id: params.userId,
    status: "sent",
    sent_at: new Date().toISOString(),
    metadata: { human_initiated: true },
  }).select("id").single();
  if (error || !message) throw new Error("Meta accepted the message but persistence failed.");
  return { messageId: message.id, externalId };
}
