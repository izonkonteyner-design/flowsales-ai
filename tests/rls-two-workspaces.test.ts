import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("RLS runner requires two workspaces and all commercial roles", async () => {
  const script = await source("scripts/verify-rls-two-workspaces.mjs");
  assert.match(script, /owner/);
  assert.match(script, /admin/);
  assert.match(script, /manager/);
  assert.match(script, /sales_rep/);
  assert.match(script, /viewer/);
  assert.match(script, /at least two independent workspaces/i);
});

test("RLS runner validates permission matrix and negative cross-workspace reads", async () => {
  const script = await source("scripts/verify-rls-two-workspaces.mjs");
  for (const permission of [
    "manage_members",
    "manage_billing",
    "manage_workspace",
    "review_ai",
    "manage_pipeline",
    "run_ai",
    "import_data",
    "edit_crm",
    "view_crm",
  ]) {
    assert.match(script, new RegExp(permission));
  }
  for (const table of ["ai_runs", "ai_approval_requests", "import_jobs", "notifications"]) {
    assert.match(script, new RegExp(table));
  }
  assert.match(script, /Cross-workspace data exposure detected/);
});

test("RLS runner tests own and foreign writes and cleans fixtures with service role", async () => {
  const script = await source("scripts/verify-rls-two-workspaces.mjs");
  assert.match(script, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(script, /Cross-workspace import write unexpectedly succeeded/);
  assert.match(script, /Viewer import write unexpectedly succeeded/);
  assert.match(script, /admin\.from\("import_jobs"\)\.delete/);
});

test("RLS verification is exposed as an explicit package command", async () => {
  const pkg = JSON.parse(await source("package.json"));
  assert.equal(pkg.scripts["verify:rls"], "node scripts/verify-rls-two-workspaces.mjs");
});
