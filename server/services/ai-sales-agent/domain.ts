import { z } from "zod";

export const aiCapabilitySchema = z.enum([
  "lead_scoring",
  "next_best_action",
  "opportunity_summary",
  "follow_up_draft",
  "product_recommendation",
  "quote_recommendation",
]);

export type AiCapability = z.infer<typeof aiCapabilitySchema>;

export const aiRiskLevelSchema = z.enum(["low", "medium", "high"]);
export type AiRiskLevel = z.infer<typeof aiRiskLevelSchema>;

export const aiDecisionSchema = z.enum(["informational", "approval_required", "blocked"]);
export type AiDecision = z.infer<typeof aiDecisionSchema>;

export const moneySchema = z.object({
  currency: z.string().trim().min(3).max(3),
  amount: z.number().finite().nonnegative(),
  source: z.enum(["catalog", "quote", "workspace_rule"]),
  sourceId: z.string().uuid().optional(),
});

export const aiEvidenceSchema = z.object({
  type: z.enum(["lead", "customer", "product", "quote", "activity", "workspace_rule"]),
  id: z.string().min(1),
  label: z.string().trim().min(1).max(160),
});

export const aiActionSchema = z.object({
  kind: z.enum([
    "review_lead",
    "contact_lead",
    "draft_follow_up",
    "recommend_product",
    "recommend_quote",
    "create_quote",
    "send_message",
    "update_record",
  ]),
  title: z.string().trim().min(1).max(160),
  rationale: z.string().trim().min(1).max(1000),
  targetType: z.enum(["lead", "customer", "quote", "product"]).optional(),
  targetId: z.string().min(1).optional(),
});

export const aiSalesAgentOutputSchema = z.object({
  version: z.literal("1"),
  capability: aiCapabilitySchema,
  summary: z.string().trim().min(1).max(3000),
  confidence: z.number().min(0).max(1),
  riskLevel: aiRiskLevelSchema,
  decision: aiDecisionSchema,
  actions: z.array(aiActionSchema).max(10),
  evidence: z.array(aiEvidenceSchema).max(50),
  money: z.array(moneySchema).max(20).default([]),
  warnings: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
});

export type AiSalesAgentOutput = z.infer<typeof aiSalesAgentOutputSchema>;

const MUTATING_ACTIONS = new Set<z.infer<typeof aiActionSchema>["kind"]>([
  "create_quote",
  "send_message",
  "update_record",
]);

export type AiExecutionPolicyInput = {
  isDemoWorkspace: boolean;
  output: AiSalesAgentOutput;
};

export type AiExecutionPolicyResult = {
  decision: AiDecision;
  approvalRequired: boolean;
  executableActions: AiSalesAgentOutput["actions"];
  blockedActions: AiSalesAgentOutput["actions"];
  reasons: string[];
};

export function evaluateAiExecutionPolicy({
  isDemoWorkspace,
  output,
}: AiExecutionPolicyInput): AiExecutionPolicyResult {
  const mutatingActions = output.actions.filter((action) => MUTATING_ACTIONS.has(action.kind));
  const informationalActions = output.actions.filter((action) => !MUTATING_ACTIONS.has(action.kind));
  const reasons = [...output.warnings];

  if (output.money.some((money) => money.sourceId === undefined)) {
    reasons.push("Every monetary recommendation must reference a trusted source record.");
  }

  if (isDemoWorkspace && mutatingActions.length > 0) {
    reasons.push("Demo workspaces are read-only; mutating AI actions are blocked.");
    return {
      decision: "blocked",
      approvalRequired: false,
      executableActions: informationalActions,
      blockedActions: mutatingActions,
      reasons,
    };
  }

  const requiresApproval =
    mutatingActions.length > 0 ||
    output.riskLevel === "high" ||
    output.capability === "quote_recommendation";

  if (requiresApproval) {
    reasons.push("A human must approve this AI recommendation before execution.");
    return {
      decision: "approval_required",
      approvalRequired: true,
      executableActions: informationalActions,
      blockedActions: mutatingActions,
      reasons,
    };
  }

  return {
    decision: "informational",
    approvalRequired: false,
    executableActions: output.actions,
    blockedActions: [],
    reasons,
  };
}

export function parseAiSalesAgentOutput(input: unknown): AiSalesAgentOutput {
  return aiSalesAgentOutputSchema.parse(input);
}
