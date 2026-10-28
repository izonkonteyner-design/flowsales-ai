import { z } from "zod";

export const leadSourceChannelSchema = z.enum([
  "web_form",
  "whatsapp",
  "instagram",
  "facebook",
  "google_leads",
  "meta_leads",
  "manual",
  "voice",
]);
export type LeadSourceChannel = z.infer<typeof leadSourceChannelSchema>;

export const salesPipelineStageSchema = z.enum([
  "new_lead",
  "qualified",
  "quote_preparation",
  "quote_sent",
  "negotiation",
  "won",
  "lost",
]);
export type SalesPipelineStage = z.infer<typeof salesPipelineStageSchema>;

export const normalizedLeadInputSchema = z.object({
  fullName: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  company: z.string().optional(),
  notes: z.string().optional(),
  productInterest: z.string().optional(),
  budgetAmount: z.number().nonnegative().optional(),
  currency: z.string().default("TRY"),
  city: z.string().optional(),
  expectedTimeline: z.string().optional(),
  sourceChannel: leadSourceChannelSchema,
  sourceRefId: z.string().optional(),
  utmParameters: z.record(z.string(), z.string()).optional(),
});
export type NormalizedLeadInput = z.infer<typeof normalizedLeadInputSchema>;

export const leadIntelligenceResultSchema = z.object({
  leadId: z.string(),
  qualificationScore: z.number().min(0).max(100),
  temperature: z.enum(["hot", "warm", "cold"]),
  observedFacts: z.array(z.string()),
  aiInferences: z.array(z.string()),
  recommendedStage: salesPipelineStageSchema,
  recommendedNextActions: z.array(
    z.object({
      id: z.string(),
      actionType: z.enum(["task", "call", "reply_draft", "quote_draft", "reminder"]),
      title: z.string(),
      reason: z.string(),
      evidence: z.string(),
      priority: z.enum(["urgent", "high", "medium", "low"]),
      suggestedExecutionTime: z.string(),
      requiresHumanApproval: z.boolean().default(true),
    })
  ),
  isStalled: z.boolean().default(false),
  stalledReason: z.string().optional(),
});
export type LeadIntelligenceResult = z.infer<typeof leadIntelligenceResultSchema>;

export const dailyRevenueBriefingSchema = z.object({
  date: z.string(),
  workspaceId: z.string(),
  summary: z.string(),
  newLeadsCount: z.number(),
  qualifiedOpportunitiesCount: z.number(),
  quotesAwaitingApprovalCount: z.number(),
  overdueFollowUpsCount: z.number(),
  atRiskDealsCount: z.number(),
  wonDealsValue: z.number(),
  currency: z.string().default("TRY"),
  actionablePriorities: z.array(
    z.object({
      title: z.string(),
      detail: z.string(),
      recordType: z.enum(["lead", "quote", "task", "opportunity"]),
      recordId: z.string(),
      href: z.string(),
      priority: z.enum(["urgent", "high", "medium", "low"]),
    })
  ),
});
export type DailyRevenueBriefing = z.infer<typeof dailyRevenueBriefingSchema>;
