import "server-only";

import crypto from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { decryptToken, encryptToken, isTokenEncryptionConfigured } from "@/server/services/integrations/encryption";

export type EmailProvider = "gmail" | "microsoft";

type Connection = {
  id: string; organization_id: string; provider: EmailProvider; email_address: string; display_name: string | null;
  access_token_cipher: string; refresh_token_cipher: string | null; expires_at: string | null;
};

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
}

function providerConfig(provider: EmailProvider) {
  if (provider === "gmail") return {
    clientId: process.env.GOOGLE_EMAIL_CLIENT_ID?.trim(), clientSecret: process.env.GOOGLE_EMAIL_CLIENT_SECRET?.trim(),
    redirectUri: `${siteUrl()}/api/integrations/email/gmail/callback`,
  };
  return {
    clientId: process.env.MICROSOFT_EMAIL_CLIENT_ID?.trim(), clientSecret: process.env.MICROSOFT_EMAIL_CLIENT_SECRET?.trim(),
    redirectUri: `${siteUrl()}/api/integrations/email/microsoft/callback`,
  };
}

export function isEmailProviderConfigured(provider: EmailProvider) {
  const config = providerConfig(provider);
  return Boolean(config.clientId && config.clientSecret && siteUrl() && isTokenEncryptionConfigured());
}

