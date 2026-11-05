import test from "node:test";
import assert from "node:assert/strict";

import {
  FIRST_AI_VALUE_ABANDONMENT_HOURS,
  FIRST_LEAD_ABANDONMENT_HOURS,
  assessOnboardingAbandonment,
  computeActivationMetrics,
  formatActivationDuration,
  type ActivationTimestamps,
} from "@/server/services/activation-analytics-domain";

const WORKSPACE_CREATED_AT = "2026-01-01T00:00:00.000Z";

function addHours(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 3_600_000).toISOString();
}

function baseTimestamps(overrides: Partial<ActivationTimestamps> = {}): ActivationTimestamps {
  return {
    workspaceCreatedAt: WORKSPACE_CREATED_AT,
    firstLeadCreatedAt: null,
    firstImportCompletedAt: null,
    firstAiRunCompletedAt: null,
    ...overrides,
  };
}

test("computeActivationMetrics: unreached milestones have null hoursToReach", () => {
  const metrics = computeActivationMetrics(baseTimestamps());
  assert.equal(metrics.firstLead.reached, false);
  assert.equal(metrics.firstLead.hoursToReach, null);
  assert.equal(metrics.firstImport.reached, false);
  assert.equal(metrics.firstAiRun.reached, false);
});

test("computeActivationMetrics: all steps completed quickly compute correct durations", () => {
  const timestamps = baseTimestamps({
    firstLeadCreatedAt: addHours(WORKSPACE_CREATED_AT, 1),
    firstImportCompletedAt: addHours(WORKSPACE_CREATED_AT, 2),
    firstAiRunCompletedAt: addHours(WORKSPACE_CREATED_AT, 3),
  });
  const metrics = computeActivationMetrics(timestamps);
  assert.equal(metrics.firstLead.reached, true);
  assert.equal(metrics.firstLead.hoursToReach, 1);
  assert.equal(metrics.firstImport.hoursToReach, 2);
  assert.equal(metrics.firstAiRun.hoursToReach, 3);
});

test("computeActivationMetrics: clamps negative duration from clock skew to zero", () => {
  const timestamps = baseTimestamps({ firstLeadCreatedAt: addHours(WORKSPACE_CREATED_AT, -0.5) });
  const metrics = computeActivationMetrics(timestamps);
  assert.equal(metrics.firstLead.hoursToReach, 0);
});

test("assessOnboardingAbandonment: no activity at all, still within both windows -> pending, not abandoned", () => {
  const now = addHours(WORKSPACE_CREATED_AT, 1);
  const result = assessOnboardingAbandonment(baseTimestamps(), now);
  assert.equal(result.firstLeadStatus, "pending");
  assert.equal(result.firstAiRunStatus, "pending");
  assert.equal(result.isAbandoned, false);
  assert.deepEqual(result.abandonedReasons, []);
});

test("assessOnboardingAbandonment: no activity at all, past both windows -> abandoned with both reasons", () => {
  const now = addHours(WORKSPACE_CREATED_AT, FIRST_AI_VALUE_ABANDONMENT_HOURS + 1);
  const result = assessOnboardingAbandonment(baseTimestamps(), now);
  assert.equal(result.firstLeadStatus, "abandoned");
  assert.equal(result.firstAiRunStatus, "abandoned");
  assert.equal(result.isAbandoned, true);
  assert.deepEqual(result.abandonedReasons, ["no_lead_created_within_24h", "no_ai_run_completed_within_72h"]);
});

test("assessOnboardingAbandonment: exactly at the first-lead threshold is still pending (inclusive boundary)", () => {
  const now = addHours(WORKSPACE_CREATED_AT, FIRST_LEAD_ABANDONMENT_HOURS);
  const result = assessOnboardingAbandonment(baseTimestamps(), now);
  assert.equal(result.firstLeadStatus, "pending");
});

test("assessOnboardingAbandonment: one millisecond past the first-lead threshold is abandoned", () => {
  const now = new Date(new Date(WORKSPACE_CREATED_AT).getTime() + FIRST_LEAD_ABANDONMENT_HOURS * 3_600_000 + 1).toISOString();
  const result = assessOnboardingAbandonment(baseTimestamps(), now);
  assert.equal(result.firstLeadStatus, "abandoned");
});

test("assessOnboardingAbandonment: exactly at the AI-value threshold is still pending (inclusive boundary)", () => {
  const now = addHours(WORKSPACE_CREATED_AT, FIRST_AI_VALUE_ABANDONMENT_HOURS);
  const result = assessOnboardingAbandonment(baseTimestamps(), now);
  assert.equal(result.firstAiRunStatus, "pending");
});

test("assessOnboardingAbandonment: lead created but no AI run yet, past the AI window -> only AI reason", () => {
  const now = addHours(WORKSPACE_CREATED_AT, FIRST_AI_VALUE_ABANDONMENT_HOURS + 1);
  const timestamps = baseTimestamps({ firstLeadCreatedAt: addHours(WORKSPACE_CREATED_AT, 2) });
  const result = assessOnboardingAbandonment(timestamps, now);
  assert.equal(result.firstLeadStatus, "completed");
  assert.equal(result.firstAiRunStatus, "abandoned");
  assert.deepEqual(result.abandonedReasons, ["no_ai_run_completed_within_72h"]);
});

test("assessOnboardingAbandonment: all steps completed quickly -> never abandoned even long after", () => {
  const timestamps = baseTimestamps({
    firstLeadCreatedAt: addHours(WORKSPACE_CREATED_AT, 1),
    firstAiRunCompletedAt: addHours(WORKSPACE_CREATED_AT, 4),
  });
  const now = addHours(WORKSPACE_CREATED_AT, 500);
  const result = assessOnboardingAbandonment(timestamps, now);
  assert.equal(result.firstLeadStatus, "completed");
  assert.equal(result.firstAiRunStatus, "completed");
  assert.equal(result.isAbandoned, false);
});

test("assessOnboardingAbandonment: defaults `now` to the current time when omitted", () => {
  const recentlyCreated = new Date().toISOString();
  const result = assessOnboardingAbandonment(baseTimestamps({ workspaceCreatedAt: recentlyCreated }));
  assert.equal(result.firstLeadStatus, "pending");
  assert.ok(result.hoursSinceWorkspaceCreated >= 0);
});

test("formatActivationDuration: null renders as an em dash", () => {
  assert.equal(formatActivationDuration(null), "—");
});

test("formatActivationDuration: sub-48h durations render in hours", () => {
  assert.equal(formatActivationDuration(3.5), "3.5h");
});

test("formatActivationDuration: 48h and above render in days", () => {
  assert.equal(formatActivationDuration(48), "2.0d");
  assert.equal(formatActivationDuration(72), "3.0d");
});
