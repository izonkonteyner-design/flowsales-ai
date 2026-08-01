import assert from "node:assert/strict";
import test from "node:test";

import {
  AiContextAccessError,
  buildAiSalesContext,
  type AiContextRepository,
} from "../server/services/ai-sales-agent/context";
import type { AiSalesAgentOutput } from "../server/services/ai-sales-agent/domain";
import { runAiSalesAgent, type AiAuditEvent } from "../server/services/ai-sales-agent/orchestrator";
import type { AiProvider } from "../server/services/ai-sales-agent/provider";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const ACTOR_ID = "22222222-2222-4222-8222-222222222222";
const LEAD_ID = "33333333-3333-4333-8333-333333333333";

function repository(overrides: Partial<AiContextRepository> = {}): AiContextRepository {
  return {
    actorCanAccessWorkspace: async () => true,
    isDemoWorkspace: async () => false,
    getLead: async () => ({
      id: LEAD_ID,
      name: "Acme Lead",
      status: "new",
      source: "website",
      assignedTo: null,
      estimatedValue: 2500,
      currency: "USD",
      createdAt: "2026-08-01T08:00:00.000Z",
      updatedAt: "2026-08-01T09:00:00.000Z",
    }),
    listLeadActivities: async () => [],
    listActiveProducts: async () => [],
    listWorkspaceRules: async () => [],
    ...overrides,
  };
}

function output(capability: "lead_scoring" | "next_best_action", actionKind = "review_lead"): AiSalesAgentOutput {
  return {
    version: "1",
    capability,
    summary: "Evidence-based result.",
    confidence: 0.8,
    riskLevel: "low",
    decision: "informational",
    actions: [{
      kind: actionKind as AiSalesAgentOutput["actions"][number]["kind"],
      title: "Review lead",
      rationale: "Recent lead information should be reviewed.",
      targetType: "lead",
      targetId: LEAD_ID,
    }],
    evidence: [{ type: "lead", id: LEAD_ID, label: "Acme Lead" }],
    money: [],
    warnings: [],
  };
}

function provider(result: AiSalesAgentOutput): AiProvider {
  return {
    name: "fake",
    async generate(request) {
      assert.equal(request.capability, result.capability);
      return { output: result, provider: "fake", model: "fake-model" };
    },
  };
}

const request = {
  workspaceId: WORKSPACE_ID,
  actorId: ACTOR_ID,
  leadId: LEAD_ID,
  capability: "lead_scoring" as const,
};

test("context builder rejects cross-workspace access before reading lead data", async () => {
  let leadRead = false;
  const repo = repository({
    actorCanAccessWorkspace: async () => false,
    getLead: async () => {
      leadRead = true;
      return null;
    },
  });

  await assert.rejects(() => buildAiSalesContext(repo, request), AiContextAccessError);
  assert.equal(leadRead, false);
});

test("orchestration records started and completed audit events", async () => {
  const events: AiAuditEvent[] = [];
  const result = await runAiSalesAgent({
    contextRepository: repository(),
    provider: provider(output("lead_scoring")),
    auditSink: { write: async (event) => { events.push(event); } },
    now: () => new Date("2026-08-01T10:00:00.000Z"),
    createRunId: () => "run-1",
  }, request);

  assert.equal(result.runId, "run-1");
  assert.equal(result.policy.decision, "informational");
  assert.deepEqual(events.map((event) => event.status), ["started", "completed"]);
  assert.equal(events[1]?.provider, "fake");
});

test("demo workspace blocks mutating AI actions", async () => {
  const result = await runAiSalesAgent({
    contextRepository: repository({ isDemoWorkspace: async () => true }),
    provider: provider(output("lead_scoring", "send_message")),
    auditSink: { write: async () => undefined },
    createRunId: () => "run-2",
  }, request);

  assert.equal(result.policy.decision, "blocked");
  assert.equal(result.policy.blockedActions[0]?.kind, "send_message");
});

test("orchestration records failure without masking the original error", async () => {
  const events: AiAuditEvent[] = [];
  const expected = new Error("provider failed");
  const failingProvider: AiProvider = {
    name: "fake",
    generate: async () => { throw expected; },
  };

  await assert.rejects(() => runAiSalesAgent({
    contextRepository: repository(),
    provider: failingProvider,
    auditSink: { write: async (event) => { events.push(event); } },
    createRunId: () => "run-3",
  }, request), expected);

  assert.deepEqual(events.map((event) => event.status), ["started", "failed"]);
});
