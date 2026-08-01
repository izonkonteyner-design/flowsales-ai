import { randomUUID } from "node:crypto";

import {
  aiApprovalRequestSchema,
  AiApprovalError,
  createAiApprovalInputSchema,
  isApprovalExpired,
  type AiApprovalRequest,
  type CreateAiApprovalInput,
  type DecideAiApprovalInput,
} from "./domain";

export interface AiApprovalRepository {
  create(approval: AiApprovalRequest): Promise<AiApprovalRequest>;
  findById(workspaceId: string, approvalId: string): Promise<AiApprovalRequest | null>;
  listPending(workspaceId: string, limit: number): Promise<AiApprovalRequest[]>;
  transition(input: {
    workspaceId: string;
    approvalId: string;
    fromStatus: "pending";
    toStatus: "approved" | "rejected" | "cancelled" | "expired";
    actorId?: string;
    note?: string;
    decidedAt: string;
    expectedVersion: number;
  }): Promise<AiApprovalRequest | null>;
}

export interface AiApprovalAuthorization {
  canReview(workspaceId: string, actorId: string): Promise<boolean>;
  isDemoWorkspace(workspaceId: string): Promise<boolean>;
}

export interface AiApprovalAuditSink {
  write(event: {
    approvalId: string;
    workspaceId: string;
    actorId: string;
    event: "queued" | "approved" | "rejected" | "cancelled" | "expired";
    occurredAt: string;
    note?: string;
  }): Promise<void>;
}

export type AiApprovalServiceDependencies = {
  repository: AiApprovalRepository;
  authorization: AiApprovalAuthorization;
  auditSink: AiApprovalAuditSink;
  now?: () => Date;
  createId?: () => string;
};

export async function queueAiApproval(
  dependencies: AiApprovalServiceDependencies,
  rawInput: CreateAiApprovalInput,
): Promise<AiApprovalRequest> {
  const input = createAiApprovalInputSchema.parse(rawInput);
  const now = dependencies.now?.() ?? new Date();
  const approval = aiApprovalRequestSchema.parse({
    ...input,
    id: (dependencies.createId ?? randomUUID)(),
    status: "pending",
    createdAt: now.toISOString(),
    version: 1,
  });

  const created = await dependencies.repository.create(approval);
  await dependencies.auditSink.write({
    approvalId: created.id,
    workspaceId: created.workspaceId,
    actorId: created.actorId,
    event: "queued",
    occurredAt: now.toISOString(),
  });
  return created;
}

export async function listPendingAiApprovals(
  dependencies: AiApprovalServiceDependencies,
  workspaceId: string,
  actorId: string,
  limit = 50,
): Promise<AiApprovalRequest[]> {
  if (!(await dependencies.authorization.canReview(workspaceId, actorId))) {
    throw new AiApprovalError("Actor cannot review approvals in this workspace.", "unauthorized");
  }
  return dependencies.repository.listPending(workspaceId, Math.min(Math.max(limit, 1), 100));
}

export async function decideAiApproval(
  dependencies: AiApprovalServiceDependencies,
  input: DecideAiApprovalInput,
): Promise<AiApprovalRequest> {
  const now = dependencies.now?.() ?? new Date();
  if (!(await dependencies.authorization.canReview(input.workspaceId, input.actorId))) {
    throw new AiApprovalError("Actor cannot review approvals in this workspace.", "unauthorized");
  }

  const approval = await dependencies.repository.findById(input.workspaceId, input.approvalId);
  if (!approval) {
    throw new AiApprovalError("Approval request was not found.", "not_found");
  }
  if (approval.workspaceId !== input.workspaceId) {
    throw new AiApprovalError("Approval belongs to another workspace.", "workspace_mismatch");
  }
  if (approval.version !== input.expectedVersion) {
    throw new AiApprovalError("Approval changed before this decision was saved.", "version_conflict");
  }
  if (approval.status !== "pending") {
    throw new AiApprovalError("Only pending approvals can be decided.", "not_pending");
  }

  let targetStatus: "approved" | "rejected" | "cancelled" | "expired";
  if (isApprovalExpired(approval, now)) {
    targetStatus = "expired";
  } else if (input.decision === "approve") {
    if (await dependencies.authorization.isDemoWorkspace(input.workspaceId)) {
      throw new AiApprovalError("Demo workspaces cannot approve mutating AI actions.", "demo_read_only");
    }
    targetStatus = "approved";
  } else {
    targetStatus = input.decision === "reject" ? "rejected" : "cancelled";
  }

  const updated = await dependencies.repository.transition({
    workspaceId: input.workspaceId,
    approvalId: input.approvalId,
    fromStatus: "pending",
    toStatus: targetStatus,
    actorId: input.actorId,
    note: input.note,
    decidedAt: now.toISOString(),
    expectedVersion: input.expectedVersion,
  });
  if (!updated) {
    throw new AiApprovalError("Approval changed before this decision was saved.", "version_conflict");
  }

  await dependencies.auditSink.write({
    approvalId: updated.id,
    workspaceId: updated.workspaceId,
    actorId: input.actorId,
    event: targetStatus,
    occurredAt: now.toISOString(),
    note: input.note,
  });
  return updated;
}
