import { z } from "zod";

export const aiActionSchema = z.object({
  action_type: z.enum([
    "create_lead_draft",
    "create_quote_draft",
    "search_products",
    "request_human_handoff",
    "create_followup",
  ]),
  payload: z.record(z.string(), z.unknown()),
});

export const aiResponseSchema = z.object({
  message: z.string().describe("The conversational response to the user. Do not invent prices or fake data."),
  intent: z.enum(["greeting", "inquiry", "support", "sales", "complaint", "other"]),
  confidence: z.number().min(0).max(1).describe("Confidence score of the intent mapping and action extraction."),
  recommended_product_ids: z.array(z.string().uuid()).optional().describe("UUIDs of products recommended in the message."),
  proposed_actions: z.array(aiActionSchema).optional().describe("Any system actions proposed by the AI to assist the user."),
  handoff_flag: z.boolean().default(false).describe("Set to true if the user explicitly asks for a human or is angry/frustrated."),
});

export type AiAction = z.infer<typeof aiActionSchema>;
export type AiResponse = z.infer<typeof aiResponseSchema>;

export const createLeadDraftPayloadSchema = z.object({
  full_name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  notes: z.string().optional(),
});

export const createQuoteDraftPayloadSchema = z.object({
  lead_id: z.string().uuid().optional(),
  items: z.array(z.object({
    product_id: z.string().uuid(),
    quantity: z.number().positive(),
  })),
  notes: z.string().optional(),
});

export const searchProductsPayloadSchema = z.object({
  query: z.string(),
});

export const requestHumanHandoffPayloadSchema = z.object({
  reason: z.string().min(1),
});

export const createFollowupPayloadSchema = z.object({
  lead_id: z.string().uuid().optional(),
  due_at_iso: z.string().datetime(),
  message_draft: z.string().optional(),
});
