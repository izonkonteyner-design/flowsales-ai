import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { evaluateAiCase, summarizeAiEvaluation } from "../server/services/ai-sales-agent/evaluation";
import { AI_OUTPUT_SCHEMA_VERSION, AI_PROMPT_VERSION, buildCapabilityPrompt } from "../server/services/ai-sales-agent/prompts";

const migration = new URL("../supabase/migrations/0024_ai_feedback_prompt_evaluations.sql", import.meta.url);

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("prompt builder exposes immutable prompt and output schema versions", () => {
  const prompt = buildCapabilityPrompt("lead_scoring", {
    workspaceId: "00000000-0000-4000-8000-000000000001",
    actorId: "00000000-0000-4000-8000-000000000002",
    lead: {
      id: "lead-1",
      name: "Test Lead",
      status: "new",
      source: null,
      assignedTo: null,
      estimatedValue: null,
      currency: null,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
    },
    activities: [],
    products: [],
    workspaceRules: [],
    isDemoWorkspace: false,
    generatedAt: "2026-08-01T00:00:00.000Z",
  });
  assert.equal(prompt.promptVersion, AI_PROMPT_VERSION);
  assert.equal(prompt.outputSchemaVersion, AI_OUTPUT_SCHEMA_VERSION);
  assert.match(prompt.systemPrompt, new RegExp(AI_PROMPT_VERSION.replaceAll(".", "\\.")));
});

test("migration stores workspace-scoped feedback and service-only evaluation evidence", async () => {
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /add column if not exists prompt_version/i);
  assert.match(sql, /create table if not exists public\.ai_run_feedback/i);
  assert.match(sql, /unique \(run_id, user_id\)/i);
  assert.match(sql, /r\.status = 'completed'/i);
  assert.match(sql, /create table if not exists public\.ai_evaluation_runs/i);
  assert.match(sql, /grant all on table public\.ai_evaluation_runs to service_role/i);
  assert.match(sql, /'0024', 'ai_feedback_prompt_evaluations'/i);
});

test("feedback action verifies authentication workspace completion and demo safety", async () => {
  const action = await source("app/ai-history/actions.ts");
  assert.match(action, /auth\.getUser\(\)/);
  assert.match(action, /\.eq\("status", "completed"\)/);
  assert.match(action, /organization_members/);
  assert.match(action, /is_demo_organization/);
  assert.match(action, /onConflict: "run_id,user_id"/);
});

test("AI history displays version metadata and feedback controls", async () => {
  const page = await source("app/ai-history/page.tsx");
  assert.match(page, /Prompt version/);
  assert.match(page, /Output schema/);
  assert.match(page, /submitAiFeedbackAction/);
  assert.match(page, /Helpful/);
  assert.match(page, /Not helpful/);
});

test("baseline evaluator passes safe informational and blocked demo cases", () => {
  const informational = evaluateAiCase({
    key: "safe",
    isDemoWorkspace: false,
    output: {
      version: "1",
      capability: "lead_scoring",
      summary: "Review known lead data.",
      confidence: 0.7,
      riskLevel: "low",
      decision: "informational",
      actions: [{ kind: "review_lead", title: "Review", rationale: "Confirm data." }],
      evidence: [{ type: "lead", id: "lead-1", label: "Lead" }],
      money: [], warnings: [],
    },
    expected: { validSchema: true, decision: "informational", approvalRequired: false, requiredEvidenceTypes: ["lead"] },
  });
  const summary = summarizeAiEvaluation([informational]);
  assert.equal(informational.passed, true);
  assert.equal(summary.status, "passed");
  assert.equal(summary.score, 1);
});

test("CI runs and preserves AI evaluation evidence", async () => {
  const workflow = await source(".github/workflows/ci.yml");
  const pkg = JSON.parse(await source("package.json")) as { scripts: Record<string, string> };
  assert.equal(pkg.scripts["eval:ai"], "tsx scripts/evaluate-ai-fixtures.ts");
  assert.match(workflow, /AI regression evaluation/);
  assert.match(workflow, /ai-evaluation-report/);
});