export async function createEmailAuthorizationUrl(params: { provider: EmailProvider; organizationId: string; userId: string }) {
  const config = providerConfig(params.provider);
  if (!config.clientId || !config.clientSecret || !siteUrl()) throw new Error("E-posta sağlayıcı anahtarları henüz yapılandırılmadı.");
  if (!isTokenEncryptionConfigured()) throw new Error("TOKEN_ENCRYPTION_KEY yapılandırılmadı.");
  const rawState = crypto.randomBytes(32).toString("hex");
  const stateHash = crypto.createHash("sha256").update(rawState).digest("hex");
  const db = createSupabaseAdminClient();
  const { error } = await db.from("email_oauth_states").insert({
    organization_id: params.organizationId, user_id: params.userId, provider: params.provider, state_hash: stateHash,
  });
  if (error) throw new Error(`E-posta bağlantısı başlatılamadı: ${error.message}`);
  if (params.provider === "gmail") {
    const query = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code", access_type: "offline", prompt: "consent", state: rawState, scope: "openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send" });
    return `https://accounts.google.com/o/oauth2/v2/auth?${query}`;
  }
  const query = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code", response_mode: "query", state: rawState, scope: "openid profile email offline_access User.Read Mail.Read Mail.Send" });
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${query}`;
}

async function consumeState(provider: EmailProvider, rawState: string, organizationId: string, userId: string) {
  const hash = crypto.createHash("sha256").update(rawState).digest("hex");
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("email_oauth_states").select("id,expires_at,consumed_at").eq("state_hash", hash).eq("provider", provider).eq("organization_id", organizationId).eq("user_id", userId).maybeSingle();
  if (error || !data || data.consumed_at || new Date(data.expires_at).getTime() < Date.now()) throw new Error("Bağlantı doğrulaması geçersiz veya süresi dolmuş.");
  await db.from("email_oauth_states").update({ consumed_at: new Date().toISOString() }).eq("id", data.id).is("consumed_at", null);
}

async function checkedJson(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload?.error_description === "string" ? payload.error_description : typeof payload?.error?.message === "string" ? payload.error.message : "E-posta sağlayıcısı isteği reddetti.");
  return payload;
}

export async function completeEmailOAuth(params: { provider: EmailProvider; code: string; state: string; organizationId: string; userId: string }) {
  await consumeState(params.provider, params.state, params.organizationId, params.userId);
  const config = providerConfig(params.provider);
  if (!config.clientId || !config.clientSecret) throw new Error("E-posta sağlayıcı anahtarları yapılandırılmadı.");
  const tokenUrl = params.provider === "gmail" ? "https://oauth2.googleapis.com/token" : "https://login.microsoftonline.com/common/oauth2/v2.0/token";
  const body = new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, code: params.code, redirect_uri: config.redirectUri, grant_type: "authorization_code" });
  const token = await checkedJson(await fetch(tokenUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, cache: "no-store" }));
  const accessToken = String(token.access_token || "");
  if (!accessToken) throw new Error("E-posta erişim anahtarı alınamadı.");
  const profileUrl = params.provider === "gmail" ? "https://www.googleapis.com/oauth2/v2/userinfo" : "https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName";
  const profile = await checkedJson(await fetch(profileUrl, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" }));
  const emailAddress = String(params.provider === "gmail" ? profile.email : profile.mail || profile.userPrincipalName).toLowerCase();
  const displayName = String(profile.name || profile.displayName || emailAddress);
  const expiresAt = new Date(Date.now() + Number(token.expires_in || 3600) * 1000).toISOString();
  const db = createSupabaseAdminClient();
  const { error } = await db.from("email_connections").upsert({
    organization_id: params.organizationId, provider: params.provider, status: "connected", email_address: emailAddress,
    display_name: displayName, scopes: String(token.scope || "").split(" ").filter(Boolean), access_token_cipher: encryptToken(accessToken),
    refresh_token_cipher: token.refresh_token ? encryptToken(String(token.refresh_token)) : null, expires_at: expiresAt,
    error_message: null, created_by: params.userId, updated_at: new Date().toISOString(),
  }, { onConflict: "organization_id,provider,email_address" });
  if (error) throw new Error(`E-posta hesabı kaydedilemedi: ${error.message}`);
}

async function getFreshAccessToken(connection: Connection) {
  if (!connection.expires_at || new Date(connection.expires_at).getTime() > Date.now() + 60_000) return decryptToken(connection.access_token_cipher);
  if (!connection.refresh_token_cipher) throw new Error("E-posta oturumunun süresi doldu; hesabı yeniden bağlayın.");
  const config = providerConfig(connection.provider);
  if (!config.clientId || !config.clientSecret) throw new Error("E-posta sağlayıcı anahtarları yapılandırılmadı.");
  const tokenUrl = connection.provider === "gmail" ? "https://oauth2.googleapis.com/token" : "https://login.microsoftonline.com/common/oauth2/v2.0/token";
  const body = new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: decryptToken(connection.refresh_token_cipher), grant_type: "refresh_token" });
  const token = await checkedJson(await fetch(tokenUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, cache: "no-store" }));
  const accessToken = String(token.access_token);
  await createSupabaseAdminClient().from("email_connections").update({ access_token_cipher: encryptToken(accessToken), expires_at: new Date(Date.now() + Number(token.expires_in || 3600) * 1000).toISOString(), status: "connected", error_message: null, updated_at: new Date().toISOString() }).eq("id", connection.id);
  return accessToken;
}

function decodeBase64Url(value?: string) { return value ? Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8") : ""; }
function stripHtml(value: string) { return value.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim(); }
function header(headers: Array<{ name: string; value: string }> | undefined, name: string) { return headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value || ""; }
function emailFromHeader(value: string) { const match = value.match(/<([^>]+)>/); return (match?.[1] || value).trim().toLowerCase(); }
function nameFromHeader(value: string) { return value.replace(/<[^>]+>/, "").replace(/^"|"$/g, "").trim() || null; }
type GmailPart = { mimeType?: string; body?: { data?: string }; parts?: GmailPart[] };
type EmailRecipient = { emailAddress?: { address?: string; name?: string } };

function gmailBody(part?: GmailPart): { text: string; html: string } {
  const current = decodeBase64Url(part?.body?.data);
  if (part?.mimeType === "text/plain") return { text: current, html: "" };
  if (part?.mimeType === "text/html") return { text: stripHtml(current), html: current };
  return (part?.parts || []).reduce((acc: { text: string; html: string }, child) => { const found = gmailBody(child); return { text: acc.text || found.text, html: acc.html || found.html }; }, { text: "", html: "" });
}

async function matchCrm(organizationId: string, email: string) {
  const db = createSupabaseAdminClient();
  const [{ data: leads }, { data: contacts }] = await Promise.all([
    db.from("leads").select("id,name").eq("organization_id", organizationId).ilike("email", email).limit(1),
    db.from("contacts").select("id,name").eq("organization_id", organizationId).ilike("email", email).limit(1),
  ]);
  return { leadId: leads?.[0]?.id || null, contactId: contacts?.[0]?.id || null, name: leads?.[0]?.name || contacts?.[0]?.name || null };
}

async function persistMessage(connection: Connection, message: { externalId: string; threadExternalId: string; from: string; fromName: string | null; to: string[]; cc?: string[]; subject: string; text: string; html?: string; sentAt: string; isRead: boolean }) {
  const participant = message.from === connection.email_address.toLowerCase() ? message.to[0] : message.from;
  if (!participant) return;
  const crm = await matchCrm(connection.organization_id, participant);
  const db = createSupabaseAdminClient();
  const { data: thread, error } = await db.from("email_threads").upsert({ organization_id: connection.organization_id, connection_id: connection.id, provider: connection.provider, external_thread_id: message.threadExternalId, subject: message.subject || "(Konu yok)", participant_email: participant, participant_name: crm.name || message.fromName, lead_id: crm.leadId, contact_id: crm.contactId, last_message_at: message.sentAt, updated_at: new Date().toISOString() }, { onConflict: "connection_id,external_thread_id" }).select("id").single();
  if (error || !thread) throw new Error(error?.message || "E-posta konusu kaydedilemedi.");
  await db.from("email_messages").upsert({ organization_id: connection.organization_id, thread_id: thread.id, connection_id: connection.id, external_message_id: message.externalId, direction: message.from === connection.email_address.toLowerCase() ? "outbound" : "inbound", from_email: message.from, to_emails: message.to, cc_emails: message.cc || [], subject: message.subject || "(Konu yok)", body_text: message.text, body_html: message.html || null, is_read: message.isRead, sent_at: message.sentAt }, { onConflict: "connection_id,external_message_id" });
}

export async function listEmailConnections(organizationId: string) {
  const { data } = await createSupabaseAdminClient().from("email_connections").select("id,provider,status,email_address,display_name,last_synced_at,error_message").eq("organization_id", organizationId).neq("status", "revoked").order("created_at");
  return data || [];
}

async function loadConnection(organizationId: string, connectionId: string) {
  const { data, error } = await createSupabaseAdminClient().from("email_connections").select("*").eq("id", connectionId).eq("organization_id", organizationId).single();
  if (error || !data) throw new Error("E-posta bağlantısı bulunamadı.");
  return data as Connection;
}

export async function syncEmailConnection(organizationId: string, connectionId: string) {
  const connection = await loadConnection(organizationId, connectionId);
  const token = await getFreshAccessToken(connection);
  let processed = 0;
  if (connection.provider === "gmail") {
    const list = await checkedJson(await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=40&q=newer_than:30d", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }));
    for (const item of list.messages || []) {
      const raw = await checkedJson(await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=full`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }));
      const headers = raw.payload?.headers; const fromRaw = header(headers, "From"); const body = gmailBody(raw.payload);
      await persistMessage(connection, { externalId: raw.id, threadExternalId: raw.threadId, from: emailFromHeader(fromRaw), fromName: nameFromHeader(fromRaw), to: header(headers, "To").split(",").map(emailFromHeader).filter(Boolean), cc: header(headers, "Cc").split(",").map(emailFromHeader).filter(Boolean), subject: header(headers, "Subject"), text: body.text || raw.snippet || "", html: body.html, sentAt: new Date(Number(raw.internalDate)).toISOString(), isRead: !(raw.labelIds || []).includes("UNREAD") });
      processed++;
    }
  } else {
    const list = await checkedJson(await fetch("https://graph.microsoft.com/v1.0/me/messages?$top=40&$orderby=receivedDateTime%20desc&$select=id,conversationId,subject,from,toRecipients,ccRecipients,body,bodyPreview,receivedDateTime,sentDateTime,isRead", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }));
    for (const raw of list.value || []) {
      const from = String(raw.from?.emailAddress?.address || "").toLowerCase();
      await persistMessage(connection, { externalId: raw.id, threadExternalId: raw.conversationId || raw.id, from, fromName: raw.from?.emailAddress?.name || null, to: (raw.toRecipients || []).map((x: EmailRecipient) => String(x.emailAddress?.address || "").toLowerCase()).filter(Boolean), cc: (raw.ccRecipients || []).map((x: EmailRecipient) => String(x.emailAddress?.address || "").toLowerCase()).filter(Boolean), subject: raw.subject || "(Konu yok)", text: raw.body?.contentType === "html" ? stripHtml(raw.body.content || "") : raw.body?.content || raw.bodyPreview || "", html: raw.body?.contentType === "html" ? raw.body.content : "", sentAt: raw.sentDateTime || raw.receivedDateTime, isRead: Boolean(raw.isRead) });
      processed++;
    }
  }
  await createSupabaseAdminClient().from("email_connections").update({ last_synced_at: new Date().toISOString(), status: "connected", error_message: null }).eq("id", connection.id);
  return processed;
}

