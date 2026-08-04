import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repositoryPath = new URL("../server/repositories/supabase/ai-history.ts", import.meta.url);
const pagePath = new URL("../app/ai-history/page.tsx", import.meta.url);

test("AI history repository scopes run and approval-event reads to the active workspace", async () => {
  const source = await readFile(repositoryPath, "utf8");
  assert.match(source, /\.eq\("organization_id", filter\.workspaceId\)/);
  assert.match(source, /from\("ai_runs"\)/);
  assert.match(source, /from\("ai_approval_events"\)/);
  assert.match(source, /Math\.min\(Math\.max\(filter\.limit \?\? 50, 1\), 100\)/);
});

test("AI history page requires authentication and resolves workspace membership", async () => {
  const source = await readFile(pagePath, "utf8");
  assert.match(source, /client\.auth\.getUser\(\)/);
  assert.match(source, /from\("organization_members"\)/);
  assert.match(source, /redirect\("\/login"\)/);
  assert.match(source, /redirect\("\/onboarding"\)/);
});

test("AI history UI exposes capability, status and lead filters without accepting arbitrary enum values", async () => {
  const source = await readFile(pagePath, "utf8");
  assert.match(source, /CAPABILITIES\.includes/);
  assert.match(source, /STATUSES\.includes/);
  assert.match(source, /name="leadId"/);
  assert.match(source, /AI History & Timeline/);
});
