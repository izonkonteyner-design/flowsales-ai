import { z } from "zod";

import { aiActionSchema, aiCapabilitySchema, aiEvidenceSchema, moneySchema } from "../ai-sales-agent/domain";

export const aiApprovalStatusSchema = z.enum(["pending", "approved", "rejected", "cancelled", "expired"]);
export type AiApprovalStatus = z.infer<typeof aiApprovalStatusSchema>;

export const aiApprovalDecisionSchema = z.enum(["approve", "reject", "cancel"]);
export type AiApprovalDecision = z.infer<typeof aiApprovalDecisionSchema>;

export const aiApprovalRequestSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().min(1),
  runId: z.string().min(1),
  actorId: z.string().min(1),
  leadId: z.string().min(1),
  capability: aiCapabilitySchema,
  status: aiApprovalStatusSchema,
  summary: z.string().trim().min(1).max(3000),
  actions: z.array(aiActionSchema).min(1).max(10),
  evidence: z.array(aiEvidenceSchema).max(50),
  money: z.array(moneySchema).max(20),
  reasons: z.array(z.string().trim().min(1).max(500)).max(20),
  provider: z.string().trim().min(1).max(100),
  model: z.string().trim().min(1).max(160),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  decidedAt: z.string().datetime().optional(),
  decidedBy: z.string().min(1).optional(),
  decisionNote: z.string().trim().max(1000).optional(),
  version: z.number().int().positive(),
});

export type AiApprovalRequest = z.infer<typeof aiApprovalRequestSchema>;

export const createAiApprovalInputSchema = aiApprovalRequestSchema.pick({
  workspaceId: true,
  runId: true,
  actorId: true,
  leadId: true,
  capability: true,
  summary: true,
  actions: true,
  evidence: true,
  money: true,
  reasons: true,
  provider: true,
  model: true,
  expiresAt: true,
});

export type CreateAiApprovalInput = z.infer<typeof createAiApprovalInputSchema>;

export type DecideAiApprovalInput = {
  workspaceId: string;
  approvalId: string;
  actorId: string;
  decision: AiApprovalDecision;
  note?: string;
  expectedVersion: number;
};

export class AiApprovalError extends Error {
  constructor(
    message: string,
    readonly code:
      | "not_found"
      | "workspace_mismatch"
      | "demo_read_only"
      | "not_pending"
      | "expired"
      | "version_conflict"
      | "unauthorized",
  ) {
    super(message);
    this.name = "AiApprovalError";
  }
}

export function isApprovalExpired(approval: AiApprovalRequest, now: Date): boolean {
  return approval.expiresAt !== undefined && new Date(approval.expiresAt).getTime() <= now.getTime();
}