export async function sendEmail(params: { organizationId: string; connectionId: string; to: string; subject: string; body: string }) {
  const connection = await loadConnection(params.organizationId, params.connectionId);
  const token = await getFreshAccessToken(connection);
  const to = params.to.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(to)) throw new Error("Geçerli bir alıcı e-posta adresi girin.");
  if (!params.subject.trim() || !params.body.trim()) throw new Error("Konu ve mesaj zorunludur.");
  let externalId = crypto.randomUUID(); let threadExternalId = externalId;
  if (connection.provider === "gmail") {
    const mime = [`From: ${connection.display_name || "FlowSales"} <${connection.email_address}>`, `To: ${to}`, `Subject: =?UTF-8?B?${Buffer.from(params.subject).toString("base64")}?=`, "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "", params.body].join("\r\n");
    const sent = await checkedJson(await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ raw: Buffer.from(mime).toString("base64url") }) }));
    externalId = sent.id; threadExternalId = sent.threadId || sent.id;
  } else {
    await checkedJson(await fetch("https://graph.microsoft.com/v1.0/me/sendMail", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ message: { subject: params.subject, body: { contentType: "Text", content: params.body }, toRecipients: [{ emailAddress: { address: to } }] }, saveToSentItems: true }) }).then(async (response) => response.status === 202 ? new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }) : response));
  }
  await persistMessage(connection, { externalId, threadExternalId, from: connection.email_address.toLowerCase(), fromName: connection.display_name, to: [to], subject: params.subject, text: params.body, sentAt: new Date().toISOString(), isRead: true });
}

export async function listEmailThreads(organizationId: string) {
  const db = createSupabaseAdminClient();
  const { data: threads } = await db.from("email_threads").select("id,subject,participant_email,participant_name,lead_id,contact_id,last_message_at,unread_count,email_connections(email_address,provider)").eq("organization_id", organizationId).order("last_message_at", { ascending: false }).limit(100);
  const ids = (threads || []).map((item) => item.id);
  const { data: messages } = ids.length ? await db.from("email_messages").select("id,thread_id,direction,from_email,to_emails,subject,body_text,sent_at,is_read").in("thread_id", ids).order("sent_at") : { data: [] };
  return { threads: threads || [], messages: messages || [] };
}

export async function disconnectEmailConnection(organizationId: string, connectionId: string) {
  await createSupabaseAdminClient().from("email_connections").update({ status: "revoked", access_token_cipher: encryptToken(crypto.randomBytes(32).toString("hex")), refresh_token_cipher: null, updated_at: new Date().toISOString() }).eq("organization_id", organizationId).eq("id", connectionId);
}
