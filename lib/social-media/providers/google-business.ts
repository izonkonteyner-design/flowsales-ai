import { SocialMediaError, type SocialMediaProvider } from "./base";

const PLATFORM = "google_business" as const;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw SocialMediaError.notConfigured(PLATFORM, `Set ${name} in .env.local.`);
  return value;
}

const OAUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GBPAPI_BASE = "https://mybusinessbusinessinformation.googleapis.com/v1";
const LPAPI_BASE = "https://mybusinesspublish.googleapis.com/v1";

const DEFAULT_SCOPES = ["https://www.googleapis.com/auth/business.manage"];

function googleErrorMessage(json: Record<string, unknown>, fallback: string): string {
  const error = json.error;
  if (error && typeof error === "object" && "errors" in error) {
    const errors = (error as { errors: unknown[] }).errors;
    if (Array.isArray(errors) && errors.length > 0) {
      const first = errors[0] as Record<string, unknown> | undefined;
      if (first && "message" in first) return String(first.message);
    }
  }
  if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
  return String(json.error_message ?? json.error ?? fallback);
}

function validateMediaUrl(url: string): void {
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw SocialMediaError.validation(`Invalid media URL: ${url}`); }
  if (parsed.protocol !== "https:") throw SocialMediaError.validation(`Media URL must use HTTPS: ${url}`);
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname.startsWith("10.") || hostname.startsWith("172.16.") || hostname.startsWith("192.168.")) throw SocialMediaError.validation(`Media URL points to a private host: ${url}`);
}

