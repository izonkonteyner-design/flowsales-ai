import { randomUUID } from "node:crypto";

import { buildAiSalesContext, type AiContextRepository, type AiContextRequest } from "./context";
import { evaluateAiExecutionPolicy, type AiCapability, type AiExecutionPolicyResult, type AiSalesAgentOutput } from "./domain";
import type { AiProvider } from "./provider";
import { recommendNextBestAction, scoreLead } from "./services";

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
  errorCode?: string;
};

export interface AiAuditSink {
  write(event: AiAuditEvent): Promise<void>;
}

export type AiOrchestrationDependencies = {
  contextRepository: AiContextRepository;
  provider: AiProvider;
  auditSink: AiAuditSink;
  now?: () => Date;
  createRunId?: () => string;
};

export type AiOrchestrationResult = {
  runId: string;
  output: AiSalesAgentOutput;
  policy: AiExecutionPolicyResult;
  provider: string;
  model: string;
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
    const result = request.capability === "lead_scoring"
      ? await scoreLead(dependencies.provider, context)
      : await recommendNextBestAction(dependencies.provider, context);

    const policy = evaluateAiExecutionPolicy({
      isDemoWorkspace: context.isDemoWorkspace,
      output: result.output,
    });

    await dependencies.auditSink.write({
      ...baseAudit,
      status: "completed",
      occurredAt: now().toISOString(),
      provider: result.provider,
      model: result.model,
      decision: policy.decision,
      approvalRequired: policy.approvalRequired,
    });

    return {
      runId,
      output: result.output,
      policy,
      provider: result.provider,
      model: result.model,
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
