import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL("../supabase/migrations/0018_ai_commercial_foundation.sql", import.meta.url);
const alignmentPath = new URL("../supabase/migrations/0019_ai_approval_payload_alignment.sql", import.meta.url);

test("AI commercial tables enable RLS and scope reads by organization membership", async () => {
  const sql = await readFile(migrationPath, "utf8");
  for (const table of [
    "ai_runs",
    "ai_approval_requests",
    "ai_approval_events",
    "organization_entitlements",
    "ai_usage_monthly",
    "notifications",
  ]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(sql, /public\.is_org_member\(organization_id\)/i);
  assert.match(sql, /public\.can_review_ai_approvals\(organization_id\)/i);
});

test("approval decisions enforce authorization, demo safety, expiry and version checks", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /not public\.can_review_ai_approvals/i);
  assert.match(sql, /public\.is_demo_organization/i);
  assert.match(sql, /v_row\.version <> p_expected_version/i);
  assert.match(sql, /v_row\.expires_at <= now\(\)/i);
  assert.match(sql, /where id = p_approval_id for update/i);
});

test("approval creation persists the complete structured payload atomically", async () => {
  const sql = await readFile(alignmentPath, "utf8");
  for (const field of ["actions", "evidence", "money", "reasons", "provider", "model"]) {
    assert.match(sql, new RegExp(field, "i"));
  }
  assert.match(sql, /insert into public\.ai_approval_events/i);
  assert.match(sql, /public\.is_demo_organization/i);
  assert.match(sql, /on conflict \(run_id\)/i);
});
