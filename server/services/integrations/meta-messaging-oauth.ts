import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { decryptToken, encryptToken } from "@/server/services/integrations/encryption";
import { upsertChannelConnection } from "@/server/services/integrations/channel-connections";
import type { ChannelProvider } from "@/server/services/integrations/provider-adapter";

export type MetaMessagingProvider = Extract<ChannelProvider, "instagram" | "facebook">;

type MetaTokenResponse = { access_token?: string; token_type?: string; expires_in?: number; error?: { message?: string } };
type PageAccount = { id: string; name?: string; access_token?: string; instagram_business_account?: { id?: string; username?: string; name?: string } };
type InstagramAccount = { id?: string; user_id?: string; username?: string; name?: string; account_type?: string; error?: { message?: string } };

const GRAPH_VERSION = process.env.META_GRAPH_VERSION?.trim() || "v26.0";
const FACEBOOK_GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const INSTAGRAM_GRAPH_BASE = "https://graph.instagram.com";

function metaCredentials(provider: MetaMessagingProvider) {
  const clientId = provider === "instagram"
    ? process.env.INSTAGRAM_APP_ID?.trim() || process.env.META_INSTAGRAM_APP_ID?.trim() || process.env.META_CLIENT_ID?.trim() || process.env.META_APP_ID?.trim()
    : process.env.META_CLIENT_ID?.trim() || process.env.META_APP_ID?.trim();
  const clientSecret = provider === "instagram"
    ? process.env.INSTAGRAM_APP_SECRET?.trim() || process.env.META_INSTAGRAM_APP_SECRET?.trim() || process.env.META_CLIENT_SECRET?.trim() || process.env.META_APP_SECRET?.trim()
    : process.env.META_CLIENT_SECRET?.trim() || process.env.META_APP_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error("Meta OAuth credentials are not configured.");
  return { clientId, clientSecret };
}

async function facebookGraphJson<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${FACEBOOK_GRAPH_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers || {}) },
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!response.ok || data.error) throw new Error(`Meta Graph request failed (${response.status}).`);
  return data;
}

async function instagramGraphJson<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const url = new URL(`${INSTAGRAM_GRAPH_BASE}${path}`);
  url.searchParams.set("access_token", token);
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!response.ok || data.error) throw new Error(`Instagram Graph request failed (${response.status}).`);
  return data;
}