export const googleBusinessProvider: SocialMediaProvider = {
  platform: PLATFORM,
  label: "Google Business Profile",
  capabilities: { publishing: true, analytics: false, story: false, reel: false, scheduling: false },
  authorizeUrl(state, redirectUri, scopes = DEFAULT_SCOPES) {
    const params = new URLSearchParams({ client_id: requireEnv("GBP_CLIENT_ID"), redirect_uri: redirectUri, scope: scopes.join(" "), response_type: "code", access_type: "offline", prompt: "consent", state });
    return `${OAUTH_BASE}?${params.toString()}`;
  },
  async exchangeCode(code, redirectUri) {
    if (!code) throw SocialMediaError.validation("Authorization code is required.");
    const body = new URLSearchParams({ client_id: requireEnv("GBP_CLIENT_ID"), client_secret: requireEnv("GBP_CLIENT_SECRET"), code, grant_type: "authorization_code", redirect_uri: redirectUri });
    let response: Response;
    try { response = await fetch(TOKEN_URL, { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(15000) }); } catch (cause) { throw SocialMediaError.transient("Google Business Profile token exchange failed.", cause); }
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) throw SocialMediaError.permanent(`Google Business Profile error: ${googleErrorMessage(json, "token exchange failed")}`);
    const accessToken = String(json.access_token ?? "");
    if (!accessToken) throw SocialMediaError.permanent("Google Business Profile did not return an access token.");
    const refreshToken = json.refresh_token ? String(json.refresh_token) : undefined;
    const expiresIn = json.expires_in ? Number(json.expires_in) : undefined;
    const scopes = Array.isArray(json.scope) ? json.scope : DEFAULT_SCOPES;
    return { access_token: accessToken, refresh_token: refreshToken, expires_in: expiresIn, platform_account_id: "", username: undefined, scopes };
  },

  async refreshToken(refreshToken) {
    if (!refreshToken) throw SocialMediaError.validation("Refresh token is required.");
    const body = new URLSearchParams({ client_id: requireEnv("GBP_CLIENT_ID"), client_secret: requireEnv("GBP_CLIENT_SECRET"), grant_type: "refresh_token", refresh_token: refreshToken });
    let response: Response;
    try { response = await fetch(TOKEN_URL, { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(15000) }); } catch (cause) { throw SocialMediaError.transient("Google Business Profile token refresh failed.", cause); }
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) throw SocialMediaError.permanent(`Google Business Profile error: ${googleErrorMessage(json, "token refresh failed")}`);
    return { access_token: String(json.access_token ?? ""), refresh_token: json.refresh_token ? String(json.refresh_token) : refreshToken, expires_in: json.expires_in ? Number(json.expires_in) : undefined };
  },
  async publish(accessToken, post: { content: string; media_urls: string[]; scheduled_at?: string | null }) {
    if (!accessToken) throw SocialMediaError.validation("Access token is required.");
    if (!post.content.trim() && post.media_urls.length === 0) throw SocialMediaError.validation("A post must contain text or media.");
    if (post.scheduled_at) throw SocialMediaError.validation("Google Business Profile does not support scheduled publishing via API. Use FlowSales cron queue instead.");
    for (const url of post.media_urls) validateMediaUrl(url);
    const { locationName } = await resolveLocation(accessToken);
    const localPost: Record<string, unknown> = { topicType: "GENERAL", localizedLocalized: { localizedTitle: post.content.trim().slice(0, 200) || "İZON Konteyner güncellemesi", localizedBody: post.content.trim() }, languageCode: "tr-TR", media: post.media_urls.length > 0 ? [{ sourceUrl: post.media_urls[0] }] : undefined };
    const body = JSON.stringify(localPost);
    let createResponse: Response;
    try { createResponse = await fetch(`${LPAPI_BASE}/${locationName}/localPosts`, { method: "POST", body, headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(30000) }); } catch (cause) { throw SocialMediaError.transient("Google Business Profile post creation failed.", cause); }
    const createJson = (await createResponse.json().catch(() => ({}))) as Record<string, unknown>;
    if (!createResponse.ok) throw SocialMediaError.transient(`Google Business Profile error: ${googleErrorMessage(createJson, "Local post creation failed")}`, createJson);
    const postName = String(createJson.name ?? "");
    if (!postName) throw SocialMediaError.transient("Google Business Profile did not return a post id.");
    return { platform_post_id: postName, platform_post_url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(postName)}` };
  },
  async getAccount(accessToken) {
    let response: Response;
    try { response = await fetch(`${GBPAPI_BASE}/accounts`, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15000) }); } catch (cause) { throw SocialMediaError.transient("Google Business Profile account lookup failed.", cause); }
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) { const errMsg = json.error && typeof json.error === "object" && "message" in json.error ? String((json.error as { message: unknown }).message) : String(json.error_message ?? json.error ?? response.statusText); throw SocialMediaError.permanent(`Google Business Profile account lookup failed: ${errMsg}`); }
    const accounts = json.accounts as unknown[] | undefined;
    const account = accounts?.[0] as Record<string, unknown> | undefined;
    return { platform_account_id: String(account?.name ?? ""), username: account?.accountName ? String(account.accountName) : null, profile_picture_url: null };
  },
};

async function resolveLocation(accessToken: string): Promise<{ locationName: string }> {
  let accountsResponse: Response;
  try { accountsResponse = await fetch(`${GBPAPI_BASE}/accounts`, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15000) }); } catch (cause) { throw SocialMediaError.transient("Google Business Profile account lookup failed.", cause); }
  if (!accountsResponse.ok) { const json = (await accountsResponse.json().catch(() => ({}))) as Record<string, unknown>; throw SocialMediaError.permanent(`Google Business Profile error: ${googleErrorMessage(json, "Account lookup failed")}`); }
  const accountsJson = (await accountsResponse.json()) as Record<string, unknown>;
  const accounts = accountsJson.accounts as unknown[] | undefined;
  if (!accounts || accounts.length === 0) throw SocialMediaError.permanent("No Google Business Profile accounts found.");
  const accountName = String((accounts[0] as Record<string, unknown>).name ?? "");
  let locationsResponse: Response;
  try { locationsResponse = await fetch(`${GBPAPI_BASE}/${accountName}/locations`, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15000) }); } catch (cause) { throw SocialMediaError.transient("Google Business Profile location lookup failed.", cause); }
  if (!locationsResponse.ok) { const json = (await locationsResponse.json().catch(() => ({}))) as Record<string, unknown>; throw SocialMediaError.permanent(`Google Business Profile error: ${googleErrorMessage(json, "Location lookup failed")}`); }
  const locationsJson = (await locationsResponse.json()) as Record<string, unknown>;
  const locations = locationsJson.locations as unknown[] | undefined;
  if (!locations || locations.length === 0) throw SocialMediaError.permanent("No business locations found.");
  const locationName = String((locations[0] as Record<string, unknown>).name ?? "");
  return { locationName };
}
