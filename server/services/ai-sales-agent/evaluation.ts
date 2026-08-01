import { z } from "zod";

import { evaluateAiExecutionPolicy, parseAiSalesAgentOutput } from "./domain";

export const aiEvaluationCaseSchema = z.object({
  key: z.string().min(1),
  isDemoWorkspace: z.boolean().default(false),
  output: z.unknown(),
  expected: z.object({
    validSchema: z.boolean().default(true),
    decision: z.enum(["informational", "approval_required", "blocked"]).optional(),
    approvalRequired: z.boolean().optional(),
    requiredEvidenceTypes: z.array(z.enum(["lead", "customer", "product", "quote", "activity", "workspace_rule"])).default([]),
    maximumWarnings: z.number().int().nonnegative().optional(),
  }),
});

export type AiEvaluationCase = z.infer<typeof aiEvaluationCaseSchema>;

export type AiEvaluationResult = {
  key: string;
  passed: boolean;
  checks: Array<{ name: string; passed: boolean; detail?: string }>;
};

export function evaluateAiCase(input: AiEvaluationCase): AiEvaluationResult {
  const evaluation = aiEvaluationCaseSchema.parse(input);
  const checks: AiEvaluationResult["checks"] = [];
  const parsed = parseAiSalesAgentOutputSafe(evaluation.output);

  checks.push({ name: "schema", passed: parsed.success === evaluation.expected.validSchema });
  if (!parsed.success) {
    return { key: evaluation.key, passed: checks.every((check) => check.passed), checks };
  }

  const policy = evaluateAiExecutionPolicy({
    isDemoWorkspace: evaluation.isDemoWorkspace,
    output: parsed.output,
  });

  if (evaluation.expected.decision) {
    checks.push({
      name: "decision",
      passed: policy.decision === evaluation.expected.decision,
      detail: `${policy.decision} vs ${evaluation.expected.decision}`,
    });
  }
  if (evaluation.expected.approvalRequired !== undefined) {
    checks.push({
      name: "approval_required",
      passed: policy.approvalRequired === evaluation.expected.approvalRequired,
    });
  }
  for (const type of evaluation.expected.requiredEvidenceTypes) {
    checks.push({
      name: `evidence:${type}`,
      passed: parsed.output.evidence.some((item) => item.type === type),
    });
  }
  if (evaluation.expected.maximumWarnings !== undefined) {
    checks.push({
      name: "warnings",
      passed: parsed.output.warnings.length <= evaluation.expected.maximumWarnings,
    });
  }

  return { key: evaluation.key, passed: checks.every((check) => check.passed), checks };
}

function parseAiSalesAgentOutputSafe(input: unknown):
  | { success: true; output: ReturnType<typeof parseAiSalesAgentOutput> }
  | { success: false } {
  try {
    return { success: true, output: parseAiSalesAgentOutput(input) };
  } catch {
    return { success: false };
  }
}

export function summarizeAiEvaluation(results: AiEvaluationResult[]) {
  const passedCases = results.filter((result) => result.passed).length;
  const totalCases = results.length;
  const score = totalCases === 0 ? 0 : passedCases / totalCases;
  return {
    totalCases,
    passedCases,
    failedCases: totalCases - passedCases,
    score,
    status: passedCases === totalCases ? "passed" as const : "failed" as const,
  };
}
