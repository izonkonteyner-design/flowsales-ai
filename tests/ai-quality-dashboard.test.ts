import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { aiQualityDashboardSchema, formatQualityRate } from "@/lib/validations/ai-quality";

const migration = new URL("../supabase/migrations/0025_ai_quality_dashboard.sql", import.meta.url);
async function source(path: string) { return readFile(new URL(`../${path}`, import.meta.url), "utf8"); }

test("AI quality response parser fails closed", () => {
  const parsed = aiQualityDashboardSchema.parse({
    generatedAt: "2026-07-25T12:00:00.000Z",
    summary: {
      totalRuns: 2,
      feedbackCount: 1,
      positiveFeedback: 1,
      negativeFeedback: 0,
      feedbackCoverage: 0.5,
      positiveRate: 1,
      averageLatencyMs: 100,
      errorRate: 0,
      approvalRate: 0.5,
    },
    segments: [],
    evaluations: [],
    risks: [],
  });
  assert.equal(parsed.summary.totalRuns, 2);
  assert.equal(formatQualityRate(parsed.summary.feedbackCoverage), "50%");
  assert.equal(formatQualityRate(null), "No data");
  assert.throws(() => aiQualityDashboardSchema.parse({ generatedAt: "bad", summary: {}, segments: [], evaluations: [], risks: [] }));
});

test("AI quality migration remains registered while deployment readiness advances to 0042", async () => {
  const sql = await readFile(migration, "utf8");
  const readiness = await source("server/services/deployment-readiness.ts");
  assert.match(sql, /values \('0025', 'ai_quality_dashboard'\)/i);
  assert.match(sql, /v_required_version constant text := '0025'/i);
  assert.match(sql, /get_ai_quality_dashboard/i);
  assert.match(readiness, /REQUIRED_DEPLOYMENT_MIGRATION = "0042"/);
});
