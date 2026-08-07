import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  aiQualityDashboardSchema,
  formatQualityRate,
} from "../server/services/ai-quality-dashboard";

const migration = new URL("../supabase/migrations/0025_ai_quality_dashboard.sql", import.meta.url);
async function source(path: string) { return readFile(new URL(`../${path}`, import.meta.url), "utf8"); }

test("AI quality RPC enforces owner admin membership inside the database", async () => {
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /security definer/i);
  assert.match(sql, /m\.role in \('owner', 'admin'\)/i);
  assert.match(sql, /m\.user_id = auth\.uid\(\)/i);
  assert.match(sql, /raise exception 'Owner or admin role required'/i);
  assert.match(sql, /revoke all on function public\.get_ai_quality_dashboard/i);
  assert.match(sql, /grant execute on function public\.get_ai_quality_dashboard.*authenticated/i);
});

test("AI quality RPC aggregates feedback, versions, models and evaluation evidence", async () => {
  const sql = await readFile(migration, "utf8");
  for (const contract of ["ai_run_feedback", "ai_evaluation_runs", "prompt_version", "helpful_rate", "feedback_coverage", "latest_evaluation_failed"]) {
    assert.match(sql, new RegExp(contract, "i"));
  }
  assert.match(sql, /greatest\(1, least\(coalesce\(p_days, 30\), 365\)\)/i);
  assert.match(sql, /limit 20/i);
});

test("AI quality dashboard is owner admin only and uses the bounded RPC", async () => {
  const page = await source("app/operations/ai-quality/page.tsx");
  assert.match(page, /\["owner", "admin"\]/);
  assert.match(page, /get_ai_quality_dashboard/);
  assert.match(page, /\[7, 30, 90\]/);
  assert.match(page, /Prompt and model segments/);
  assert.match(page, /Regression evaluation history/);
  assert.doesNotMatch(page, /service_role/i);
});

test("AI quality response parser fails closed", () => {
  const parsed = aiQualityDashboardSchema.parse({
    generatedAt: "2026-08-02T12:00:00.000Z",
    summary: {
      windowDays: 30,
      completedRuns: 10,
      failedRuns: 1,
      feedbackCount: 5,
      helpfulCount: 4,
      notHelpfulCount: 1,
      feedbackCoverage: 0.5,
      helpfulRate: 0.8,
    },
    segments: [{
      capability: "lead_scoring",
      prompt_version: "2026-08-01.1",
      model: "gemini-test",
      completed_runs: 10,
      failed_runs: 1,
      feedback_count: 5,
      helpful_count: 4,
      not_helpful_count: 1,
      helpful_rate: 0.8,
      latest_run_at: "2026-08-02T11:00:00.000Z",
    }],
    evaluations: [{
      id: "11111111-1111-4111-8111-111111111111",
      suite_key: "ai-regression",
      prompt_version: "2026-08-01.1",
      model: "gemini-test",
      total_cases: 4,
      passed_cases: 4,
      score: 1,
      status: "passed",
      commit_sha: "abc123",
      created_at: "2026-08-02T10:00:00.000Z",
    }],
    risks: [],
  });
  assert.equal(parsed.summary.helpfulRate, 0.8);
  assert.equal(formatQualityRate(parsed.summary.feedbackCoverage), "50%");
  assert.equal(formatQualityRate(null), "No data");
  assert.throws(() => aiQualityDashboardSchema.parse({ generatedAt: "bad", summary: {}, segments: [], evaluations: [], risks: [] }));
});

test("AI quality migration remains registered while deployment readiness advances to 0040", async () => {
  const sql = await readFile(migration, "utf8");
  const readiness = await source("server/services/deployment-readiness.ts");
  assert.match(sql, /values \('0025', 'ai_quality_dashboard'\)/i);
  assert.match(sql, /v_required_version constant text := '0025'/i);
  assert.match(sql, /get_ai_quality_dashboard/i);
  assert.match(readiness, /REQUIRED_DEPLOYMENT_MIGRATION = "0040"/);
});
