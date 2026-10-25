import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { createRequire } from "node:module";

const req = createRequire(import.meta.url);
const serverOnlyPath = req.resolve("server-only");
req.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as NodeModule;

const { getProviderAdapter, isProviderConfigured } = req("../server/services/integrations/provider-adapter") as typeof import("@/server/services/integrations/provider-adapter");

const WORKTREE = process.cwd();

describe("YouTube Provider & Integration Diagnostics Test Suite", () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = savedEnv;
  });

  it("getProviderAdapter returns a valid YouTubeAdapter", () => {
    const adapter = getProviderAdapter("youtube");
    assert.equal(adapter.provider, "youtube");
    assert.equal(typeof adapter.buildAuthorizationUrl, "function");
    assert.equal(typeof adapter.exchangeCode, "function");
    assert.equal(typeof adapter.refreshAccessToken, "function");
    assert.equal(typeof adapter.revokeConnection, "function");
    assert.equal(typeof adapter.normalizeAccount, "function");
  });

  it("buildAuthorizationUrl generates valid YouTube OAuth URL with PKCE", () => {
    process.env.YOUTUBE_CLIENT_ID = "mock-youtube-client-id";
    process.env.YOUTUBE_CLIENT_SECRET = "mock-youtube-client-secret";
    process.env.NEXT_PUBLIC_SITE_URL = "https://app.flowsales.ai";

    const adapter = getProviderAdapter("youtube");
    const result = adapter.buildAuthorizationUrl({
      organizationId: "org-123",
      userId: "user-456",
      returnPath: "/settings/integrations",
      codeVerifier: "mock-code-verifier-string-12345",
      stateToken: "state-token-abc",
    });

    assert.ok(result.url.startsWith("https://accounts.google.com/o/oauth2/v2/auth"));
    const parsed = new URL(result.url);
    assert.equal(parsed.searchParams.get("client_id"), "mock-youtube-client-id");
    assert.equal(parsed.searchParams.get("redirect_uri"), "https://app.flowsales.ai/api/integrations/youtube/callback");
    assert.equal(parsed.searchParams.get("response_type"), "code");
    assert.ok(parsed.searchParams.get("scope")?.includes("youtube.upload"));
    assert.equal(parsed.searchParams.get("code_challenge_method"), "S256");
    assert.ok(parsed.searchParams.get("code_challenge"));
  });

  it("returns isProviderConfigured('youtube') === false when YOUTUBE credentials are unset", () => {
    delete process.env.YOUTUBE_CLIENT_ID;
    delete process.env.YOUTUBE_CLIENT_SECRET;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_ADS_CLIENT_ID;
    delete process.env.GOOGLE_ADS_CLIENT_SECRET;

    assert.equal(isProviderConfigured("youtube"), false);

    process.env.YOUTUBE_CLIENT_ID = "mock-youtube-client-id";
    process.env.YOUTUBE_CLIENT_SECRET = "mock-youtube-client-secret";
    process.env.NEXT_PUBLIC_SITE_URL = "https://app.flowsales.ai";

    assert.equal(isProviderConfigured("youtube"), true);
  });

  it("TikTokAdapter generates valid Content Posting API authorization URL with PKCE", () => {
    process.env.TIKTOK_CLIENT_KEY = "mock-tiktok-client-key";
    process.env.TIKTOK_CLIENT_SECRET = "mock-tiktok-client-secret";
    process.env.NEXT_PUBLIC_SITE_URL = "https://app.flowsales.ai";

    assert.equal(isProviderConfigured("tiktok"), true);
    const adapter = getProviderAdapter("tiktok");
    const result = adapter.buildAuthorizationUrl({
      organizationId: "org-123",
      userId: "user-456",
      returnPath: "/settings/integrations",
      codeVerifier: "mock-code-verifier-string-12345",
      stateToken: "state-token-tiktok",
    });

    assert.ok(result.url.startsWith("https://www.tiktok.com/v2/auth/authorize/"));
    const parsed = new URL(result.url);
    assert.equal(parsed.searchParams.get("client_key"), "mock-tiktok-client-key");
    assert.equal(parsed.searchParams.get("redirect_uri"), "https://app.flowsales.ai/api/integrations/tiktok/callback");
    assert.equal(parsed.searchParams.get("response_type"), "code");
    assert.ok(parsed.searchParams.get("scope")?.includes("video.upload"));
    assert.equal(parsed.searchParams.get("code_challenge_method"), "S256");
    assert.ok(parsed.searchParams.get("code_challenge"));
  });

  it("normalizeAccount properly handles TikTok user and channel data", () => {
    const adapter = getProviderAdapter("tiktok");
    const account = adapter.normalizeAccount({
      user: {
        open_id: "tt-user-123",
        display_name: "İzon Konteyner TikTok",
        username: "izonkonteyner",
        avatar_url: "https://p16.tiktokcdn.com/avatar.jpg",
      },
    });

    assert.equal(account.externalId, "tt-user-123");
    assert.equal(account.displayName, "İzon Konteyner TikTok");
    assert.equal(account.username, "izonkonteyner");
    assert.equal(account.profilePictureUrl, "https://p16.tiktokcdn.com/avatar.jpg");
  });

  it("normalizeAccount properly handles YouTube channel snippet data", () => {
    const adapter = getProviderAdapter("youtube");
    const account = adapter.normalizeAccount({
      id: "UC_x5XG1OV2P6uZZ5FSM9Ttw",
      title: "FlowSales AI Official Channel",
    });

    assert.equal(account.externalId, "UC_x5XG1OV2P6uZZ5FSM9Ttw");
    assert.equal(account.displayName, "FlowSales AI Official Channel");
  });

  it("disconnect routes exist for youtube, google, and tiktok", () => {
    const ytDisconnect = path.join(WORKTREE, "app/api/integrations/youtube/disconnect/route.ts");
    const googleDisconnect = path.join(WORKTREE, "app/api/integrations/google/disconnect/route.ts");
    const tiktokDisconnect = path.join(WORKTREE, "app/api/integrations/tiktok/disconnect/route.ts");

    assert.ok(fs.existsSync(ytDisconnect), "YouTube disconnect route must exist");
    assert.ok(fs.existsSync(googleDisconnect), "Google disconnect route must exist");
    assert.ok(fs.existsSync(tiktokDisconnect), "TikTok disconnect route must exist");

    assert.ok(fs.readFileSync(ytDisconnect, "utf8").includes('import "server-only";'));
    assert.ok(fs.readFileSync(googleDisconnect, "utf8").includes('import "server-only";'));
    assert.ok(fs.readFileSync(tiktokDisconnect, "utf8").includes('import "server-only";'));
  });

  it("diagnostic test route exists and has server-only guard", () => {
    const testRoute = path.join(WORKTREE, "app/api/integrations/[provider]/test/route.ts");
    assert.ok(fs.existsSync(testRoute), "Diagnostic test route must exist");
    assert.ok(fs.readFileSync(testRoute, "utf8").includes('import "server-only";'));
  });

  it("migration 0062 updates check constraints for youtube on omnichannel tables", () => {
    const migration62 = path.join(WORKTREE, "supabase/migrations/0062_channel_connections_youtube.sql");
    assert.ok(fs.existsSync(migration62), "Migration 0062 must exist");
    const sql = fs.readFileSync(migration62, "utf8");
    assert.ok(sql.includes("channel_connections"));
    assert.ok(sql.includes("integration_tokens"));
    assert.ok(sql.includes("oauth_states"));
    assert.ok(sql.includes("webhook_events"));
    assert.ok(sql.includes("'youtube'"));
  });

  it("integrations page lists all 6 providers including youtube", () => {
    const pagePath = path.join(WORKTREE, "app/(app)/settings/integrations/page.tsx");
    const src = fs.readFileSync(pagePath, "utf8");
    assert.ok(src.includes('"youtube"'));
    assert.ok(src.includes('"whatsapp"'));
    assert.ok(src.includes('"instagram"'));
    assert.ok(src.includes('"facebook"'));
    assert.ok(src.includes('"google"'));
    assert.ok(src.includes('"tiktok"'));
  });

  it("GoogleAdapter supports GOOGLE_ADS_CLIENT_ID fallback and PKCE", () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    process.env.GOOGLE_ADS_CLIENT_ID = "mock-google-ads-client-id.apps.googleusercontent.com";
    process.env.GOOGLE_ADS_CLIENT_SECRET = "GOCSPX-mock-google-ads-secret";
    process.env.NEXT_PUBLIC_SITE_URL = "https://flowsales-ai-six.vercel.app";

    assert.equal(isProviderConfigured("google"), true);
    const adapter = getProviderAdapter("google");
    const result = adapter.buildAuthorizationUrl({
      organizationId: "org-1",
      userId: "user-1",
      returnPath: "/settings/integrations",
      codeVerifier: "mock-google-pkce-verifier-12345678",
      stateToken: "state-google-1",
    });

    assert.ok(result.url.startsWith("https://accounts.google.com/o/oauth2/v2/auth"));
    const parsed = new URL(result.url);
    assert.equal(parsed.searchParams.get("client_id"), "mock-google-ads-client-id.apps.googleusercontent.com");
    assert.equal(parsed.searchParams.get("redirect_uri"), "https://flowsales-ai-six.vercel.app/api/integrations/google/callback");
    assert.ok(parsed.searchParams.get("scope")?.includes("calendar.events"));
    assert.ok(parsed.searchParams.get("scope")?.includes("userinfo.email"));
    assert.equal(parsed.searchParams.get("code_challenge_method"), "S256");
    assert.ok(parsed.searchParams.get("code_challenge"));
  });

  it("YouTubeAdapter enforces dedicated YOUTUBE_CLIENT_ID and isolation from Google credentials", () => {
    delete process.env.YOUTUBE_CLIENT_ID;
    delete process.env.YOUTUBE_CLIENT_SECRET;
    process.env.GOOGLE_ADS_CLIENT_ID = "mock-google-ads-id.apps.googleusercontent.com";
    process.env.GOOGLE_ADS_CLIENT_SECRET = "GOCSPX-mock-google-ads-secret";
    process.env.NEXT_PUBLIC_SITE_URL = "https://flowsales-ai-six.vercel.app";

    assert.equal(isProviderConfigured("youtube"), false);

    process.env.YOUTUBE_CLIENT_ID = "mock-youtube-client-id";
    process.env.YOUTUBE_CLIENT_SECRET = "mock-youtube-client-secret";

    assert.equal(isProviderConfigured("youtube"), true);
    const adapter = getProviderAdapter("youtube");
    const result = adapter.buildAuthorizationUrl({
      organizationId: "org-1",
      userId: "user-1",
      returnPath: "/settings/integrations",
      codeVerifier: "mock-pkce-verifier",
      stateToken: "state-1",
    });

    const parsed = new URL(result.url);
    assert.equal(parsed.searchParams.get("client_id"), "mock-youtube-client-id");
    assert.equal(parsed.searchParams.get("redirect_uri"), "https://flowsales-ai-six.vercel.app/api/integrations/youtube/callback");
  });

  it("TikTokAdapter supports TIKTOK_CLIENT_ID and TIKTOK_APP_ID fallbacks", () => {
    delete process.env.TIKTOK_CLIENT_KEY;
    delete process.env.TIKTOK_CLIENT_SECRET;
    process.env.TIKTOK_CLIENT_ID = "mock-tiktok-client-id";
    process.env.TIKTOK_APP_SECRET = "mock-tiktok-app-secret";
    process.env.NEXT_PUBLIC_SITE_URL = "https://flowsales-ai-six.vercel.app";

    assert.equal(isProviderConfigured("tiktok"), true);
    const adapter = getProviderAdapter("tiktok");
    const result = adapter.buildAuthorizationUrl({
      organizationId: "org-1",
      userId: "user-1",
      returnPath: "/settings/integrations",
      codeVerifier: "mock-pkce-verifier",
      stateToken: "state-tt-1",
    });

    const parsed = new URL(result.url);
    assert.equal(parsed.searchParams.get("client_key"), "mock-tiktok-client-id");
    assert.equal(parsed.searchParams.get("redirect_uri"), "https://flowsales-ai-six.vercel.app/api/integrations/tiktok/callback");
  });

  it("OAuth callback routes verify access_denied redirection and route files existence", () => {
    const googleCb = path.join(WORKTREE, "app/api/integrations/google/callback/route.ts");
    const youtubeCb = path.join(WORKTREE, "app/api/integrations/youtube/callback/route.ts");
    const tiktokCb = path.join(WORKTREE, "app/api/integrations/tiktok/callback/route.ts");

    const googleSrc = fs.readFileSync(googleCb, "utf8");
    const youtubeSrc = fs.readFileSync(youtubeCb, "utf8");
    const tiktokSrc = fs.readFileSync(tiktokCb, "utf8");

    assert.ok(googleSrc.includes("access_denied"));
    assert.ok(youtubeSrc.includes("access_denied"));
    assert.ok(tiktokSrc.includes("access_denied"));

    assert.ok(googleSrc.includes("getSiteUrl()"));
    assert.ok(youtubeSrc.includes("getSiteUrl()"));
    assert.ok(tiktokSrc.includes("getSiteUrl()"));
  });
});
