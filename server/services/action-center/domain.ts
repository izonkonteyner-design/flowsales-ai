import { z } from "zod";

export const actionSourceModuleSchema = z.enum([
  "revenue_autopilot",
  "quote_copilot",
  "customer_memory",
  "ad_intelligence",
  "crm_growth",
  "system",
]);
export type ActionSourceModule = z.infer<typeof actionSourceModuleSchema>;

export const actionTypeSchema = z.enum([
  "send_follow_up",
  "create_quote_draft",
  "apply_discount",
  "update_lead_stage",
  "schedule_task",
  "ad_optimization",
  "alert",
]);
export type ActionType = z.infer<typeof actionTypeSchema>;

export const actionTargetEntityTypeSchema = z.enum([
  "lead",
  "customer",
  "quote",
  "campaign",
  "task",
]);
export type ActionTargetEntityType = z.infer<typeof actionTargetEntityTypeSchema>;

export const actionPrioritySchema = z.enum(["urgent", "high", "medium", "low"]);
export type ActionPriority = z.infer<typeof actionPrioritySchema>;

export const actionProposalStatusSchema = z.enum([
  "draft",
  "pending_review",
  "approved",
  "rejected",
  "executed",
  "failed",
  "dismissed",
]);
export type ActionProposalStatus = z.infer<typeof actionProposalStatusSchema>;

export const createActionProposalInputSchema = z.object({
  organizationId: z.string().min(1),
  sourceModule: actionSourceModuleSchema,
  actionType: actionTypeSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  targetEntityType: actionTargetEntityTypeSchema,
  targetEntityId: z.string().min(1),
  targetEntityTitle: z.string().optional(),
  evidence: z.array(z.string()).default([]),
  reasons: z.array(z.string()).default([]),
  priority: actionPrioritySchema.default("medium"),
  actionPayload: z.record(z.string(), z.any()).default({}),
  requiredRole: z.enum(["owner", "admin", "sales", "member"]).default("sales"),
});
export type CreateActionProposalInput = z.infer<typeof createActionProposalInputSchema>;

export const aiActionProposalRecordSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  sourceModule: actionSourceModuleSchema,
  actionType: actionTypeSchema,
  title: z.string(),
  description: z.string(),
  targetEntityType: actionTargetEntityTypeSchema,
  targetEntityId: z.string(),
  targetEntityTitle: z.string().nullable().optional(),
  evidence: z.array(z.string()),
  reasons: z.array(z.string()),
  priority: actionPrioritySchema,
  status: actionProposalStatusSchema,
  actionPayload: z.record(z.string(), z.any()),
  actionHash: z.string(),
  approvalRequestId: z.string().min(1).nullable().optional(),
  requiredRole: z.string(),
  decidedBy: z.string().min(1).nullable().optional(),
  decidedAt: z.string().nullable().optional(),
  decisionNote: z.string().nullable().optional(),
  executedAt: z.string().nullable().optional(),
  executionResult: z.record(z.string(), z.any()).nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AiActionProposalRecord = z.infer<typeof aiActionProposalRecordSchema>;
