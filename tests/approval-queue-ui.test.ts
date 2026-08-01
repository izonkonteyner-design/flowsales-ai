import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pagePath = new URL("../app/approvals/page.tsx", import.meta.url);
const actionsPath = new URL("../app/approvals/actions.ts", import.meta.url);
const adapterPath = new URL("../server/repositories/supabase/ai-approvals.ts", import.meta.url);

test("approval queue resolves the authenticated user and workspace before listing", async () => {
  const source = await readFile(pagePath, "utf8");
  assert.match(source, /client\.auth\.getUser\(\)/);
  assert.match(source, /from\("organization_members"\)/);
  assert.match(source, /listPendingAiApprovals/);
  assert.match(source, /Reviewer permission required/);
});

test("approval actions validate immutable identifiers and optimistic version", async () => {
  const source = await readFile(actionsPath, "utf8");
  assert.match(source, /workspaceId: z\.string\(\)\.uuid\(\)/);
  assert.match(source, /approvalId: z\.string\(\)\.uuid\(\)/);
  assert.match(source, /expectedVersion: z\.coerce\.number\(\)\.int\(\)\.positive\(\)/);
  assert.match(source, /client\.auth\.getUser\(\)/);
  assert.match(source, /decideAiApproval/);
  assert.match(source, /revalidatePath\("\/approvals"\)/);
});

test("demo UI disables approval and database authorization remains authoritative", async () => {
  const source = await readFile(pagePath, "utf8");
  assert.match(source, /disabled=\{isDemo\}/);
  assert.match(source, /Demo workspace is read-only/);
});

test("atomic RPC audit events are not inserted a second time by the adapter", async () => {
  const source = await readFile(adapterPath, "utf8");
  assert.match(source, /create_ai_approval and decide_ai_approval persist/);
  assert.match(source, /if \(!\["cancelled", "expired"\]\.includes\(event\.event\)\)/);
});
