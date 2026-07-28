import { z } from "zod";

export const AGENT_TYPES = [
  "sales",
  "support",
  "operations",
  "reporting",
  "social",
] as const;

export type AgentType = (typeof AGENT_TYPES)[number];

export const aiAgentTypeSchema = z.enum(AGENT_TYPES);

export const allActionTypes = [
  // Sales
  "create_lead_draft",
  "create_quote_draft",
  "search_products",
  "request_human_handoff",
  "create_followup",
  // Cross-agent
  "search_knowledge",
  // Support
  "classify_support_request",
  // Operations
  "track_order",
  "alert_low_stock",
  // Reporting
  "generate_daily_report",
  // Social
  "suggest_content",
  "plan_post_schedule",
  "draft_ad_copy",
] as const;

export const aiActionTypeSchema = z.enum(allActionTypes);

export const aiActionSchema = z.object({
  action_type: aiActionTypeSchema,
  payload: z.record(z.string(), z.unknown()),
});

export const aiResponseSchema = z.object({
  message: z.string().describe("The conversational response to the user. Do not invent prices or fake data."),
  intent: z.string().describe("Free-form intent label produced by the agent (e.g. greeting, inquiry, faq, escalation, report_request, content_brief)."),
  confidence: z.number().min(0).max(1).describe("Confidence score of the intent mapping and action extraction."),
  recommended_product_ids: z.array(z.string().uuid()).optional().describe("UUIDs of products recommended in the message."),
  proposed_actions: z.array(aiActionSchema).optional().describe("Any system actions proposed by the AI to assist the user."),
  handoff_flag: z.boolean().default(false).describe("Set to true if the user explicitly asks for a human or the agent cannot resolve the request."),
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

export const searchKnowledgePayloadSchema = z.object({
  query: z.string().min(1),
});

export const classifySupportRequestPayloadSchema = z.object({
  category: z.enum(["billing", "technical", "account", "security", "general"]),
  severity: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  summary: z.string().min(1),
});

export const trackOrderPayloadSchema = z.object({
  order_reference: z.string().min(1),
});

export const alertLowStockPayloadSchema = z.object({
  product_id: z.string().uuid().optional(),
  product_name: z.string().optional(),
  available_units: z.number().int().nonnegative(),
  threshold: z.number().int().positive().default(5),
});

export const generateDailyReportPayloadSchema = z.object({
  period_start_iso: z.string().datetime().optional(),
  period_end_iso: z.string().datetime().optional(),
  channel: z.enum(["email", "in_app", "chat"]).default("in_app"),
});

export const suggestContentPayloadSchema = z.object({
  platform: z.enum(["linkedin", "twitter", "instagram", "facebook", "blog"]),
  topic: z.string().min(1),
  count: z.number().int().positive().max(10).default(3),
});

export const planPostSchedulePayloadSchema = z.object({
  platform: z.enum(["linkedin", "twitter", "instagram", "facebook", "blog"]),
  slots: z.array(
    z.object({
      publish_at_iso: z.string().datetime(),
      content_hint: z.string().optional(),
    })
  ).min(1),
});

export const draftAdCopyPayloadSchema = z.object({
  platform: z.enum(["linkedin", "twitter", "instagram", "facebook", "google"]),
  product_name: z.string().optional(),
  cta: z.string().optional(),
  variant_count: z.number().int().positive().max(5).default(3),
});
