import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { decryptToken, encryptToken } from "@/server/services/integrations/encryption";
import { upsertChannelConnection } from "@/server/services/integrations/channel-connections";
import type { ChannelProvider } from "@/server/services/integrations/provider-adapter";

export type MetaMessagingProvider = Extract<ChannelProvider, "instagram" | "facebook">;

type MetaTokenResponse = { access_token?: string; token_type?: string; expires_in?: number; error?: { message?: string } };
type PageAccount = { id: string; name?: string; access_token?: string; instagram_business_account?: { id?: string; username?: string; name?: string } };

const GRAPH_VERSION = process.env.META_GRAPH_VERSION?.trim() || "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

function metaCredentials() {
  const clientId = process.env.META_CLIENT_ID?.trim() || process.env.META_APP_ID?.trim();
  const clientSecret = process.env.META_CLIENT_SECRET?.trim() || process.env.META_APP_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error("Meta OAuth credentials are not configured.");
  return { clientId, clientSecret };
}

async function graphJson<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${GRAPH_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers || {}) },
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!response.ok || data.error) throw new Error(`Meta Graph request failed (${response.status}).`);
  return data;
}

export async function exchangeMetaCode(params: { code: string; redirectUri: string }) {
  const { clientId, clientSecret } = metaCredentials();
  const url = new URL(`${GRAPH_BASE}/oauth/access_token`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("client_secret", clientSecret);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("code", params.code);
  const response = await fetch(url, { cache: "no-store" });
  const first = (await response.json().catch(() => ({}))) as MetaTokenResponse;
  if (!response.ok || !first.access_token) throw new Error("Meta authorization code exchange failed.");

  // Exchange short-lived user token for a long-lived token when Meta supports it.
  const longUrl = new URL(`${GRAPH_BASE}/oauth/access_token`);
  longUrl.searchParams.set("grant_type", "fb_exchange_token");
  longUrl.searchParams.set("client_id", clientId);
  longUrl.searchParams.set("client_secret", clientSecret);
  longUrl.searchParams.set("fb_exchange_token", first.access_token);
  const longRes = await fetch(longUrl, { cache: "no-store" });
  const long = (await longRes.json().catch(() => ({}))) as MetaTokenResponse;
  return {
    accessToken: longRes.ok && long.access_token ? long.access_token : first.access_token,
    expiresIn: longRes.ok && typeof long.expires_in === "number" ? long.expires_in : first.expires_in,
  };
}

async function getPages(userToken: string): Promise<PageAccount[]> {
  const result = await graphJson<{ data?: PageAccount[] }>(
    "/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,name}&limit=100",
    userToken,
  );
  return Array.isArray(result.data) ? result.data.filter((item) => typeof item.id === "string") : [];
}

export async function discoverMetaMessagingAccounts(provider: MetaMessagingProvider, userToken: string) {
  const pages = await getPages(userToken);
  if (provider === "facebook") {
    return pages.map((page) => ({ externalId: page.id, displayName: page.name || "Facebook Page", username: null }));
  }
  return pages
    .filter((page) => page.instagram_business_account?.id)
    .map((page) => ({
      externalId: page.instagram_business_account!.id!,
      displayName: page.instagram_business_account?.name || page.instagram_business_account?.username || page.name || "Instagram Professional Account",
      username: page.instagram_business_account?.username || null,
      pageId: page.id,
    }));
}

export async function stageMetaMessagingConnection(params: {
  organizationId: string;
  userId: string;
  provider: MetaMessagingProvider;
  userToken: string;
  expiresIn?: number;
}) {
  const accounts = await discoverMetaMessagingAccounts(params.provider, params.userToken);
  if (accounts.length === 0) throw new Error(`No eligible ${params.provider} messaging account was found.`);

  const connection = await upsertChannelConnection({
    organizationId: params.organizationId,
    provider: params.provider,
    status: "connecting",
    displayName: accounts.length === 1 ? accounts[0].displayName : `${accounts.length} accounts available`,
    externalAccountId: null,
    scopes: params.provider === "facebook" ? ["pages_manage_metadata", "pages_messaging"] : ["instagram_basic", "instagram_manage_messages", "pages_show_list"],
    createdByUserId: params.userId,
  });
  if ("error" in connection) throw new Error(connection.error);

  const admin = createSupabaseAdminClient();
  const expiresAt = params.expiresIn ? new Date(Date.now() + params.expiresIn * 1000).toISOString() : null;
  const { error: tokenError } = await admin.from("integration_tokens").upsert({
    organization_id: params.organizationId,
    connection_id: connection.id,
    provider: params.provider,
    access_token_cipher: encryptToken(params.userToken),
    token_type: "Bearer",
    expires_at: expiresAt,
    scopes: params.provider === "facebook" ? ["pages_manage_metadata", "pages_messaging"] : ["instagram_basic", "instagram_manage_messages", "pages_show_list"],
    updated_at: new Date().toISOString(),
  }, { onConflict: "connection_id" });
  if (tokenError) throw new Error("Failed to store encrypted Meta OAuth token.");

  // Store display-safe candidates only. Never persist page access tokens in channel_accounts metadata.
  await admin.from("channel_accounts").delete().eq("organization_id", params.organizationId).eq("provider", params.provider).eq("connection_id", connection.id);
  const { error: accountError } = await admin.from("channel_accounts").insert(accounts.map((account) => ({
    organization_id: params.organizationId,
    connection_id: connection.id,
    provider: params.provider,
    external_id: account.externalId,
    external_username: account.username,
    display_name: account.displayName,
    metadata: "pageId" in account && account.pageId ? { page_id: account.pageId, selection_status: "candidate" } : { selection_status: "candidate" },
  })));
  if (accountError) throw new Error("Failed to persist Meta account candidates.");

  return { connectionId: connection.id, candidates: accounts };
}

export async function selectMetaMessagingAccount(params: {
  organizationId: string;
  userId: string;
  provider: MetaMessagingProvider;
  externalAccountId: string;
}) {
  const admin = createSupabaseAdminClient();
  const { data: connection } = await admin.from("channel_connections")
    .select("id,status").eq("organization_id", params.organizationId).eq("provider", params.provider).maybeSingle();
  if (!connection) throw new Error("Meta connection not found.");

  const { data: tokenRow } = await admin.from("integration_tokens")
    .select("access_token_cipher").eq("organization_id", params.organizationId).eq("connection_id", connection.id).maybeSingle();
  if (!tokenRow?.access_token_cipher) throw new Error("Encrypted Meta OAuth token not found.");
  const userToken = decryptToken(tokenRow.access_token_cipher);
  const pages = await getPages(userToken);

  let accountToken: string | undefined;
  let displayName = "Meta Messaging";
  let pageId: string | null = null;
  if (params.provider === "facebook") {
    const page = pages.find((item) => item.id === params.externalAccountId);
    if (!page?.access_token) throw new Error("Selected Facebook Page is no longer available.");
    accountToken = page.access_token; displayName = page.name || "Facebook Page"; pageId = page.id;
  } else {
    const page = pages.find((item) => item.instagram_business_account?.id === params.externalAccountId);
    if (!page?.access_token || !page.instagram_business_account?.id) throw new Error("Selected Instagram account is no longer available.");
    accountToken = page.access_token;
    displayName = page.instagram_business_account.name || page.instagram_business_account.username || page.name || "Instagram Professional Account";
    pageId = page.id;
  }

  const subscribeTarget = params.provider === "facebook" ? params.externalAccountId : params.externalAccountId;
  const subscribedFields = params.provider === "facebook"
    ? "messages,messaging_postbacks,message_deliveries,message_reads"
    : "messages,messaging_postbacks";
  await graphJson(`/${subscribeTarget}/subscribed_apps?subscribed_fields=${encodeURIComponent(subscribedFields)}`, accountToken, { method: "POST", body: "{}" });

  const { error: tokenError } = await admin.from("integration_tokens").update({
    access_token_cipher: encryptToken(accountToken), updated_at: new Date().toISOString(),
  }).eq("organization_id", params.organizationId).eq("connection_id", connection.id);
  if (tokenError) throw new Error("Failed to secure selected account token.");

  const { error: connectionError } = await admin.from("channel_connections").update({
    status: "connected", display_name: displayName, external_account_id: params.externalAccountId,
    error_message: null, last_connected_at: new Date().toISOString(), last_synced_at: new Date().toISOString(), updated_by: params.userId, updated_at: new Date().toISOString(),
  }).eq("id", connection.id).eq("organization_id", params.organizationId);
  if (connectionError) throw new Error("Failed to activate Meta messaging connection.");

  await admin.from("channel_accounts").update({ metadata: { page_id: pageId, selection_status: "selected" }, updated_at: new Date().toISOString() })
    .eq("organization_id", params.organizationId).eq("connection_id", connection.id).eq("provider", params.provider).eq("external_id", params.externalAccountId);
  return { connectionId: connection.id, externalAccountId: params.externalAccountId, displayName };
}
