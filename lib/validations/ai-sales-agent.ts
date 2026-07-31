import { z } from "zod";

import { CURRENCY_CODES } from "@/lib/constants";
import type { CurrencyCode } from "@/types/crm";

const agentCurrencies = CURRENCY_CODES.map((c) => c.value) as [
  CurrencyCode,
  ...CurrencyCode[],
];

/**
 * Runtime validation for AI Sales Agent structured output.
 *
 * The Gemini provider returns JSON classified by `responseSchema`. Even so,
 * the model CAN drift (incomplete fields, out-of-range scores, fabricated
 * UUIDs). These schemas are the SECOND layer of defense:
 *
 *  - Valid output is persisted + surfaced to the user.
 *  - Invalid output is rejected, NOT executed, NOT fed into an approval.
 *  - The error path returns a high-quality error state (see AISalesAgentError).
 *
 * Sensitive values are bounded: summary lengths capped, reasoning arrays capped,
 * quote unit prices must be non-negative, quantities must be positive, etc.
 */

export const LEAD_PRIORITY_VALUES = ["low", "medium", "high", "urgent"] as const;
export type LeadPriority = (typeof LEAD_PRIORITY_VALUES)[number];

export const FOLLOW_UP_CHANNELS = [
  "email",
  "whatsapp",
  "phone",
  "internal",
] as const;
export type FollowUpChannel = (typeof FOLLOW_UP_CHANNELS)[number];

export const NEXT_BEST_ACTION_MAX_LEN = 600;
export const FOLLOW_UP_MESSAGE_MAX_LEN = 4000;
export const REASONING_ITEMS_MAX = 8;
export const REASONING_ITEM_MAX_LEN = 280;
export const SUMMARY_MAX_LEN = 1200;
export const QUOTE_ITEMS_MAX = 12;

export const aiNextBestActionSchema = z
  .object({
    type: z
      .string()
      .trim()
      .min(1)
      .max(80, "nextBestAction.type too long"),
    description: z
      .string()
      .trim()
      .min(1)
      .max(NEXT_BEST_ACTION_MAX_LEN, "nextBestAction.description too long"),
    dueAt: z.string().trim().max(40).nullable().optional(),
  })
  .strict();

export const aiFollowUpDraftSchema = z
  .object({
    subject: z.string().trim().max(200).nullable().optional(),
    message: z
      .string()
      .trim()
      .min(1)
      .max(FOLLOW_UP_MESSAGE_MAX_LEN, "followUpDraft.message too long"),
    channel: z.enum(FOLLOW_UP_CHANNELS),
  })
  .strict();

export const aiRecommendedProductSchema = z
  .object({
    productId: z.string().trim().min(1).max(120),
    reason: z.string().trim().min(1).max(280),
    quantity: z.coerce.number().positive().max(10_000).optional(),
  })
  .strict();

export const aiQuoteSuggestionItemSchema = z
  .object({
    productId: z.string().trim().min(1).max(120),
    quantity: z.coerce.number().positive().max(10_000),
    unitPrice: z.coerce.number().nonnegative().max(1_000_000_000),
  })
  .strict();

export const aiQuoteSuggestionSchema = z
  .object({
    customerId: z.string().trim().max(120).nullable().optional(),
    leadId: z.string().trim().max(120).nullable().optional(),
    items: z.array(aiQuoteSuggestionItemSchema).min(1).max(QUOTE_ITEMS_MAX),
    discount: z.coerce.number().nonnegative().max(100).optional(),
    tax: z.coerce.number().nonnegative().max(100).optional(),
    validityDays: z.coerce.number().int().positive().max(365).optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

/**
 * Full AI Sales Agent recommendation. Mirrors `AISalesRecommendation` in the
 * project brief. Quote/followUp/products are optional because the agent may
 * decide that not every lead needs a quote today.
 */
export const aiSalesRecommendationSchema = z
  .object({
    summary: z.string().trim().min(1).max(SUMMARY_MAX_LEN),
    leadScore: z.coerce.number().min(0).max(100),
    priority: z.enum(LEAD_PRIORITY_VALUES),
    reasoning: z
      .array(z.string().trim().min(1).max(REASONING_ITEM_MAX_LEN))
      .min(1)
      .max(REASONING_ITEMS_MAX),
    nextBestAction: aiNextBestActionSchema,
    followUpDraft: aiFollowUpDraftSchema.nullable().optional(),
    recommendedProducts: z
      .array(aiRecommendedProductSchema)
      .max(8)
      .nullable()
      .optional(),
    quoteSuggestion: aiQuoteSuggestionSchema.nullable().optional(),
  })
  .strict();

export type AISalesRecommendation = z.output<typeof aiSalesRecommendationSchema>;

/**
 * Gemini `responseSchema` shape. We keep this in a separate constant (not
 * derived from the Zod schema) because the two formats intentionally differ:
 *
 *  - Gemini's schema is a looser superset that allows the model to fill in
 *    optional fields. Zod is then the strict runtime validator.
 *  - We do NOT pass `priority: enum` here because Gemini occasionally emits
 *    the enum value in a different case; the Zod layer catches that and we
 *    surface an invalid-output error instead of silently accepting lowercased
 *    "urgent".
 */
export const aiSalesRecommendationResponseJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    leadScore: { type: "number" },
    priority: { type: "string" },
    reasoning: {
      type: "array",
      items: { type: "string" },
    },
    nextBestAction: {
      type: "object",
      additionalProperties: false,
      properties: {
        type: { type: "string" },
        description: { type: "string" },
        dueAt: { type: "string" },
      },
      required: ["type", "description"],
    },
    followUpDraft: {
      type: "object",
      additionalProperties: false,
      properties: {
        subject: { type: "string" },
        message: { type: "string" },
        channel: { type: "string" },
      },
      required: ["message", "channel"],
    },
    recommendedProducts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          productId: { type: "string" },
          reason: { type: "string" },
          quantity: { type: "number" },
        },
        required: ["productId", "reason"],
      },
    },
    quoteSuggestion: {
      type: "object",
      additionalProperties: false,
      properties: {
        customerId: { type: "string" },
        leadId: { type: "string" },
        items: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              productId: { type: "string" },
              quantity: { type: "number" },
              unitPrice: { type: "number" },
            },
            required: ["productId", "quantity", "unitPrice"],
          },
        },
        discount: { type: "number" },
        tax: { type: "number" },
        validityDays: { type: "number" },
        notes: { type: "string" },
      },
      required: ["items"],
    },
  },
  required: ["summary", "leadScore", "priority", "reasoning", "nextBestAction"],
} as const;

/** Currency normalize helper re-exported for the prompt builder. */
export { agentCurrencies };
export type AgentCurrency = CurrencyCode;
