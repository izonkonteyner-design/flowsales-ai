import assert from "node:assert/strict";
import test from "node:test";

import { AiApprovalError, type AiApprovalRequest } from "../server/services/ai-approvals/domain";
import {
  decideAiApproval,
  listPendingAiApprovals,
  queueAiApproval,
  type AiApprovalRepository,
  type AiApprovalServiceDependencies,
} from "../server/services/ai-approvals/service";

const NOW = new Date("2026-08-01T09:00:00.000Z");

function makeDependencies(options?: { demo?: boolean; reviewer?: boolean }) {
  const approvals = new Map<string, AiApprovalRequest>();
  const events: string[] = [];
  const repository: AiApprovalRepository = {
    async create(approval) {
      approvals.set(approval.id, approval);
      return approval;
    },
    async findById(workspaceId, approvalId) {
      const approval = approvals.get(approvalId);
      return approval?.workspaceId === workspaceId ? approval : null;
    },
    async listPending(workspaceId, limit) {
      return [...approvals.values()].filter((item) => item.workspaceId === workspaceId && item.status === "pending").slice(0, limit);
    },
    async transition(input) {
      const current = approvals.get(input.approvalId);
      if (!current || current.workspaceId !== input.workspaceId || current.status !== input.fromStatus || current.version !== input.expectedVersion) {
        return null;
      }
      const updated: AiApprovalRequest = {
        ...current,
        status: input.toStatus,
        decidedAt: input.decidedAt,
        decidedBy: input.actorId,
        decisionNote: input.note,
        version: current.version + 1,
      };
      approvals.set(updated.id, updated);
      return updated;
    },
  };

  const dependencies: AiApprovalServiceDependencies = {
    repository,
    authorization: {
      async canReview() { return options?.reviewer ?? true; },
      async isDemoWorkspace() { return options?.demo ?? false; },
    },
    auditSink: {
      async write(event) { events.push(event.event); },
    },
    now: () => NOW,
    createId: () => "11111111-1111-4111-8111-111111111111",
  };

  return { dependencies, approvals, events };
}

const queueInput = {
  workspaceId: "workspace-1",
  runId: "run-1",
  actorId: "actor-1",
  leadId: "lead-1",
  capability: "next_best_action" as const,
  summary: "Draft and review a follow-up.",
  actions: [{
    kind: "send_message" as const,
    title: "Send follow-up",
    rationale: "The lead has not responded.",
    targetType: "lead" as const,
    targetId: "lead-1",
  }],
  evidence: [{ type: "lead" as const, id: "lead-1", label: "Lead" }],
  money: [],
  reasons: ["Human approval is required."],
  provider: "fake",
  model: "fake-model",
};

test("queues an immutable pending approval and writes audit", async () => {
  const { dependencies, events } = makeDependencies();
  const approval = await queueAiApproval(dependencies, queueInput);
  assert.equal(approval.status, "pending");
  assert.equal(approval.version, 1);
  assert.deepEqual(events, ["queued"]);
});

test("authorized reviewer can approve a production workspace request", async () => {
  const { dependencies, events } = makeDependencies();
  const approval = await queueAiApproval(dependencies, queueInput);
  const decided = await decideAiApproval(dependencies, {
    workspaceId: approval.workspaceId,
    approvalId: approval.id,
    actorId: "reviewer-1",
    decision: "approve",
    expectedVersion: 1,
  });
  assert.equal(decided.status, "approved");
  assert.equal(decided.version, 2);
  assert.deepEqual(events, ["queued", "approved"]);
});

test("demo workspace approval is blocked", async () => {
  const { dependencies } = makeDependencies({ demo: true });
  const approval = await queueAiApproval(dependencies, queueInput);
  await assert.rejects(
    decideAiApproval(dependencies, {
      workspaceId: approval.workspaceId,
      approvalId: approval.id,
      actorId: "reviewer-1",
      decision: "approve",
      expectedVersion: 1,
    }),
    (error) => error instanceof AiApprovalError && error.code === "demo_read_only",
  );
});

test("unauthorized actor cannot list or decide approvals", async () => {
  const { dependencies } = makeDependencies({ reviewer: false });
  await assert.rejects(listPendingAiApprovals(dependencies, "workspace-1", "actor-x"), (error) => error instanceof AiApprovalError && error.code === "unauthorized");
});

test("optimistic concurrency prevents a second decision", async () => {
  const { dependencies } = makeDependencies();
  const approval = await queueAiApproval(dependencies, queueInput);
  await decideAiApproval(dependencies, {
    workspaceId: approval.workspaceId,
    approvalId: approval.id,
    actorId: "reviewer-1",
    decision: "reject",
    expectedVersion: 1,
  });
  await assert.rejects(
    decideAiApproval(dependencies, {
      workspaceId: approval.workspaceId,
      approvalId: approval.id,
      actorId: "reviewer-2",
      decision: "approve",
      expectedVersion: 1,
    }),
    (error) => error instanceof AiApprovalError && ["version_conflict", "not_pending"].includes(error.code),
  );
});

test("expired request is transitioned to expired instead of approved", async () => {
  const { dependencies } = makeDependencies();
  const approval = await queueAiApproval(dependencies, { ...queueInput, expiresAt: "2026-07-31T09:00:00.000Z" });
  const decided = await decideAiApproval(dependencies, {
    workspaceId: approval.workspaceId,
    approvalId: approval.id,
    actorId: "reviewer-1",
    decision: "approve",
    expectedVersion: 1,
  });
  assert.equal(decided.status, "expired");
});
