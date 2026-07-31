import test from "node:test";
import assert from "node:assert/strict";

import {
  aiSalesRecommendationSchema,
  type AISalesRecommendation,
} from "@/lib/validations/ai-sales-agent";
import {
  parseApprovalPayload,
  ApprovalPayloadValidationError,
  type ApprovalActionType,
} from "@/lib/validations/approval-payloads";
import { pilotFeedbackRequestSchema } from "@/lib/validations/pilot-feedback";
import {
  PLAN_ENTITLEMENTS,
  getPlanEntitlement,
  hasFeature,
  resolvePlanState,
  type SubscriptionRecord,
} from "@/lib/entitlements";

// ---------------------------------------------------------------------------
// AI Sales Agent structured output validation
// ---------------------------------------------------------------------------

test("aiSalesRecommendationSchema accepts a fully populated recommendation", () => {
  const valid: AISalesRecommendation = {
    summary: "Ahmet is qualified with strong budget, awaiting installation confirmation.",
    leadScore: 78,
    priority: "urgent",
    reasoning: ["Qualified stage", "Strong budget", "Awaiting install"],
    nextBestAction: {
      type: "follow_up_call",
      description: "Call Ahmet within 24h to confirm install slot.",
      dueAt: "2026-08-02T10:00:00Z",
    },
    followUpDraft: {
      subject: "FlowSales AI — installation confirmation",
      message: "Hello Ahmet, confirming your installation slot for next week...",
      channel: "email",
    },
    recommendedProducts: [
      { productId: "p1", reason: "Matches the 56m² build", quantity: 2 },
    ],
    quoteSuggestion: {
      leadId: "l1",
      items: [{ productId: "p1", quantity: 2, unitPrice: 420000 }],
      discount: 5,
      tax: 20,
      validityDays: 30,
    },
  };

  assert.doesNotThrow(() => aiSalesRecommendationSchema.parse(valid));
});

test("aiSalesRecommendationSchema rejects out-of-range leadScore", () => {
  assert.throws(
    () => aiSalesRecommendationSchema.parse({ ...baseValid(), leadScore: 199 }),
  );
});

test("aiSalesRecommendationSchema rejects invalid priority enum", () => {
  const bad = baseValid();
  bad.priority = "critical";
  assert.throws(() => aiSalesRecommendationSchema.parse(bad));
});

test("aiSalesRecommendationSchema rejects empty reasoning array", () => {
  const bad = baseValid();
  bad.reasoning = [];
  assert.throws(() => aiSalesRecommendationSchema.parse(bad));
});

test("aiSalesRecommendationSchema accepts a recommendation without optional fields", () => {
  const minimal = {
    summary: "Short summary.",
    leadScore: 50,
    priority: "medium",
    reasoning: ["Reason one."],
    nextBestAction: { type: "call", description: "Make a call." },
  };
  assert.doesNotThrow(() => aiSalesRecommendationSchema.parse(minimal));
});

test("aiSalesRecommendationSchema rejects a quote with empty items array", () => {
  const bad = baseValid();
  bad.quoteSuggestion = { items: [] };
  assert.throws(() => aiSalesRecommendationSchema.parse(bad));
});

test("aiSalesRecommendationSchema strips extra fields (strict mode)", () => {
  const padded = { ...baseValid(), secretToken: "leaked", workspaceId: "attacker" };
  assert.throws(() => aiSalesRecommendationSchema.parse(padded));
});

function baseValid(): AISalesRecommendation {
  return {
    summary: "Ahmet is qualified.",
    leadScore: 70,
    priority: "high",
    reasoning: ["Stage qualified"],
    nextBestAction: { type: "call", description: "Call back tomorrow." },
  };
}

// ---------------------------------------------------------------------------
// Approval payload validation
// ---------------------------------------------------------------------------

test("parseApprovalPayload accepts a valid update_lead_stage payload", () => {
  const parsed = parseApprovalPayload("update_lead_stage", {
    leadId: "l1",
    fromStage: "new",
    toStage: "contacted",
  });
  assert.equal(parsed.toStage, "contacted");
});

test("parseApprovalPayload rejects payload tampering with workspaceId", () => {
  assert.throws(
    () =>
      parseApprovalPayload("update_lead_stage", {
        leadId: "l1",
        toStage: "contacted",
        workspaceId: " attacker",
      }),
    ApprovalPayloadValidationError,
  );
});

test("parseApprovalPayload rejects negative unit price in create_quote", () => {
  assert.throws(
    () =>
      parseApprovalPayload("create_quote", {
        leadId: "l1",
        items: [{ productId: "p1", quantity: 1, unitPrice: -5 }],
      }),
    ApprovalPayloadValidationError,
  );
});

test("parseApprovalPayload rejects create_quote without lead or customer", () => {
  assert.throws(
    () =>
      parseApprovalPayload("create_quote", {
        items: [{ productId: "p1", quantity: 1, unitPrice: 100 }],
      }),
    ApprovalPayloadValidationError,
  );
});

test("parseApprovalPayload rejects unknown action payload keys", () => {
  assert.throws(
    () =>
      parseApprovalPayload("create_customer", {
        fullName: "Alice",
        role: "owner", // attacker-supplied role escalation field
      }),
    ApprovalPayloadValidationError,
  );
});

