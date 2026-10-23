import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as crypto from "node:crypto";
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const req = createRequire(import.meta.url);
const serverOnlyPath = req.resolve("server-only");
req.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as NodeModule;

import {
  socialPlatformSchema,
  socialPostInputSchema,
  validateSocialPostInput,
  buildMockSocialPost,
  publishSocialPostToMetaMock,
} from "@/lib/validations/social-publisher";

const {
  publishSocialPostToMeta,
  validatePlatformPublishingRequirements,
  calculateNextSocialRetryAt,
} = req("../server/services/integrations/social-publisher") as typeof import("@/server/services/integrations/social-publisher");

const testsDir = dirname(fileURLToPath(import.meta.url));
const migration0055Path = join(testsDir, "..", "supabase", "migrations", "0055_social_media_publishing.sql");
const migration0060Path = join(testsDir, "..", "supabase", "migrations", "0060_fix_social_media_tenant.sql");
const servicePath = join(testsDir, "..", "server", "services", "integrations", "social-publisher.ts");

const migration0055Source = readFileSync(migration0055Path, "utf8");
const migration0060Source = readFileSync(migration0060Path, "utf8");
const serviceSource = readFileSync(servicePath, "utf8");

const WORKSPACE_A = "550e8400-e29b-41d4-a716-446655440000";

