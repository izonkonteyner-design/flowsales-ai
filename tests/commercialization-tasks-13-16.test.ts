import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { estimateAiCostUsd, usagePercent } from "../server/services/commercial-ai-usage";

const migration = new URL("../supabase/migrations/0021_usage_notifications_account_lifecycle.sql", import.meta.url);

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("AI cost estimate is deterministic and usage percent is bounded", () => {
  assert.equal(estimateAiCostUsd({ inputTokens: 1_000_000, outputTokens: 500_000, inputUsdPerMillion: 1, outputUsdPerMillion: 2 }), 2);
  assert.equal(usagePercent(250, 100), 100);
  assert.equal(usagePercent(25, 100), 25);
});

test("usage and notification writes are service-role isolated", async () => {
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /auth\.role\(\) <> 'service_role'/i);
  assert.match(sql, /record_ai_usage/i);
  assert.match(sql, /create_user_notification/i);
  assert.match(sql, /notification recipient is not a workspace member/i);
});

test("notification actions scope updates to authenticated user", async () => {
  const code = await source("app/notifications/actions.ts");
  assert.match(code, /auth\.getUser\(\)/);
  assert.match(code, /\.eq\("user_id", auth\.user\.id\)/);
});

test("pricing and upgrade flows disclose provider configuration boundary", async () => {
  const pricing = await source("app/pricing/page.tsx");
  const upgrade = await source("app/upgrade/page.tsx");
  assert.match(pricing, /production billing provider/i);
  assert.match(upgrade, /owner.*admin|owner", "admin/i);
  assert.match(upgrade, /Live checkout remains disabled/i);
});

test("account lifecycle is auditable and demo-safe", async () => {
  const sql = await readFile(migration, "utf8");
  const action = await source("app/account/data/actions.ts");
  assert.match(sql, /account_lifecycle_requests/i);
  assert.match(sql, /not public\.is_demo_organization/i);
  assert.match(action, /delete_workspace/);
  assert.match(action, /is_demo_organization/);
});