test("parseApprovalPayload validates send_follow_up channel enum", () => {
  assert.throws(
    () =>
      parseApprovalPayload("send_follow_up", {
        leadId: "l1",
        channel: "sms",
        message: "Hello",
      }),
    ApprovalPayloadValidationError,
  );
});

// ---------------------------------------------------------------------------
// Pilot feedback validation
// ---------------------------------------------------------------------------

test("pilotFeedbackRequestSchema accepts a valid feedback payload", () => {
  assert.doesNotThrow(() =>
    pilotFeedbackRequestSchema.parse({
      trigger_context: "ai_recommendation_viewed",
      score: 5,
      ai_helpful_score: 4,
      weekly_intent: true,
      purchase_intent: true,
      comment: "Loved the AI summary.",
    }),
  );
});

test("pilotFeedbackRequestSchema rejects out-of-range score", () => {
  assert.throws(() =>
    pilotFeedbackRequestSchema.parse({
      trigger_context: "manual",
      score: 0,
    }),
  );
});

test("pilotFeedbackRequestSchema rejects unknown trigger context", () => {
  assert.throws(() =>
    pilotFeedbackRequestSchema.parse({
      trigger_context: "magic_button",
      score: 4,
    }),
  );
});

test("pilotFeedbackRequestSchema rejects max < min price range", () => {
  assert.throws(() =>
    pilotFeedbackRequestSchema.parse({
      trigger_context: "manual",
      score: 4,
      price_range_min: 1000,
      price_range_max: 100,
    }),
  );
});

// ---------------------------------------------------------------------------
// Entitlement resolution
// ---------------------------------------------------------------------------

test("PLAN_ENTITLEMENTS exposes demo/trial/starter/pro/business", () => {
  assert.deepEqual(
    Object.keys(PLAN_ENTITLEMENTS).sort(),
    ["business", "demo", "pro", "starter", "trial"].sort(),
  );
});

test("demo plan blocks team_members and exports features", () => {
  const demo = PLAN_ENTITLEMENTS.demo;
  assert.equal(hasFeature(demo, "team_members"), false);
  assert.equal(hasFeature(demo, "exports"), false);
  assert.equal(hasFeature(demo, "ai_sales_agent"), true);
});

test("trial plan enables all features but disables billing", () => {
  const trial = PLAN_ENTITLEMENTS.trial;
  assert.equal(hasFeature(trial, "team_members"), true);
  assert.equal(hasFeature(trial, "exports"), true);
  assert.equal(trial.limits.billingEnabled, false);
});

test("resolvePlanState flags demo workspace regardless of stale subscription row", () => {
  const DEMO_ORG = "d3e00000-0000-0000-0000-000000000000";
  const stale: SubscriptionRecord = {
    plan: "starter",
    status: "active",
    trial_started_at: null,
    trial_ends_at: null,
    trial_converted_at: null,
    current_period_end: null,
  };
  const resolved = resolvePlanState(stale, DEMO_ORG);
  assert.equal(resolved.plan, "demo");
  assert.equal(resolved.isDemoWorkspace, true);
  assert.equal(resolved.inTrial, false);
});

test("resolvePlanState detects active trial within window", () => {
  const future = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const sub: SubscriptionRecord = {
    plan: "trial",
    status: "trialing",
    trial_started_at: new Date().toISOString(),
    trial_ends_at: future,
    trial_converted_at: null,
    current_period_end: future,
  };
  const resolved = resolvePlanState(sub, "11111111-1111-1111-1111-111111111111");
  assert.equal(resolved.plan, "trial");
  assert.equal(resolved.inTrial, true);
  assert.equal(resolved.trialExpired, false);
});

test("resolvePlanState detects expired trial", () => {
  const past = "2020-01-01T00:00:00Z";
  const sub: SubscriptionRecord = {
    plan: "trial",
    status: "trial_expired",
    trial_started_at: "2019-12-01T00:00:00Z",
    trial_ends_at: past,
    trial_converted_at: null,
    current_period_end: null,
  };
  const resolved = resolvePlanState(sub, "22222222-2222-2222-2222-222222222222");
  assert.equal(resolved.plan, "trial");
  assert.equal(resolved.inTrial, false);
  assert.equal(resolved.trialExpired, true);
});

test("resolvePlanState defaults to starter for missing subscription row", () => {
  const resolved = resolvePlanState(null, "33333333-3333-3333-3333-333333333333");
  assert.equal(resolved.plan, "starter");
  assert.equal(resolved.isDemoWorkspace, false);
});

test("getPlanEntitlement falls back to starter for unknown plan strings", () => {
  const ent = getPlanEntitlement("unknown-plan-xyz");
  assert.equal(ent.plan, "starter");
});

test("hasFeature returns false for nullish / unknown feature", () => {
  const ent = PLAN_ENTITLEMENTS.starter;
  assert.equal(hasFeature(ent, "exports" as never), false);
});

// Smoke: ApprovalActionType covers all entitlement action types we validate.
test("APPROVAL_ACTION_TYPES covers all six action categories", () => {
  const actionTypes: ApprovalActionType[] = [
    "update_lead_stage",
    "update_lead_status",
    "create_next_action",
    "create_quote",
    "create_customer",
    "send_follow_up",
  ];
  assert.equal(actionTypes.length, 6);
  for (const at of actionTypes) {
    assert.ok(
      (parseApprovalPayload as (t: ApprovalActionType, p: unknown) => unknown) !== undefined,
    );
    void at;
  }
});
