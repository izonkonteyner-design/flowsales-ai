import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { aiQualityDashboardSchema, formatQualityRate } from "@/server/services/ai-quality-dashboard";

const migration = new URL("../supabase/migrations/0025_ai_quality_dashboard.sql", import.meta.url);
async function source(path: string) { return readFile(new URL(`../${path}`, import.meta.url), "utf8"); }

test("AI quality response parser fails closed", () => {
  const parsed = aiQualityDashboardSchema.parse({
    generatedAt: "2026-07-25T12:00:00.000Z",
    summary: {
      windowDays: 30,
      completedRuns: 2,
      failedRuns: 0,
      feedbackCount: 1,
      helpfulCount: 1,
      notHelpfulCount: 0,
      feedbackCoverage: 0.5,
      helpfulRate: 1,
    },
    segments: [],
    evaluations: [],
    risks: [],
  });
  assert.equal(parsed.summary.completedRuns, 2);
  assert.equal(formatQualityRate(parsed.summary.feedbackCoverage), "50%");
  assert.equal(formatQualityRate(null), "No data");
  assert.throws(() => aiQualityDashboardSchema.parse({ generatedAt: "bad", summary: {}, segments: [], evaluations: [], risks: [] }));
});

test("AI quality migration remains registered while app readiness advances to 0047", async () => {
  const sql = await readFile(migration, "utf8");
  const readiness = await source("server/services/deployment-readiness.ts");
  assert.match(sql, /values \('0025', 'ai_quality_dashboard'\)/i);
  assert.match(sql, /v_required_version constant text := '0025'/i);
  assert.match(sql, /get_ai_quality_dashboard/i);
  assert.match(readiness, /REQUIRED_DEPLOYMENT_MIGRATION = "0047"/);
});
