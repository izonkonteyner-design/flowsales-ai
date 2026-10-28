import { z } from "zod";

export const customerMemoryTypeSchema = z.enum([
  "verified_fact",
  "customer_statement",
  "ai_summary",
  "preference",
  "objection",
]);
export type CustomerMemoryType = z.infer<typeof customerMemoryTypeSchema>;

export const customerMemoryChannelSchema = z.enum([
  "whatsapp",
  "instagram",
  "facebook",
  "voice",
  "email",
  "crm_note",
  "quote",
  "web_chat",
  "manual",
]);
export type CustomerMemoryChannel = z.infer<typeof customerMemoryChannelSchema>;

export const customerMemoryRecordSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  customerId: z.string().min(1).nullable().optional(),
  leadId: z.string().min(1).nullable().optional(),
  memoryType: customerMemoryTypeSchema,
  content: z.string().min(1),
  confidence: z.number().min(0).max(1.0).default(1.0),
  sourceChannel: customerMemoryChannelSchema,
  sourceRefId: z.string().nullable().optional(),
  sourceTimestamp: z.string(),
  verifiedBy: z.string().min(1).nullable().optional(),
  verifiedAt: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.any()).default({}),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type CustomerMemoryRecord = z.infer<typeof customerMemoryRecordSchema>;

export const createMemoryInputSchema = z.object({
  organizationId: z.string().min(1),
  customerId: z.string().min(1).optional(),
  leadId: z.string().min(1).optional(),
  memoryType: customerMemoryTypeSchema,
  content: z.string().min(1),
  confidence: z.number().min(0).max(1.0).default(1.0),
  sourceChannel: customerMemoryChannelSchema,
  sourceRefId: z.string().optional(),
  sourceTimestamp: z.string().optional(),
  verifiedBy: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});
export type CreateMemoryInput = z.infer<typeof createMemoryInputSchema>;

export const interactionExtractionInputSchema = z.object({
  organizationId: z.string().min(1),
  customerId: z.string().min(1).optional(),
  leadId: z.string().min(1).optional(),
  channel: customerMemoryChannelSchema,
  sourceRefId: z.string().optional(),
  rawText: z.string().min(1),
  speaker: z.string().optional(),
  timestamp: z.string().optional(),
});
export type InteractionExtractionInput = z.infer<typeof interactionExtractionInputSchema>;

export const customerMemoryContextSchema = z.object({
  organizationId: z.string().min(1),
  targetId: z.string(),
  targetType: z.enum(["lead", "customer"]),
  verifiedFacts: z.array(z.string()),
  customerStatements: z.array(z.string()),
  preferences: z.array(z.string()),
  activeObjections: z.array(z.string()),
  recentSummaries: z.array(z.string()),
  timeline: z.array(
    z.object({
      id: z.string(),
      memoryType: customerMemoryTypeSchema,
      content: z.string(),
      sourceChannel: customerMemoryChannelSchema,
      timestamp: z.string(),
      confidence: z.number(),
    })
  ),
  recommendedNegotiationAngle: z.string().optional(),
});
export type CustomerMemoryContext = z.infer<typeof customerMemoryContextSchema>;