export async function exchangeMetaCode(params: { provider: MetaMessagingProvider; code: string; redirectUri: string }) {
  const { clientId, clientSecret } = metaCredentials(params.provider);

  if (params.provider === "instagram") {
    const body = new URLSearchParams();
    body.set("client_id", clientId);
    body.set("client_secret", clientSecret);
    body.set("grant_type", "authorization_code");
    body.set("redirect_uri", params.redirectUri);
    body.set("code", params.code);

    const response = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
    const first = (await response.json().catch(() => ({}))) as MetaTokenResponse;
    if (!response.ok || !first.access_token) throw new Error("Instagram authorization code exchange failed.");

    const longUrl = new URL(`${INSTAGRAM_GRAPH_BASE}/access_token`);
    longUrl.searchParams.set("grant_type", "ig_exchange_token");
    longUrl.searchParams.set("client_secret", clientSecret);
    longUrl.searchParams.set("access_token", first.access_token);
    const longRes = await fetch(longUrl, { cache: "no-store" });
    const long = (await longRes.json().catch(() => ({}))) as MetaTokenResponse;
    return {
      accessToken: longRes.ok && long.access_token ? long.access_token : first.access_token,
      expiresIn: longRes.ok && typeof long.expires_in === "number" ? long.expires_in : first.expires_in,
    };
  }

  const url = new URL(`${FACEBOOK_GRAPH_BASE}/oauth/access_token`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("client_secret", clientSecret);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("code", params.code);
  const response = await fetch(url, { cache: "no-store" });
  const first = (await response.json().catch(() => ({}))) as MetaTokenResponse;
  if (!response.ok || !first.access_token) throw new Error("Meta authorization code exchange failed.");

  const longUrl = new URL(`${FACEBOOK_GRAPH_BASE}/oauth/access_token`);
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
  const result = await facebookGraphJson<{ data?: PageAccount[] }>(
    "/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,name}&limit=100",
    userToken,
  );
  return Array.isArray(result.data) ? result.data.filter((item) => typeof item.id === "string") : [];
}

async function getInstagramAccount(userToken: string) {
  const account = await instagramGraphJson<InstagramAccount>("/me?fields=id,user_id,username,name,account_type", userToken);
  const externalId = account.id || account.user_id;
  if (!externalId) throw new Error("No eligible Instagram professional account was found.");
  return {
    externalId,
    displayName: account.name || account.username || "Instagram Professional Account",
    username: account.username || null,
  };
}

export async function discoverMetaMessagingAccounts(provider: MetaMessagingProvider, userToken: string) {
  if (provider === "instagram") return [await getInstagramAccount(userToken)];
  const pages = await getPages(userToken);
  return pages.map((page) => ({ externalId: page.id, displayName: page.name || "Facebook Page", username: null }));
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

  const scopes = params.provider === "facebook"
    ? ["pages_manage_metadata", "pages_messaging"]
    : ["instagram_business_basic", "instagram_business_manage_messages", "instagram_business_manage_comments"];

  const connection = await upsertChannelConnection({
    organizationId: params.organizationId,
    provider: params.provider,
    status: "connecting",
    displayName: accounts.length === 1 ? accounts[0].displayName : `${accounts.length} accounts available`,
    externalAccountId: null,
    scopes,
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
    scopes,
    updated_at: new Date().toISOString(),
  }, { onConflict: "connection_id" });
  if (tokenError) throw new Error("Failed to store encrypted Meta OAuth token.");

  await admin.from("channel_accounts").delete().eq("organization_id", params.organizationId).eq("provider", params.provider).eq("connection_id", connection.id);
  const { error: accountError } = await admin.from("channel_accounts").insert(accounts.map((account) => ({
    organization_id: params.organizationId,
    connection_id: connection.id,
    provider: params.provider,
    external_id: account.externalId,
    external_username: account.username,
    display_name: account.displayName,
    metadata: { selection_status: "candidate" },
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

  let accountToken: string;
  let displayName = "Meta Messaging";
  let pageId: string | null = null;

  if (params.provider === "facebook") {
    const pages = await getPages(userToken);
    const page = pages.find((item) => item.id === params.externalAccountId);
    if (!page?.access_token) throw new Error("Selected Facebook Page is no longer available.");
    accountToken = page.access_token;
    displayName = page.name || "Facebook Page";
    pageId = page.id;
  } else {
    const account = await getInstagramAccount(userToken);
    if (account.externalId !== params.externalAccountId) throw new Error("Selected Instagram account is no longer available.");
    accountToken = userToken;
    displayName = account.displayName;
  }

  if (params.provider === "facebook") {
    await facebookGraphJson(`/${params.externalAccountId}/subscribed_apps?subscribed_fields=${encodeURIComponent("messages,messaging_postbacks,message_deliveries,message_reads")}`, accountToken, { method: "POST", body: "{}" });
  } else {
    await instagramGraphJson(`/${params.externalAccountId}/subscribed_apps?subscribed_fields=${encodeURIComponent("messages,messaging_postbacks,messaging_seen,message_reactions,message_edit,messaging_referral")}`, accountToken, { method: "POST", body: "{}" });
  }

  const { error: tokenError } = await admin.from("integration_tokens").update({
    access_token_cipher: encryptToken(accountToken), updated_at: new Date().toISOString(),
  }).eq("organization_id", params.organizationId).eq("connection_id", connection.id);
  if (tokenError) throw new Error("Failed to secure selected account token.");

  const { error: connectionError } = await admin.from("channel_connections").update({
    status: "connected", display_name: displayName, external_account_id: params.externalAccountId,
    error_message: null, last_connected_at: new Date().toISOString(), last_synced_at: new Date().toISOString(), updated_by: params.userId, updated_at: new Date().toISOString(),
  }).eq("id", connection.id).eq("organization_id", params.organizationId);
  if (connectionError) throw new Error("Failed to activate Meta messaging connection.");

  await admin.from("channel_accounts").update({ metadata: pageId ? { page_id: pageId, selection_status: "selected" } : { selection_status: "selected" }, updated_at: new Date().toISOString() })
    .eq("organization_id", params.organizationId).eq("connection_id", connection.id).eq("provider", params.provider).eq("external_id", params.externalAccountId);
  return { connectionId: connection.id, externalAccountId: params.externalAccountId, displayName };
}
