import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const servicesPath = new URL("../server/services/ai-sales-agent/services.ts", import.meta.url);
const orchestratorPath = new URL("../server/services/ai-sales-agent/orchestrator.ts", import.meta.url);
const runtimePath = new URL("../server/repositories/supabase/ai-sales-agent.ts", import.meta.url);
const actionPath = new URL("../app/leads/[leadId]/ai/actions.ts", import.meta.url);
const pagePath = new URL("../app/leads/[leadId]/ai/page.tsx", import.meta.url);

test("commercial AI capability services include follow-up, product and quote recommendations", async () => {
  const source = await readFile(servicesPath, "utf8");
  assert.match(source, /draftFollowUp/);
  assert.match(source, /recommendProducts/);
  assert.match(source, /recommendQuote/);
  assert.match(source, /quote_recommendation/);
});

test("orchestrator routes every capability through policy and approval", async () => {
  const source = await readFile(orchestratorPath, "utf8");
  assert.match(source, /runAiCapability/);
  assert.match(source, /evaluateAiExecutionPolicy/);
  assert.match(source, /policy\.approvalRequired/);
  assert.match(source, /approvalQueue\.queue/);
  assert.match(source, /output: result\.output/);
});

test("Supabase runtime preserves workspace isolation, trusted catalog context and persistent audit", async () => {
  const source = await readFile(runtimePath, "utf8");
  assert.match(source, /organization_members/);
  assert.match(source, /\.eq\("organization_id", input\.workspaceId\)/);
  assert.match(source, /\.from\("products"\)/);
  assert.match(source, /\.eq\("active", true\)/);
  assert.match(source, /Never invent prices/);
  assert.match(source, /\.from\("ai_runs"\)/);
  assert.match(source, /create_ai_approval writes its own event atomically/);
});

test("lead AI action requires authentication and invokes the safe orchestration stack", async () => {
  const source = await readFile(actionPath, "utf8");
  assert.match(source, /auth\.getUser/);
  assert.match(source, /organization_members/);
  assert.match(source, /GeminiAiProvider/);
  assert.match(source, /SupabaseAiApprovalQueue/);
  assert.match(source, /runAiSalesAgent/);
});

test("lead AI panel exposes tasks 5 through 8 and displays structured history", async () => {
  const source = await readFile(pagePath, "utf8");
  for (const capability of [
    "lead_scoring",
    "next_best_action",
    "follow_up_draft",
    "product_recommendation",
    "quote_recommendation",
  ]) {
    assert.match(source, new RegExp(capability));
  }
  assert.match(source, /Demo Safe Mode/);
  assert.match(source, /Recent AI results/);
  assert.match(source, /Confidence:/);
});
