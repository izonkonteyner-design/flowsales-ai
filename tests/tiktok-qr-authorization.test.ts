import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const req = createRequire(import.meta.url);
const serverOnlyPath = req.resolve("server-only");
req.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as NodeModule;

const { resolveTikTokCapabilities } = req("../lib/validations/tiktok-capabilities") as typeof import("@/lib/validations/tiktok-capabilities");
const {
  initiateTikTokQrSession,
  checkTikTokQrStatus,
  cancelTikTokQrSession,
} = req("../server/services/integrations/tiktok-qr-service") as typeof import("@/server/services/integrations/tiktok-qr-service");
const {
  getProviderAdapter,
  isProviderConfigured,
  OAuthConfigurationRequiredError,
} = req("../server/services/integrations/provider-adapter") as typeof import("@/server/services/integrations/provider-adapter");
const { encryptToken } = req("../server/services/integrations/encryption") as typeof import("@/server/services/integrations/encryption");

const WORKTREE = process.cwd();

describe("TikTok QR Code Authorization & Capability Suite", () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = savedEnv;
  });

  it("resolveTikTokCapabilities correctly determines full vs partial app review permissions", () => {
    // 1. Full scopes
    const full = resolveTikTokCapabilities([
      "user.info.basic",
      "video.upload",
      "video.publish",
    ]);
    assert.equal(full.accountConnected, true);
    assert.equal(full.basicProfileAccess, true);
    assert.equal(full.videoUploadAuthorized, true);
    assert.equal(full.directPublishAuthorized, true);
    assert.equal(full.appReviewStatus, "fully_authorized");
    assert.equal(full.missingPermissions.length, 0);

    // 2. Missing video.publish (pending TikTok Developer App Review)
    const partial = resolveTikTokCapabilities(["user.info.basic", "video.upload"]);
    assert.equal(partial.accountConnected, true);
    assert.equal(partial.basicProfileAccess, true);
    assert.equal(partial.videoUploadAuthorized, true);
    assert.equal(partial.directPublishAuthorized, false);
    assert.equal(partial.appReviewStatus, "partially_authorized");
    assert.ok(partial.explanation.includes("video.publish"));
    assert.ok(partial.missingPermissions.some((p) => p.includes("video.publish")));

    // 3. Basic only
    const basicOnly = resolveTikTokCapabilities(["user.info.basic"]);
    assert.equal(basicOnly.basicProfileAccess, true);
    assert.equal(basicOnly.videoUploadAuthorized, false);
    assert.equal(basicOnly.directPublishAuthorized, false);
    assert.equal(basicOnly.appReviewStatus, "partially_authorized");

    // 4. Empty scopes
    const empty = resolveTikTokCapabilities([]);
    assert.equal(empty.basicProfileAccess, false);
    assert.equal(empty.missingPermissions.length, 3);
  });

  it("initiateTikTokQrSession fails with configuration error when credentials unset", async () => {
    delete process.env.TIKTOK_CLIENT_KEY;
    delete process.env.TIKTOK_CLIENT_ID;
    delete process.env.TIKTOK_APP_ID;
    delete process.env.TIKTOK_CLIENT_SECRET;
    delete process.env.TIKTOK_APP_SECRET;

    await assert.rejects(
      async () => {
        await initiateTikTokQrSession({
          organizationId: "org-test-1",
          userId: "user-test-1",
        });
      },
      (err: unknown) => err instanceof OAuthConfigurationRequiredError,
    );
  });

  it("initiateTikTokQrSession handles TikTok QR API rejection with qr_unavailable error", async () => {
    process.env.TIKTOK_CLIENT_KEY = "test-client-key";
    process.env.TIKTOK_CLIENT_SECRET = "test-client-secret";
    process.env.TOKEN_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    process.env.NEXT_PUBLIC_SITE_URL = "https://flowsales-ai-six.vercel.app";

    // Mock fetch where TikTok API reports QR login not approved for this app
    const mockFetch = async () => {
      return new Response(
        JSON.stringify({
          error: "scope_not_authorized",
          error_description: "Login Kit with QR Code is not authorized for this app.",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    };

    const result = await initiateTikTokQrSession({
      organizationId: "f11c1551-8b3a-4a18-ad6e-0ab16c061920",
      userId: "02aeb5a0-b3b3-4d71-8053-e9506d2f5ac0",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error, "qr_unavailable");
      assert.ok(result.message.includes("Login Kit with QR Code"));
    }
  });

  it("initiateTikTokQrSession succeeds with official TikTok QR response and generates QR code data URL", async () => {
    process.env.TIKTOK_CLIENT_KEY = "test-client-key";
    process.env.TIKTOK_CLIENT_SECRET = "test-client-secret";
    process.env.TOKEN_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    process.env.NEXT_PUBLIC_SITE_URL = "https://flowsales-ai-six.vercel.app";

    // Mock official TikTok v2 get_qrcode response
    const mockFetch = async () => {
      return new Response(
        JSON.stringify({
            scan_qrcode_url:
              "aweme://authorize?authType=100&client_key=test-client-key&client_ticket=tobefilled&scope=user.info.basic&response_type=code",
            token: "MOCK_TIKTOK_QR_TOKEN_12345",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const result = await initiateTikTokQrSession({
      organizationId: "f11c1551-8b3a-4a18-ad6e-0ab16c061920",
      userId: "02aeb5a0-b3b3-4d71-8053-e9506d2f5ac0",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.ok(result.qrSessionId);
      assert.ok(result.qrCodeDataUrl.startsWith("data:image/png;base64,"));
      assert.ok(result.scanUrl.startsWith("aweme://authorize"));
      assert.ok(!result.scanUrl.includes("client_ticket=tobefilled"));
      assert.ok(result.scanUrl.includes("client_ticket="));
      assert.ok(result.expiresAt);
    }
  });

  it("checkTikTokQrStatus returns waiting, scanned, and confirmed states from official responses", async () => {
    process.env.TIKTOK_CLIENT_KEY = "test-client-key";
    process.env.TIKTOK_CLIENT_SECRET = "test-client-secret";
    process.env.TOKEN_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    process.env.NEXT_PUBLIC_SITE_URL = "https://flowsales-ai-six.vercel.app";

    const sessionPayload = JSON.stringify({
      qrSessionId: "qr-session-mock-1",
      tiktokToken: "MOCK_TT_TOKEN",
      clientTicket: "mock-ticket",
      scopes: ["user.info.basic", "video.upload"],
    });

    const mockRow = {
      id: "row-1",
      organization_id: "f11c1551-8b3a-4a18-ad6e-0ab16c061920",
      user_id: "02aeb5a0-b3b3-4d71-8053-e9506d2f5ac0",
      provider: "tiktok",
      code_verifier_ciphertext: encryptToken(sessionPayload),
      expires_at: new Date(Date.now() + 60000).toISOString(),
      consumed_at: null,
    };

    const mockDb = {
      from: () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const query: any = {};
        query.select = () => query;
        query.eq = () => query;
        query.is = () => query;
        query.maybeSingle = async () => ({ data: mockRow, error: null });
        query.update = () => query;
        return query;
      },
    };

    // 1. Status: new (waiting for scan)
    const waitingFetch = async () =>
      new Response(JSON.stringify({ status: "new" }), { status: 200 });

    const waitResult = await checkTikTokQrStatus({
      qrSessionId: "qr-session-mock-1",
      organizationId: "f11c1551-8b3a-4a18-ad6e-0ab16c061920",
      userId: "02aeb5a0-b3b3-4d71-8053-e9506d2f5ac0",
      fetchImpl: waitingFetch as unknown as typeof fetch,
      dbClient: mockDb,
    });
    assert.equal(waitResult.status, "waiting");

    // 2. Status: scanned (waiting for confirmation on device)
    const scannedFetch = async () =>
      new Response(JSON.stringify({ status: "scanned", client_ticket: "mock-ticket" }), { status: 200 });

    const scanResult = await checkTikTokQrStatus({
      qrSessionId: "qr-session-mock-1",
      organizationId: "f11c1551-8b3a-4a18-ad6e-0ab16c061920",
      userId: "02aeb5a0-b3b3-4d71-8053-e9506d2f5ac0",
      fetchImpl: scannedFetch as unknown as typeof fetch,
      dbClient: mockDb,
    });
    assert.equal(scanResult.status, "scanned");

    // 3. Status: expired
    const expiredFetch = async () =>
      new Response(JSON.stringify({ status: "expired" }), { status: 200 });

    const expResult = await checkTikTokQrStatus({
      qrSessionId: "qr-session-mock-1",
      organizationId: "f11c1551-8b3a-4a18-ad6e-0ab16c061920",
      userId: "02aeb5a0-b3b3-4d71-8053-e9506d2f5ac0",
      fetchImpl: expiredFetch as unknown as typeof fetch,
      dbClient: mockDb,
    });
    assert.equal(expResult.status, "expired");

    for (const response of [
      { status: "confirmed", client_ticket: "wrong", code: "test-code" },
      { status: "confirmed", client_ticket: "mock-ticket", redirect_uri: "https://attacker.example/callback?code=test-code" },
      { status: "confirmed", client_ticket: "mock-ticket" },
      { error: "invalid_request", error_description: "App not authorized" },
    ]) {
      const rejected = await checkTikTokQrStatus({
        qrSessionId: "qr-session-mock-1", organizationId: mockRow.organization_id, userId: mockRow.user_id,
        fetchImpl: (async () => Response.json(response)) as typeof fetch, dbClient: mockDb,
      });
      assert.equal(rejected.status, "error");
    }
  });

  it("cancelTikTokQrSession marks session consumed", async () => {
    let updated = false;
    const mockDb = {
      from: () => ({
        update: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                is: async () => {
                  updated = true;
                  return { error: null };
                },
              }),
            }),
          }),
        }),
      }),
    };

    const res = await cancelTikTokQrSession({
      qrSessionId: "cancel-session-1",
      organizationId: "f11c1551-8b3a-4a18-ad6e-0ab16c061920",
      userId: "02aeb5a0-b3b3-4d71-8053-e9506d2f5ac0",
      dbClient: mockDb,
    });

    assert.equal(res.ok, true);
    assert.equal(updated, true);
  });

  it("TikTok QR API endpoints exist with proper server guards and role checks", () => {
    const initiateRoute = path.join(WORKTREE, "app/api/integrations/tiktok/qr/initiate/route.ts");
    const statusRoute = path.join(WORKTREE, "app/api/integrations/tiktok/qr/status/route.ts");
    const cancelRoute = path.join(WORKTREE, "app/api/integrations/tiktok/qr/cancel/route.ts");

    assert.ok(fs.existsSync(initiateRoute), "initiate route must exist");
    assert.ok(fs.existsSync(statusRoute), "status route must exist");
    assert.ok(fs.existsSync(cancelRoute), "cancel route must exist");

    const initiateSrc = fs.readFileSync(initiateRoute, "utf8");
    const statusSrc = fs.readFileSync(statusRoute, "utf8");
    const cancelSrc = fs.readFileSync(cancelRoute, "utf8");

    assert.ok(initiateSrc.includes("runOAuthGuard"));
    assert.ok(statusSrc.includes("runOAuthGuard"));
    assert.ok(cancelSrc.includes("runOAuthGuard"));

    assert.ok(initiateSrc.includes('ctx.role !== "owner" && ctx.role !== "admin"'));
    assert.ok(statusSrc.includes('ctx.role !== "owner" && ctx.role !== "admin"'));
  });

  it("IntegrationCard renders both standard OAuth and QR Code connection buttons for TikTok", () => {
    const cardPath = path.join(WORKTREE, "components/settings/integration-card.tsx");
    const src = fs.readFileSync(cardPath, "utf8");

    assert.ok(src.includes('id="connect-tiktok-oauth"'));
    assert.ok(src.includes('id="connect-tiktok-qr"'));
    assert.ok(src.includes("TikTok ile Bağlan"));
    assert.ok(src.includes("QR Kod ile Bağlan"));
    assert.ok(src.includes("TikTokQrModal"));
    assert.ok(src.includes("resolveTikTokCapabilities"));
  });

  it("Preserves existing TikTok OAuth Login Kit contracts", () => {
    delete process.env.TIKTOK_SCOPES;
    process.env.TIKTOK_CLIENT_KEY = "mock-tiktok-key";
    process.env.TIKTOK_CLIENT_SECRET = "mock-tiktok-secret";
    process.env.TOKEN_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    process.env.NEXT_PUBLIC_SITE_URL = "https://flowsales-ai-six.vercel.app";

    assert.equal(isProviderConfigured("tiktok"), true);
    const adapter = getProviderAdapter("tiktok");
    const authUrl = adapter.buildAuthorizationUrl({
      organizationId: "org-1",
      userId: "user-1",
      returnPath: "/settings/integrations",
      stateToken: "state-123",
      codeVerifier: "verifier-123",
    });

    assert.ok(authUrl.url.startsWith("https://www.tiktok.com/v2/auth/authorize/"));
    const parsed = new URL(authUrl.url);
    assert.equal(parsed.searchParams.get("client_key"), "mock-tiktok-key");
    assert.equal(parsed.searchParams.get("response_type"), "code");
    assert.equal(parsed.searchParams.get("state"), "state-123");
    assert.ok(parsed.searchParams.get("scope")?.includes("user.info.basic"));
    assert.equal(parsed.searchParams.get("scope"), "user.info.basic");
  });

  it("accepts the official flat v2 token response for exchange and refresh", async () => {
    process.env.TIKTOK_CLIENT_KEY = "mock-key";
    process.env.TIKTOK_CLIENT_SECRET = "mock-secret";
    process.env.TOKEN_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request) => {
      if (String(url).includes("/user/info/")) {
        assert.ok(!String(url).includes("username"));
        return Response.json({ data: { user: { open_id: "test-open-id", display_name: "Test" } } });
      }
      return Response.json({ access_token: "test-access", refresh_token: "test-refresh", expires_in: 86400, refresh_expires_in: 31536000, scope: "user.info.basic", token_type: "Bearer", open_id: "test-open-id" });
    }) as typeof fetch;
    try {
      const adapter = getProviderAdapter("tiktok");
      const exchanged = await adapter.exchangeCode({ organizationId: "org-1", userId: "user-1", code: "test-code", codeVerifier: null, redirectUri: "https://example.com/callback" });
      assert.deepEqual(exchanged.scopes, ["user.info.basic"]);
      assert.ok(exchanged.accessTokenCipher);
      const refreshed = await adapter.refreshAccessToken({ organizationId: "org-1", connectionId: "connection-1", refreshTokenCipher: exchanged.refreshTokenCipher! });
      assert.deepEqual(refreshed.scopes, ["user.info.basic"]);
      assert.ok(refreshed.refreshTokenCipher);
      globalThis.fetch = (async () => Response.json({ error: "invalid_grant", error_description: "Authorization code expired" }, { status: 400 })) as typeof fetch;
      await assert.rejects(adapter.exchangeCode({ organizationId: "org-1", code: "expired", codeVerifier: null, redirectUri: "https://example.com/callback" }), /Authorization code expired/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
