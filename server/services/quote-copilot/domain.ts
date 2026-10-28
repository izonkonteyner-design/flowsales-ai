import { z } from "zod";

export const quoteCopilotDraftInputSchema = z.object({
  organizationId: z.string().min(1),
  leadId: z.string().min(1).optional(),
  customerId: z.string().min(1).optional(),
  projectDescription: z.string().min(1),
  requestedItems: z
    .array(
      z.object({
        name: z.string(),
        quantity: z.number().positive().default(1),
        unit: z.string().default("adet"),
        estimatedUnitPrice: z.number().optional(),
        specifications: z.record(z.string(), z.any()).optional(),
      })
    )
    .optional(),
  targetBudget: z.number().optional(),
  currency: z.string().default("TRY"),
});
export type QuoteCopilotDraftInput = z.input<typeof quoteCopilotDraftInputSchema>;

export const quoteCopilotDraftResultSchema = z.object({
  title: z.string(),
  summary: z.string(),
  items: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      quantity: z.number().positive(),
      unit: z.string(),
      unitPrice: z.number().nonnegative(),
      taxRate: z.number().min(0).max(100).default(20),
      totalPrice: z.number().nonnegative(),
    })
  ),
  subtotal: z.number().nonnegative(),
  taxTotal: z.number().nonnegative(),
  grandTotal: z.number().nonnegative(),
  currency: z.string(),
  estimatedMarginPercent: z.number(),
  maxAuthorizedDiscountPercent: z.number(),
  deliveryTimelineDays: z.number(),
  commercialTerms: z.array(z.string()),
  evidenceNotes: z.array(z.string()),
});
export type QuoteCopilotDraftResult = z.infer<typeof quoteCopilotDraftResultSchema>;

export const negotiationStrategyInputSchema = z.object({
  organizationId: z.string().min(1),
  quoteId: z.string().min(1),
  customerObjection: z.string().min(1),
  currentTotal: z.number().positive(),
  requestedDiscountPercent: z.number().min(0).max(100).optional(),
});
export type NegotiationStrategyInput = z.infer<typeof negotiationStrategyInputSchema>;

export const negotiationStrategyResultSchema = z.object({
  quoteId: z.string().min(1),
  originalTotal: z.number().positive(),
  recommendedAction: z.enum([
    "hold_price_offer_perk",
    "offer_tiered_discount",
    "propose_spec_alternative",
    "require_management_approval",
  ]),
  maxAllowedDiscountPercent: z.number(),
  offeredDiscountPercent: z.number(),
  revisedTotal: z.number().positive(),
  valueAddsProposed: z.array(z.string()),
  suggestedSalesReply: z.string(),
  requiresManagerApproval: z.boolean(),
  reasoning: z.string(),
});
export type NegotiationStrategyResult = z.infer<typeof negotiationStrategyResultSchema>;

export const quoteFollowUpScanResultSchema = z.object({
  quoteId: z.string().min(1),
  quoteNumber: z.string(),
  recipientName: z.string(),
  channel: z.enum(["whatsapp", "email", "sms", "phone"]),
  daysSinceLastActivity: z.number(),
  status: z.string(),
  suggestedFollowUpMessage: z.string(),
  urgency: z.enum(["urgent", "high", "medium", "low"]),
});
export type QuoteFollowUpScanResult = z.infer<typeof quoteFollowUpScanResultSchema>;
