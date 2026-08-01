import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateAiExecutionPolicy,
  parseAiSalesAgentOutput,
  type AiSalesAgentOutput,
} from "../server/services/ai-sales-agent/domain";

function makeOutput(overrides: Partial<AiSalesAgentOutput> = {}): AiSalesAgentOutput {
  return {
    version: "1",
    capability: "next_best_action",
    summary: "Contact the lead with a tailored follow-up.",
    confidence: 0.82,
    riskLevel: "low",
    decision: "informational",
    actions: [
      {
        kind: "draft_follow_up",
        title: "Prepare follow-up",
        rationale: "The lead has not been contacted recently.",
        targetType: "lead",
        targetId: "lead-1",
      },
    ],
    evidence: [{ type: "lead", id: "lead-1", label: "Lead record" }],
    money: [],
    warnings: [],
    ...overrides,
  };
}

test("parses a valid structured AI output", () => {
  const output = makeOutput();
  assert.deepEqual(parseAiSalesAgentOutput(output), output);
});

test("rejects invalid confidence values", () => {
  assert.throws(() => parseAiSalesAgentOutput({ ...makeOutput(), confidence: 1.1 }));
});

test("allows informational recommendations without approval", () => {
  const result = evaluateAiExecutionPolicy({ isDemoWorkspace: false, output: makeOutput() });

  assert.equal(result.decision, "informational");
  assert.equal(result.approvalRequired, false);
  assert.equal(result.blockedActions.length, 0);
});

test("requires approval for mutating actions", () => {
  const output = makeOutput({
    actions: [
      {
        kind: "send_message",
        title: "Send follow-up",
        rationale: "The draft is ready for customer delivery.",
        targetType: "lead",
        targetId: "lead-1",
      },
    ],
  });

  const result = evaluateAiExecutionPolicy({ isDemoWorkspace: false, output });

  assert.equal(result.decision, "approval_required");
  assert.equal(result.approvalRequired, true);
  assert.equal(result.blockedActions.length, 1);
});

test("blocks mutating actions in demo workspaces", () => {
  const output = makeOutput({
    actions: [
      {
        kind: "create_quote",
        title: "Create recommended quote",
        rationale: "The selected products match the lead requirements.",
        targetType: "lead",
        targetId: "lead-1",
      },
    ],
  });

  const result = evaluateAiExecutionPolicy({ isDemoWorkspace: true, output });

  assert.equal(result.decision, "blocked");
  assert.equal(result.approvalRequired, false);
  assert.equal(result.blockedActions.length, 1);
  assert.match(result.reasons.join(" "), /read-only/i);
});

test("flags monetary recommendations without a trusted source id", () => {
  const output = makeOutput({
    capability: "quote_recommendation",
    money: [{ currency: "USD", amount: 5000, source: "catalog" }],
  });

  const result = evaluateAiExecutionPolicy({ isDemoWorkspace: false, output });

  assert.equal(result.decision, "approval_required");
  assert.match(result.reasons.join(" "), /trusted source record/i);
});
