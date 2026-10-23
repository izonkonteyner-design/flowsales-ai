import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";

const req = createRequire(import.meta.url);
const serverOnlyPath = req.resolve("server-only");
req.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as NodeModule;

const { runSocialPublishingWorkerCycle, GET } = req(
  "../app/api/cron/social-publishing/route",
) as typeof import("@/app/api/cron/social-publishing/route");

const testsDir = dirname(fileURLToPath(import.meta.url));
const cronRoutePath = join(testsDir, "..", "app", "api", "cron", "social-publishing", "route.ts");
const cronRouteSource = readFileSync(cronRoutePath, "utf8");
const vercelConfigPath = join(testsDir, "..", "vercel.json");
const vercelConfigSource = readFileSync(vercelConfigPath, "utf8");
const migrateWorkflowPath = join(
  testsDir,
  "..",
  ".github",
  "workflows",
  "supabase-production-migrate.yml",
);
const migrateWorkflowSource = readFileSync(migrateWorkflowPath, "utf8");

const WORKSPACE_A = "550e8400-e29b-41d4-a716-446655440000";
const WORKSPACE_B = "770e8400-e29b-41d4-a716-446655440000";

describe("Social Publishing Cron Worker Safety, Feature Flag & Concurrency Tests", () => {
  test("social publishing cron route checks authorization secret, feature flag, vercel schedule, and removes non-atomic fallback", () => {
    assert.match(cronRouteSource, /import "server-only";/);
    assert.match(cronRouteSource, /CRON_SECRET/);
    assert.match(cronRouteSource, /SOCIAL_PUBLISHING_ENABLED/);
    assert.match(cronRouteSource, /claim_due_social_posts/);
    assert.match(cronRouteSource, /social_publishing_queue/);
    assert.match(cronRouteSource, /social_posts/);
    assert.match(cronRouteSource, /status:\s*"completed"/);
    assert.match(cronRouteSource, /published_at/);

    // Ensure non-atomic pending fallback query is completely removed
    assert.doesNotMatch(
      cronRouteSource,
      /\.from\("social_publishing_queue"\)[\s\S]*?\.select\("\*,\s*social_posts\(\*\)"\)/,
      "Cron worker must not contain a non-atomic SELECT fallback on social_publishing_queue",
    );

    // Ensure vercel.json preserves sales-automation and includes social-publishing on a plan-compatible schedule
    const vercelConfig = JSON.parse(vercelConfigSource) as {
      crons: Array<{ path: string; schedule: string }>;
    };
    assert.ok(
      vercelConfig.crons.some(
        (c) => c.path === "/api/cron/sales-automation" && c.schedule === "0 5 * * *",
      ),
      "vercel.json must preserve /api/cron/sales-automation",
    );
    assert.ok(
      vercelConfig.crons.some(
        (c) => c.path === "/api/cron/social-publishing" && c.schedule === "0 6 * * *",
      ),
      "vercel.json must include /api/cron/social-publishing on a daily plan-compatible schedule",
    );

    // Ensure Supabase migration workflow includes 0054, 0055, and 0060 and verifies RLS & claim_due_social_posts
    assert.match(migrateWorkflowSource, /0054_email_crm_activities\.sql/);
    assert.match(migrateWorkflowSource, /0055_social_media_publishing\.sql/);
    assert.match(migrateWorkflowSource, /0060_fix_social_media_tenant\.sql/);
    assert.match(migrateWorkflowSource, /claim_due_social_posts\(integer\)/);
  });

  test("cron GET endpoint rejects unauthorized requests and fails closed when SOCIAL_PUBLISHING_ENABLED=false", async () => {
    const prevSecret = process.env.CRON_SECRET;
    const prevEnabled = process.env.SOCIAL_PUBLISHING_ENABLED;

    try {
      process.env.CRON_SECRET = "test-cron-secret-value";
      process.env.SOCIAL_PUBLISHING_ENABLED = "false";

      // 1. Missing Authorization header -> 401
      const unauthReq = new NextRequest("http://localhost:3000/api/cron/social-publishing");
      const unauthRes = await GET(unauthReq);
      assert.equal(unauthRes.status, 401);

      // 2. Wrong Authorization header -> 401
      const wrongReq = new NextRequest("http://localhost:3000/api/cron/social-publishing", {
        headers: { authorization: "Bearer wrong-secret" },
      });
      const wrongRes = await GET(wrongReq);
      assert.equal(wrongRes.status, 401);

      // 3. Valid Authorization header with SOCIAL_PUBLISHING_ENABLED=false -> 503 fail-closed
      const validReq = new NextRequest("http://localhost:3000/api/cron/social-publishing", {
        headers: { authorization: "Bearer test-cron-secret-value" },
      });
      const disabledRes = await GET(validReq);
      assert.equal(disabledRes.status, 503);
      const disabledBody = (await disabledRes.json()) as {
        success: boolean;
        disabled?: boolean;
        processed: number;
      };
      assert.equal(disabledBody.success, false);
      assert.equal(disabledBody.disabled, true);
      assert.equal(disabledBody.processed, 0);

      // 4. Default unset SOCIAL_PUBLISHING_ENABLED also fails closed without touching DB
      delete process.env.SOCIAL_PUBLISHING_ENABLED;
      let dbCalled = false;
      const defaultCycle = await runSocialPublishingWorkerCycle({
        adminClient: {
          rpc: async () => {
            dbCalled = true;
            return { data: [], error: null };
          },
        },
      });
      assert.equal(defaultCycle.status, 503);
      assert.equal(defaultCycle.body.disabled, true);
      assert.equal(dbCalled, false, "Must not query database when publishing is disabled");
    } finally {
      if (prevSecret === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = prevSecret;
      if (prevEnabled === undefined) delete process.env.SOCIAL_PUBLISHING_ENABLED;
      else process.env.SOCIAL_PUBLISHING_ENABLED = prevEnabled;
    }
  });

  test("worker stops immediately and returns 500 without publishing if atomic claim RPC fails", async () => {
    let publishCalls = 0;
    const mockAdmin = {
      rpc: async (fnName: string) => {
        assert.equal(fnName, "claim_due_social_posts");
        return {
          data: null,
          error: { message: "function public.claim_due_social_posts does not exist" },
        };
      },
      from: () => {
        throw new Error("Must not query tables when atomic claim RPC fails");
      },
    };

    const result = await runSocialPublishingWorkerCycle({
      publishingEnabled: true,
      adminClient: mockAdmin,
      publishFn: async () => {
        publishCalls++;
        return { success: true, metaPostId: "should_never_happen" };
      },
    });

    assert.equal(result.status, 500);
    assert.equal(result.body.success, false);
    assert.equal(publishCalls, 0, "Must never publish when atomic queue claim fails");
    assert.match(result.body.error || "", /claim_due_social_posts/);
  });

  test("concurrent cron invocations process each queued publication at most once", async () => {
    type QueueRow = {
      id: string;
      organization_id: string;
      post_id: string;
      platform: string;
      status: string;
      scheduled_for: string;
      attempts: number;
      max_attempts: number;
      published_external_id: string | null;
      last_error: string | null;
    };

    const queueDb: QueueRow[] = [
      {
        id: "queue-1",
        organization_id: WORKSPACE_A,
        post_id: "post-1",
        platform: "facebook",
        status: "pending",
        scheduled_for: new Date(Date.now() - 10_000).toISOString(),
        attempts: 0,
        max_attempts: 3,
        published_external_id: null,
        last_error: null,
      },
      {
        id: "queue-2",
        organization_id: WORKSPACE_A,
        post_id: "post-2",
        platform: "instagram",
        status: "pending",
        scheduled_for: new Date(Date.now() - 5_000).toISOString(),
        attempts: 0,
        max_attempts: 3,
        published_external_id: null,
        last_error: null,
      },
    ];

    const postsDb = [
      {
        id: "post-1",
        organization_id: WORKSPACE_A,
        workspace_id: WORKSPACE_A,
        caption: "Concurrent Post 1",
        media_urls: [],
        hashtags: ["test"],
        status: "scheduled",
        meta_post_id: null as string | null,
      },
      {
        id: "post-2",
        organization_id: WORKSPACE_A,
        workspace_id: WORKSPACE_A,
        caption: "Concurrent Post 2",
        media_urls: ["https://cdn.example.com/image.jpg"],
        hashtags: ["test"],
        status: "scheduled",
        meta_post_id: null as string | null,
      },
    ];

    // Simulate PostgreSQL FOR UPDATE SKIP LOCKED atomic claiming across concurrent workers
    let claimMutex = Promise.resolve();
    const createMockAdmin = () => ({
      rpc: async (fnName: string, args: { batch_size?: number }) => {
        assert.equal(fnName, "claim_due_social_posts");
        const limit = args?.batch_size ?? 1;
        return new Promise<{ data: QueueRow[]; error: null }>((resolve) => {
          claimMutex = claimMutex.then(async () => {
            const claimed: QueueRow[] = [];
            for (const row of queueDb) {
              if (row.status === "pending" && claimed.length < limit) {
                row.status = "processing";
                row.attempts += 1;
                claimed.push({ ...row });
              }
            }
            resolve({ data: claimed, error: null });
          });
        });
      },
      from: (table: string) => ({
        select: () => ({
          in: async (_col: string, ids: string[]) => {
            if (table === "social_posts") {
              return {
                data: postsDb.filter((p) => ids.includes(p.id)),
                error: null,
              };
            }
            return { data: [], error: null };
          },
        }),
        update: (values: Record<string, unknown>) => {
          const filters: Record<string, unknown> = {};
          const chain = {
            eq: (col: string, val: unknown) => {
              filters[col] = val;
              return chain;
            },
            then: (onFulfilled: (v: { error: null }) => unknown) => {
              if (table === "social_publishing_queue") {
                for (const row of queueDb) {
                  const matchesId = !filters.id || row.id === filters.id;
                  const matchesStatus = !filters.status || row.status === filters.status;
                  const matchesOrg = !filters.organization_id || row.organization_id === filters.organization_id;
                  if (matchesId && matchesStatus && matchesOrg) {
                    Object.assign(row, values);
                  }
                }
              } else if (table === "social_posts") {
                for (const post of postsDb) {
                  const matchesId = !filters.id || post.id === filters.id;
                  const matchesOrg = !filters.organization_id || post.organization_id === filters.organization_id;
                  if (matchesId && matchesOrg) {
                    Object.assign(post, values);
                  }
                }
              }
              return Promise.resolve({ error: null }).then(onFulfilled);
            },
          };
          return chain;
        },
      }),
    });

    const publishedPostIds: string[] = [];
    const publishFn = async (post: { id?: string; platform?: string }) => {
      await new Promise((r) => setTimeout(r, 15));
      publishedPostIds.push(`${post.id}:${post.platform}`);
      return {
        success: true,
        metaPostId: `meta_real_${post.id}`,
      };
    };

    // Launch 3 concurrent workers competing for the 2 pending items (with batchSize=1)
    const [w1, w2, w3] = await Promise.all([
      runSocialPublishingWorkerCycle({
        publishingEnabled: true,
        adminClient: createMockAdmin(),
        publishFn,
        batchSize: 1,
        workerRunId: "worker-1",
      }),
      runSocialPublishingWorkerCycle({
        publishingEnabled: true,
        adminClient: createMockAdmin(),
        publishFn,
        batchSize: 1,
        workerRunId: "worker-2",
      }),
      runSocialPublishingWorkerCycle({
        publishingEnabled: true,
        adminClient: createMockAdmin(),
        publishFn,
        batchSize: 1,
        workerRunId: "worker-3",
      }),
    ]);

    assert.equal(w1.status, 200);
    assert.equal(w2.status, 200);
    assert.equal(w3.status, 200);

    const totalProcessed = w1.body.processed + w2.body.processed + w3.body.processed;
    assert.equal(totalProcessed, 2, "Exactly 2 items must be processed across 3 concurrent workers");
    assert.deepEqual(
      publishedPostIds.sort(),
      ["post-1:facebook", "post-2:instagram"],
      "No duplicate publication allowed under concurrent workers",
    );
    assert.ok(queueDb.every((q) => q.status === "completed" && q.published_external_id !== null));
    assert.ok(postsDb.every((p) => p.status === "published" && p.meta_post_id !== null));
  });

  test("worker quarantines crashed or ambiguous external calls as failed and never marks unconfirmed posts published", async () => {
    const queueState: Record<string, { status: string; last_error: string | null; scheduled_for: string }> = {
      "q-crash": { status: "processing", last_error: null, scheduled_for: "2026-04-01T00:00:00Z" },
      "q-empty-id": { status: "processing", last_error: null, scheduled_for: "2026-04-01T00:00:00Z" },
      "q-rate-limit": { status: "processing", last_error: null, scheduled_for: "2026-04-01T00:00:00Z" },
      "q-tenant-mismatch": { status: "processing", last_error: null, scheduled_for: "2026-04-01T00:00:00Z" },
      "q-already-published": { status: "processing", last_error: null, scheduled_for: "2026-04-01T00:00:00Z" },
    };

    const postState: Record<string, { status: string; meta_post_id: string | null }> = {
      "p-crash": { status: "scheduled", meta_post_id: null },
      "p-empty-id": { status: "scheduled", meta_post_id: null },
      "p-rate-limit": { status: "scheduled", meta_post_id: null },
      "p-tenant-mismatch": { status: "scheduled", meta_post_id: null },
      "p-already-published": { status: "scheduled", meta_post_id: "existing_ext_999" },
    };

    const mockAdmin = {
      rpc: async () => ({
        data: [
          {
            id: "q-crash",
            organization_id: WORKSPACE_A,
            post_id: "p-crash",
            platform: "facebook",
            status: "processing",
            attempts: 1,
            max_attempts: 3,
            scheduled_for: "2026-04-01T00:00:00Z",
            published_external_id: null,
          },
          {
            id: "q-empty-id",
            organization_id: WORKSPACE_A,
            post_id: "p-empty-id",
            platform: "facebook",
            status: "processing",
            attempts: 1,
            max_attempts: 3,
            scheduled_for: "2026-04-01T00:00:00Z",
            published_external_id: null,
          },
          {
            id: "q-rate-limit",
            organization_id: WORKSPACE_A,
            post_id: "p-rate-limit",
            platform: "facebook",
            status: "processing",
            attempts: 1,
            max_attempts: 3,
            scheduled_for: "2026-04-01T00:00:00Z",
            published_external_id: null,
          },
          {
            id: "q-tenant-mismatch",
            organization_id: WORKSPACE_A,
            post_id: "p-tenant-mismatch",
            platform: "facebook",
            status: "processing",
            attempts: 1,
            max_attempts: 3,
            scheduled_for: "2026-04-01T00:00:00Z",
            published_external_id: null,
          },
          {
            id: "q-already-published",
            organization_id: WORKSPACE_A,
            post_id: "p-already-published",
            platform: "facebook",
            status: "processing",
            attempts: 1,
            max_attempts: 3,
            scheduled_for: "2026-04-01T00:00:00Z",
            published_external_id: "existing_ext_999",
          },
        ],
        error: null,
      }),
      from: (table: string) => ({
        select: () => ({
          in: async () => ({
            data: [
              { id: "p-crash", organization_id: WORKSPACE_A, caption: "Crash test", status: "scheduled" },
              { id: "p-empty-id", organization_id: WORKSPACE_A, caption: "Empty ID test", status: "scheduled" },
              { id: "p-rate-limit", organization_id: WORKSPACE_A, caption: "Rate limit test", status: "scheduled" },
              { id: "p-tenant-mismatch", organization_id: WORKSPACE_B, caption: "Foreign post", status: "scheduled" },
              { id: "p-already-published", organization_id: WORKSPACE_A, caption: "Done post", status: "scheduled" },
            ],
            error: null,
          }),
        }),
        update: (values: Record<string, unknown>) => {
          let targetId = "";
          const chain = {
            eq: (col: string, val: unknown) => {
              if (col === "id") targetId = String(val);
              return chain;
            },
            then: (onFulfilled: (v: { error: null }) => unknown) => {
              if (table === "social_publishing_queue" && queueState[targetId]) {
                Object.assign(queueState[targetId], values);
              } else if (table === "social_posts" && postState[targetId]) {
                Object.assign(postState[targetId], values);
              }
              return Promise.resolve({ error: null }).then(onFulfilled);
            },
          };
          return chain;
        },
      }),
    };

    let alreadyPublishedApiCalled = false;
    const res = await runSocialPublishingWorkerCycle({
      publishingEnabled: true,
      adminClient: mockAdmin,
      workerRunId: "worker-safety-test",
      publishFn: async (post) => {
        if (post.id === "p-already-published") {
          alreadyPublishedApiCalled = true;
        }
        if (post.id === "p-crash") {
          throw new Error("Socket hang up after request sent");
        }
        if (post.id === "p-empty-id") {
          return { success: true, metaPostId: "   " };
        }
        if (post.id === "p-rate-limit") {
          return {
            success: false,
            errorCode: "rate_limited",
            errorMessage: "Rate limit reached",
            retryable: true,
            retryAfterMs: 120_000,
          };
        }
        return { success: false, errorMessage: "Blocked" };
      },
    });

    assert.equal(res.status, 200);
    assert.equal(alreadyPublishedApiCalled, false, "Already-published item must not call external API");
    assert.equal(queueState["q-already-published"].status, "completed");

    // Crashed call is quarantined to 'failed' (NOT 'pending') so it will not blindly duplicate
    assert.equal(queueState["q-crash"].status, "failed");
    assert.match(queueState["q-crash"].last_error || "", /quarantined/);
    assert.equal(postState["p-crash"].status, "failed");

    // Empty external ID is rejected, never marked published
    assert.equal(queueState["q-empty-id"].status, "failed");
    assert.equal(postState["p-empty-id"].status, "failed");

    // Rate limit is safely returned to 'pending' with future backoff
    assert.equal(queueState["q-rate-limit"].status, "pending");
    assert.ok(new Date(queueState["q-rate-limit"].scheduled_for).getTime() > Date.now() + 60_000);

    // Tenant mismatch is rejected and marked 'failed'
    assert.equal(queueState["q-tenant-mismatch"].status, "failed");
    assert.match(queueState["q-tenant-mismatch"].last_error || "", /Tenant ownership mismatch/);
  });
});