function signSupabaseJwt(payload: Record<string, unknown>, secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${signature}`;
}

describe("Social Media Publishing Module & RLS Security Tests", () => {
  test("0055 migration defines social_posts table, RLS, and indexes", () => {
    assert.match(migration0055Source, /CREATE TABLE IF NOT EXISTS public\.social_posts/);
    assert.match(migration0055Source, /organization_id UUID REFERENCES public\.organizations/);
    assert.match(migration0055Source, /CREATE TABLE IF NOT EXISTS public\.social_publishing_queue/);
    assert.match(migration0055Source, /ALTER TABLE public\.social_posts ENABLE ROW LEVEL SECURITY;/);
    assert.match(migration0055Source, /CREATE POLICY "Users can manage social posts for their workspaces"/);
  });

  test("0060 migration enforces valid tenant integrity without subquery CHECK and defines WITH CHECK RLS policies", () => {
    // Must not contain any table ADD CONSTRAINT ... CHECK (...) with a SELECT subquery
    const tableCheckConstraints =
      migration0060Source.match(/ADD\s+CONSTRAINT\s+\w+\s+CHECK\s*\([\s\S]*?\);/gi) ?? [];
    assert.ok(tableCheckConstraints.length >= 1, "Expected table CHECK constraint in 0060 migration");
    for (const clause of tableCheckConstraints) {
      assert.doesNotMatch(clause, /\bSELECT\b/i, "Table CHECK constraint must never contain a subquery");
    }

    // Must define composite foreign key & tenant triggers
    assert.match(migration0060Source, /ADD CONSTRAINT social_posts_id_org_unique UNIQUE \(id, organization_id\)/);
    assert.match(migration0060Source, /ADD CONSTRAINT social_queue_post_org_fk/);
    assert.match(migration0060Source, /FOREIGN KEY \(post_id, organization_id\)\s+REFERENCES public\.social_posts \(id, organization_id\)/);
    assert.match(migration0060Source, /CREATE TRIGGER trg_normalize_social_post_tenant/);
    assert.match(migration0060Source, /CREATE TRIGGER trg_sync_queue_organization/);

    // Must define granular SELECT, INSERT, UPDATE, DELETE RLS policies with WITH CHECK
    assert.match(migration0060Source, /CREATE POLICY "social_posts_select_member"/);
    assert.match(migration0060Source, /CREATE POLICY "social_posts_insert_writer"/);
    assert.match(migration0060Source, /CREATE POLICY "social_posts_update_writer"/);
    assert.match(migration0060Source, /CREATE POLICY "social_posts_delete_writer"/);
    assert.match(migration0060Source, /CREATE POLICY "social_queue_select_member"/);
    assert.match(migration0060Source, /CREATE POLICY "social_queue_insert_writer"/);
    assert.match(migration0060Source, /CREATE POLICY "social_queue_update_writer"/);
    assert.match(migration0060Source, /CREATE POLICY "social_queue_delete_writer"/);
    assert.match(migration0060Source, /REVOKE ALL ON FUNCTION public\.claim_due_social_posts\(integer\) FROM PUBLIC/);
  });

  test("social-publisher.ts is server only, re-exports publisher contract, and never generates fake Meta IDs", () => {
    assert.match(serviceSource, /import "server-only";/);
    assert.match(serviceSource, /export async function generateCaptionAi/);
    assert.match(serviceSource, /export async function publishSocialPostToMeta/);
    assert.doesNotMatch(serviceSource, /meta_post_\$\{Date\.now\(\)\}/);
  });

  test("socialPlatformSchema validates supported platforms", () => {
    assert.equal(socialPlatformSchema.parse("instagram"), "instagram");
    assert.equal(socialPlatformSchema.parse("facebook"), "facebook");
    assert.equal(socialPlatformSchema.parse("both"), "both");
    assert.throws(() => socialPlatformSchema.parse("twitter"));
  });

  test("socialPostInputSchema validates input requirements and limits", () => {
    const valid = socialPostInputSchema.parse({
      workspaceId: WORKSPACE_A,
      platform: "instagram",
      content: "Yaz kampanyamız başladı!",
      hashtags: ["#kampanya", "#yaz"],
    });

    assert.equal(valid.workspaceId, WORKSPACE_A);
    assert.equal(valid.platform, "instagram");
    assert.equal(valid.status, "draft");

    assert.throws(
      () =>
        socialPostInputSchema.parse({
          workspaceId: "invalid-uuid",
          platform: "instagram",
          content: "Test",
        }),
      /workspace_id/,
    );

    assert.throws(
      () =>
        socialPostInputSchema.parse({
          workspaceId: WORKSPACE_A,
          platform: "instagram",
          content: "",
        }),
      /İçerik boş olamaz/,
    );
  });

  test("buildMockSocialPost constructs valid post record", () => {
    const input = validateSocialPostInput({
      workspaceId: WORKSPACE_A,
      platform: "both",
      content: "Şantiye konteyner teslimatımız tamamlandı.",
      hashtags: ["#santiye", "#ofis"],
      status: "scheduled",
      scheduledAt: "2026-04-01T10:00:00Z",
    });

    const record = buildMockSocialPost(input);
    assert.equal(record.workspace_id, input.workspaceId);
    assert.equal(record.platform, "both");
    assert.equal(record.status, "scheduled");
    assert.equal(record.scheduled_at, "2026-04-01T10:00:00Z");
    assert.ok(record.id.startsWith("post_"));
  });

  test("publishSocialPostToMetaMock handles missing or invalid token safely", () => {
    const post = buildMockSocialPost({
      workspaceId: WORKSPACE_A,
      platform: "instagram",
      content: "Test post",
      mediaUrls: [],
      hashtags: [],
      status: "draft",
      scheduledAt: null,
    });

    const noTokenRes = publishSocialPostToMetaMock(post, undefined);
    assert.equal(noTokenRes.success, false);
    assert.match(noTokenRes.errorMessage!, /tokenı tanımlı değil/);

    const invalidTokenRes = publishSocialPostToMetaMock(post, "invalid_token");
    assert.equal(invalidTokenRes.success, false);
    assert.match(invalidTokenRes.errorMessage!, /token yetkisiz veya süresi dolmuş/);

    const successRes = publishSocialPostToMetaMock(post, "valid_page_access_token_123");
    assert.equal(successRes.success, true);
    assert.ok(successRes.metaPostId?.startsWith("meta_post_"));
  });

  test("validatePlatformPublishingRequirements enforces Instagram media, HTTPS, extensions, and permissions", () => {
    // 1. Instagram without media -> rejected
    const igNoMedia = validatePlatformPublishingRequirements({
      platform: "instagram",
      caption: "Görselsiz Instagram gönderisi",
      mediaUrls: [],
    });
    assert.equal(igNoMedia.ok, false);
    if (!igNoMedia.ok) {
      assert.equal(igNoMedia.errorCode, "media_required");
    }

    // 2. Non-HTTPS media URL -> rejected
    const httpMedia = validatePlatformPublishingRequirements({
      platform: "instagram",
      caption: "Güvensiz URL",
      mediaUrls: ["http://cdn.example.com/photo.jpg"],
    });
    assert.equal(httpMedia.ok, false);
    if (!httpMedia.ok) {
      assert.equal(httpMedia.errorCode, "unsupported_media");
    }

    // 3. Unsupported extension (.svg / .exe) -> rejected
    const badExt = validatePlatformPublishingRequirements({
      platform: "facebook",
      caption: "Desteklenmeyen dosya",
      mediaUrls: ["https://cdn.example.com/banner.svg"],
    });
    assert.equal(badExt.ok, false);
    if (!badExt.ok) {
      assert.equal(badExt.errorCode, "unsupported_media");
    }

    // 4. Missing required publish scope -> rejected
    const missingScope = validatePlatformPublishingRequirements({
      platform: "instagram",
      caption: "Yetkisiz kapsam",
      mediaUrls: ["https://cdn.example.com/photo.jpg"],
      scopes: ["instagram_basic"], // missing instagram_content_publish
    });
    assert.equal(missingScope.ok, false);
    if (!missingScope.ok) {
      assert.equal(missingScope.errorCode, "permission_denied");
    }
  });

  test("publishSocialPostToMeta executes real Facebook Page and Instagram Business container + polling + publish flows", async () => {
    const apiCalls: Array<{ url: string; method: string; body?: unknown }> = [];
    let igPollCount = 0;

    const mockFetch: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method || "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      apiCalls.push({ url, method, body });

      // Facebook Page feed post
      if (url.endsWith("/page_123/feed") && method === "POST") {
        return new Response(JSON.stringify({ id: "page_123_post_999" }), { status: 200 });
      }

      // Instagram container creation
      if (url.endsWith("/ig_456/media") && method === "POST") {
        return new Response(JSON.stringify({ id: "ig_container_777" }), { status: 200 });
      }

      // Instagram container status polling (IN_PROGRESS -> FINISHED)
      if (url.includes("/ig_container_777?fields=status_code,status") && method === "GET") {
        igPollCount++;
        const statusCode = igPollCount === 1 ? "IN_PROGRESS" : "FINISHED";
        return new Response(JSON.stringify({ id: "ig_container_777", status_code: statusCode }), {
          status: 200,
        });
      }

      // Instagram media_publish
      if (url.endsWith("/ig_456/media_publish") && method === "POST") {
        return new Response(JSON.stringify({ id: "ig_published_888" }), { status: 200 });
      }

      return new Response(JSON.stringify({ error: { message: "Unexpected endpoint", code: 100 } }), {
        status: 400,
      });
    };

    // 1. Facebook Page text post
    const fbRes = await publishSocialPostToMeta(
      {
        platform: "facebook",
        caption: "Yeni konteyner modellerimiz stokta!",
        hashtags: ["konteyner", "prefabrik"],
        pageId: "page_123",
      },
      "eaab_valid_page_token",
      { fetchImpl: mockFetch },
    );

    assert.equal(fbRes.success, true);
    assert.equal(fbRes.metaPostId, "page_123_post_999");

    // 2. Instagram Business image post with status polling
    const igRes = await publishSocialPostToMeta(
      {
        platform: "instagram",
        caption: "Instagram lansman görseli",
        mediaUrls: ["https://cdn.example.com/product.jpg"],
        igUserId: "ig_456",
      },
      "eaab_valid_ig_token",
      { fetchImpl: mockFetch, maxPollAttempts: 3, pollIntervalMs: 0 },
    );

    assert.equal(igRes.success, true);
    assert.equal(igRes.metaPostId, "ig_published_888");
    assert.equal(igRes.containerId, "ig_container_777");
    assert.equal(igPollCount, 2, "Should poll container status until FINISHED");

    // 3. Queue idempotency: alreadyPublishedExternalId prevents duplicate API calls
    const callCountBeforeDedupe = apiCalls.length;
    const dedupedRes = await publishSocialPostToMeta(
      {
        platform: "facebook",
        caption: "Tekrar deneme",
        alreadyPublishedExternalId: "page_123_post_999",
      },
      "eaab_valid_page_token",
      { fetchImpl: mockFetch },
    );
    assert.equal(dedupedRes.success, true);
    assert.equal(dedupedRes.deduplicated, true);
    assert.equal(dedupedRes.metaPostId, "page_123_post_999");
    assert.equal(apiCalls.length, callCountBeforeDedupe, "Must not make HTTP calls when already published");
  });

  test("publishSocialPostToMeta handles rate limits, permission errors, and partial recovery without duplicate containers", async () => {
    // 1. Rate limit error (HTTP 429 / code 32)
    const rateLimitFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          error: { message: "Page request limit reached", type: "OAuthException", code: 32 },
        }),
        { status: 429, headers: { "Retry-After": "120" } },
      );

    const rateRes = await publishSocialPostToMeta(
      { platform: "facebook", caption: "Test", pageId: "page_1" },
      "valid_token",
      { fetchImpl: rateLimitFetch },
    );
    assert.equal(rateRes.success, false);
    assert.equal(rateRes.errorCode, "rate_limited");
    assert.equal(rateRes.retryable, true);
    assert.equal(rateRes.retryAfterMs, 120_000);

    // 2. Partial failure recovery: reusing existing containerId skips POST /media
    let mediaCreateCalled = false;
    const recoveryFetch: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.endsWith("/media") && init?.method === "POST") {
        mediaCreateCalled = true;
      }
      if (url.includes("container_existing_1?fields=status_code")) {
        return new Response(JSON.stringify({ id: "container_existing_1", status_code: "FINISHED" }), {
          status: 200,
        });
      }
      if (url.endsWith("/media_publish")) {
        return new Response(JSON.stringify({ id: "ig_recovered_post_1" }), { status: 200 });
      }
      return new Response("{}", { status: 400 });
    };

    const recovered = await publishSocialPostToMeta(
      {
        platform: "instagram",
        caption: "Kaldığı yerden devam eden yayın",
        mediaUrls: ["https://cdn.example.com/photo.png"],
        igUserId: "ig_1",
        containerId: "container_existing_1",
      },
      "valid_token",
      { fetchImpl: recoveryFetch },
    );
    assert.equal(recovered.success, true);
    assert.equal(recovered.metaPostId, "ig_recovered_post_1");
    assert.equal(mediaCreateCalled, false, "Must reuse existing containerId and not create duplicate container");

    // 3. Bounded retry backoff calculation
    const nextRetryIso = calculateNextSocialRetryAt(2, 60_000);
    assert.ok(new Date(nextRetryIso).getTime() > Date.now() + 90_000);
  });

  test("Real RLS & tenant integrity integration test across two independent workspaces and separate authenticated users", async (t) => {
    const supabaseUrl = process.env.SUPABASE_TEST_URL?.trim() || "http://127.0.0.1:56431";
    const jwtSecret =
      process.env.SUPABASE_TEST_JWT_SECRET?.trim() ||
      "super-secret-jwt-token-with-at-least-32-characters-long";

    // Check if isolated local Supabase test instance is reachable
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const anonKey = signSupabaseJwt({ role: "anon", iss: "supabase", exp }, jwtSecret);
    const serviceRoleKey = signSupabaseJwt({ role: "service_role", iss: "supabase", exp }, jwtSecret);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    try {
      const { error: pingError } = await admin.from("organizations").select("id").limit(1);
      if (pingError) {
        t.skip(`Isolated Supabase test instance not reachable (${pingError.message})`);
        return;
      }
    } catch {
      t.skip("Isolated Supabase test instance not reachable on 127.0.0.1:56431");
      return;
    }

    const orgAId = crypto.randomUUID();
    const orgBId = crypto.randomUUID();
    const userAOwnerId = crypto.randomUUID();
    const userAViewerId = crypto.randomUUID();
    const userBOwnerId = crypto.randomUUID();

    // Create two independentauthenticated clients (NOT service_role) + a viewer client
    const createAuthenticatedUserClient = (userId: string, email: string) => {
      const userJwt = signSupabaseJwt(
        {
          sub: userId,
          email,
          role: "authenticated",
          aud: "authenticated",
          iss: "supabase",
          exp,
        },
        jwtSecret,
      );
      return createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: {
          headers: {
            Authorization: `Bearer ${userJwt}`,
          },
        },
      });
    };

    const clientA = createAuthenticatedUserClient(userAOwnerId, `owner-a-${orgAId}@example.com`);
    const clientAViewer = createAuthenticatedUserClient(userAViewerId, `viewer-a-${orgAId}@example.com`);
    const clientB = createAuthenticatedUserClient(userBOwnerId, `owner-b-${orgBId}@example.com`);

    try {
      // Seed users and two independent workspaces using admin fixture setup
      for (const u of [
        { id: userAOwnerId, email: `owner-a-${orgAId}@example.com` },
        { id: userAViewerId, email: `viewer-a-${orgAId}@example.com` },
        { id: userBOwnerId, email: `owner-b-${orgBId}@example.com` },
      ]) {
        const { error: userErr } = await admin.auth.admin.createUser({
          id: u.id,
          email: u.email,
          password: "TestPassword123!",
          email_confirm: true,
        });
        assert.equal(userErr, null, `Failed to create test auth user: ${userErr?.message}`);
      }

      const { error: orgErr } = await admin.from("organizations").insert([
        { id: orgAId, name: "RLS Test Workspace A", slug: `rls-ws-a-${orgAId.slice(0, 8)}` },
        { id: orgBId, name: "RLS Test Workspace B", slug: `rls-ws-b-${orgBId.slice(0, 8)}` },
      ]);
      assert.equal(orgErr, null, `Failed to seed test organizations: ${orgErr?.message}`);

      const { error: memberErr } = await admin.from("organization_members").insert([
        { organization_id: orgAId, user_id: userAOwnerId, role: "owner" },
        { organization_id: orgAId, user_id: userAViewerId, role: "viewer" },
        { organization_id: orgBId, user_id: userBOwnerId, role: "owner" },
      ]);
      assert.equal(memberErr, null, `Failed to seed organization_members: ${memberErr?.message}`);

      // 1. Authorized INSERT into own workspace (testing both organization_id and workspace_id normalization)
      const { data: postA, error: insertAErr } = await clientA
        .from("social_posts")
        .insert({
          workspace_id: orgAId,
          caption: "Workspace A Post",
          platform: "instagram",
          status: "scheduled",
        })
        .select("*")
        .single();
      assert.equal(insertAErr, null, `Workspace A owner insert failed: ${insertAErr?.message}`);
      assert.equal(postA.organization_id, orgAId, "Trigger must populate organization_id from workspace_id");
      assert.equal(postA.workspace_id, orgAId);

      const { data: postB, error: insertBErr } = await clientB
        .from("social_posts")
        .insert({
          organization_id: orgBId,
          caption: "Workspace B Post",
          platform: "facebook",
          status: "scheduled",
        })
        .select("*")
        .single();
      assert.equal(insertBErr, null, `Workspace B owner insert failed: ${insertBErr?.message}`);
      assert.equal(postB.workspace_id, orgBId, "Trigger must populate workspace_id from organization_id");

      // 2. SELECT isolation: User A cannot see Workspace B posts; User B cannot see Workspace A posts
      const { data: aVisiblePosts, error: aSelectErr } = await clientA.from("social_posts").select("id, organization_id");
      assert.equal(aSelectErr, null);
      assert.equal(aVisiblePosts?.length, 1);
      assert.equal(aVisiblePosts?.[0]?.id, postA.id);

      const { data: bVisiblePosts, error: bSelectErr } = await clientB.from("social_posts").select("id, organization_id");
      assert.equal(bSelectErr, null);
      assert.equal(bVisiblePosts?.length, 1);
      assert.equal(bVisiblePosts?.[0]?.id, postB.id);

      // Viewer in Workspace A can SELECT Workspace A posts
      const { data: viewerVisible } = await clientAViewer.from("social_posts").select("id");
      assert.equal(viewerVisible?.length, 1);
      assert.equal(viewerVisible?.[0]?.id, postA.id);

      // 3. INSERT restrictions:
      // 3a. User A cannot insert a post into Workspace B
      const { error: crossInsertErr } = await clientA.from("social_posts").insert({
        organization_id: orgBId,
        caption: "Spoofed cross-tenant post",
        platform: "facebook",
      });
      assert.notEqual(crossInsertErr, null, "Cross-workspace INSERT must be blocked by RLS WITH CHECK");

      // 3b. User A cannot insert with mismatched organization_id=orgA and workspace_id=orgB
      const { error: mismatchInsertErr } = await clientA.from("social_posts").insert({
        organization_id: orgAId,
        workspace_id: orgBId,
        caption: "Mismatched tenant columns",
        platform: "facebook",
      });
      assert.notEqual(mismatchInsertErr, null, "Mismatched organization_id/workspace_id INSERT must be blocked");

      // 3c. Viewer in Workspace A cannot INSERT into Workspace A
      const { error: viewerInsertErr } = await clientAViewer.from("social_posts").insert({
        organization_id: orgAId,
        caption: "Viewer unauthorized post",
        platform: "facebook",
      });
      assert.notEqual(viewerInsertErr, null, "Viewer role must be blocked from INSERT by RLS WITH CHECK");

      // 4. UPDATE restrictions:
      // 4a. User A cannot update Workspace B's post
      const { data: crossUpdatedRows } = await clientA
        .from("social_posts")
        .update({ caption: "Hacked by A" })
        .eq("id", postB.id)
        .select("id");
      assert.equal((crossUpdatedRows ?? []).length, 0, "User A must not be able to update Workspace B post");

      // 4b. User A cannot transfer their own post to Workspace B
      const { error: transferErr } = await clientA
        .from("social_posts")
        .update({ organization_id: orgBId, workspace_id: orgBId })
        .eq("id", postA.id);
      assert.notEqual(transferErr, null, "Cross-tenant reassignment on UPDATE must be rejected");

      // 4c. Viewer cannot update Workspace A's post
      const { data: viewerUpdatedRows } = await clientAViewer
        .from("social_posts")
        .update({ caption: "Viewer edit attempt" })
        .eq("id", postA.id)
        .select("id");
      assert.equal((viewerUpdatedRows ?? []).length, 0, "Viewer must not be able to update posts");

      // 5. Publishing Queue access boundaries & Cross-workspace ownership protection:
      // 5a. User A can enqueue their own postA
      const { data: queueA, error: queueAErr } = await clientA
        .from("social_publishing_queue")
        .insert({
          organization_id: orgAId,
          post_id: postA.id,
          platform: "instagram",
          scheduled_for: new Date().toISOString(),
        })
        .select("*")
        .single();
      assert.equal(queueAErr, null, `Workspace A queue insert failed: ${queueAErr?.message}`);
      assert.equal(queueA.organization_id, orgAId);

      // 5b. User A CANNOT enqueue Workspace B's postB under Workspace A's organization_id
      const { error: crossQueueErr } = await clientA.from("social_publishing_queue").insert({
        organization_id: orgAId,
        post_id: postB.id,
        platform: "facebook",
        scheduled_for: new Date().toISOString(),
      });
      assert.notEqual(
        crossQueueErr,
        null,
        "Queue insert referencing a foreign workspace post_id must be rejected by RLS and trigger/composite FK",
      );

      // 5c. User B cannot SELECT Workspace A's queue items
      const { data: bVisibleQueue } = await clientB.from("social_publishing_queue").select("id");
      assert.equal((bVisibleQueue ?? []).length, 0, "User B must see 0 queue items from Workspace A");

      // 5d. Authenticated user cannot execute service_role-only worker RPC claim_due_social_posts
      const { error: rpcAuthErr } = await clientA.rpc("claim_due_social_posts", { batch_size: 5 });
      assert.notEqual(rpcAuthErr, null, "Authenticated user must not be permitted to call claim_due_social_posts");

      // 5e. Service role worker CAN atomically claim due queue items
      const { data: claimedByWorker, error: workerRpcErr } = await admin.rpc("claim_due_social_posts", {
        batch_size: 5,
      });
      assert.equal(workerRpcErr, null, `Service role claim_due_social_posts failed: ${workerRpcErr?.message}`);
      assert.ok(
        Array.isArray(claimedByWorker) && claimedByWorker.some((row: { id: string; status: string }) => row.id === queueA.id && row.status === "processing"),
        "Worker RPC must atomically claim due queue item and transition status to processing",
      );

      // 6. DELETE restrictions:
      // 6a. User A cannot delete Workspace B's post
      const { data: crossDeleted } = await clientA
        .from("social_posts")
        .delete()
        .eq("id", postB.id)
        .select("id");
      assert.equal((crossDeleted ?? []).length, 0, "User A must not be able to delete Workspace B post");

      // 6b. Viewer cannot delete Workspace A's post
      const { data: viewerDeleted } = await clientAViewer
        .from("social_posts")
        .delete()
        .eq("id", postA.id)
        .select("id");
      assert.equal((viewerDeleted ?? []).length, 0, "Viewer must not be able to delete Workspace A post");

      // 6c. Authorized owner A can delete their own postA
      const { data: ownerDeleted, error: ownerDeleteErr } = await clientA
        .from("social_posts")
        .delete()
        .eq("id", postA.id)
        .select("id");
      assert.equal(ownerDeleteErr, null);
      assert.equal(ownerDeleted?.length, 1);
    } finally {
      // Clean up test fixtures
      await admin.from("organizations").delete().in("id", [orgAId, orgBId]);
      await admin.auth.admin.deleteUser(userAOwnerId).catch(() => null);
      await admin.auth.admin.deleteUser(userAViewerId).catch(() => null);
      await admin.auth.admin.deleteUser(userBOwnerId).catch(() => null);
    }
  });
});
