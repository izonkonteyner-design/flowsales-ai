import { randomUUID } from "node:crypto";

import { buildAiSalesContext, type AiContextRepository, type AiContextRequest } from "./context";
import { evaluateAiExecutionPolicy, type AiCapability, type AiExecutionPolicyResult, type AiSalesAgentOutput } from "./domain";
import type { AiProvider } from "./provider";
import { runAiCapability } from "./services";
import type { AiApprovalRequest, CreateAiApprovalInput } from "../ai-approvals/domain";

export type AiAuditStatus = "started" | "completed" | "failed";

export type AiAuditEvent = {
  runId: string;
  workspaceId: string;
  actorId: string;
  leadId: string;
  capability: AiCapability;
  status: AiAuditStatus;
  occurredAt: string;
  provider?: string;
  model?: string;
  decision?: AiExecutionPolicyResult["decision"];
  approvalRequired?: boolean;
  approvalId?: string;
  output?: AiSalesAgentOutput;
  inputTokens?: number;
  outputTokens?: number;
  errorCode?: string;
};

export interface AiAuditSink {
  write(event: AiAuditEvent): Promise<void>;
}

export interface AiApprovalQueue {
  queue(input: CreateAiApprovalInput): Promise<AiApprovalRequest>;
}

export type AiOrchestrationDependencies = {
  contextRepository: AiContextRepository;
  provider: AiProvider;
  auditSink: AiAuditSink;
  approvalQueue?: AiApprovalQueue;
  now?: () => Date;
  createRunId?: () => string;
};

export type AiOrchestrationResult = {
  runId: string;
  output: AiSalesAgentOutput;
  policy: AiExecutionPolicyResult;
  provider: string;
  model: string;
  approval?: AiApprovalRequest;
};

export async function runAiSalesAgent(
  dependencies: AiOrchestrationDependencies,
  request: AiContextRequest,
): Promise<AiOrchestrationResult> {
  const now = dependencies.now ?? (() => new Date());
  const runId = (dependencies.createRunId ?? randomUUID)();
  const baseAudit = {
    runId,
    workspaceId: request.workspaceId,
    actorId: request.actorId,
    leadId: request.leadId,
    capability: request.capability,
  };

  await dependencies.auditSink.write({
    ...baseAudit,
    status: "started",
    occurredAt: now().toISOString(),
  });

  try {
    const context = await buildAiSalesContext(dependencies.contextRepository, request, now);
    const result = await runAiCapability(dependencies.provider, request.capability, context);

    const policy = evaluateAiExecutionPolicy({
      isDemoWorkspace: context.isDemoWorkspace,
      output: result.output,
    });

    let approval: AiApprovalRequest | undefined;
    if (policy.approvalRequired) {
      if (!dependencies.approvalQueue) {
        throw new Error("ApprovalQueueNotConfigured");
      }
      approval = await dependencies.approvalQueue.queue({
        workspaceId: request.workspaceId,
        runId,
        actorId: request.actorId,
        leadId: request.leadId,
        capability: request.capability,
        summary: result.output.summary,
        actions: result.output.actions,
        evidence: result.output.evidence,
        money: result.output.money,
        reasons: policy.reasons,
        provider: result.provider,
        model: result.model,
      });
    }

    await dependencies.auditSink.write({
      ...baseAudit,
      status: "completed",
      occurredAt: now().toISOString(),
      provider: result.provider,
      model: result.model,
      decision: policy.decision,
      approvalRequired: policy.approvalRequired,
      approvalId: approval?.id,
      output: result.output,
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
    });

    return {
      runId,
      output: result.output,
      policy,
      provider: result.provider,
      model: result.model,
      approval,
    };
  } catch (error) {
    const errorCode = error instanceof Error ? error.name : "UnknownError";
    try {
      await dependencies.auditSink.write({
        ...baseAudit,
        status: "failed",
        occurredAt: now().toISOString(),
        errorCode,
      });
    } catch {
      // Preserve the original failure. Audit persistence must never mask it.
    }
    throw error;
  }
}
