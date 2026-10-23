import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const req = createRequire(import.meta.url);
const serverOnlyPath = req.resolve("server-only");
req.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as NodeModule;

const { runSocialPublishingWorkerCycle } = req(
  "../app/api/cron/social-publishing/route",
) as typeof import("@/app/api/cron/social-publishing/route");

const testsDir = dirname(fileURLToPath(import.meta.url));
const cronRoutePath = join(testsDir, "..", "app", "api", "cron", "social-publishing", "route.ts");
const cronRouteSource = readFileSync(cronRoutePath, "utf8");

const WORKSPACE_A = "550e8400-e29b-41d4-a716-446655440000";
const WORKSPACE_B = "770e8400-e29b-41d4-a716-446655440000";

describe("Social Publishing Cron Worker Safety & Concurrency Tests", () => {
  test("social publishing cron route checks authorization secret, updates post status, and removes non-atomic fallback", () => {
    assert.match(cronRouteSource, /import "server-only";/);
    assert.match(cronRouteSource, /CRON_SECRET/);
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
        adminClient: createMockAdmin(),
        publishFn,
        batchSize: 1,
        workerRunId: "worker-1",
      }),
      runSocialPublishingWorkerCycle({
        adminClient: createMockAdmin(),
        publishFn,
        batchSize: 1,
        workerRunId: "worker-2",
      }),
      runSocialPublishingWorkerCycle({
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
