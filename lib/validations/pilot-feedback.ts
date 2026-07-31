import { z } from "zod";

/**
 * Pilot feedback form validation.
 *
 * Mirrors the `submit_pilot_feedback(JSONB)` RPC payload shape. The database
 * is the second line of defense (it re-derives `submitted_by` server-side and
 * re-validates score/triggers); this Zod layer guards the transport before it
 * ever reaches Postgres.
 */

export const PILOT_FEEDBACK_ROLES = [
  "founder",
  "sales_lead",
  "sales_rep",
  "ops",
  "consultant",
  "agency",
  "other",
] as const;

export const PILOT_FEEDBACK_TRIGGERS = [
  "demo_completed",
  "ai_recommendation_viewed",
  "quote_reviewed",
  "account_cta",
  "dashboard_cta",
  "manual",
] as const;

export const pilotFeedbackRequestSchema = z
  .object({
    user_role: z.enum(PILOT_FEEDBACK_ROLES).nullable().optional(),
    company_type: z.string().trim().max(120).nullable().optional(),
    trigger_context: z.enum(PILOT_FEEDBACK_TRIGGERS),
    most_used_module: z.string().trim().max(120).nullable().optional(),
    most_useful_feature: z.string().trim().max(280).nullable().optional(),
    most_confusing_area: z.string().trim().max(280).nullable().optional(),
    missing_feature: z.string().trim().max(280).nullable().optional(),
    ai_helpful_score: z.coerce.number().int().min(1).max(5).nullable().optional(),
    weekly_intent: z.boolean().nullable().optional(),
    purchase_intent: z.boolean().nullable().optional(),
    price_range_min: z.coerce.number().nonnegative().max(10_000_000).nullable().optional(),
    price_range_max: z.coerce.number().nonnegative().max(10_000_000).nullable().optional(),
    biggest_blocker: z.string().trim().max(280).nullable().optional(),
    score: z.coerce.number().int().min(1).max(5),
    comment: z.string().trim().max(4000).nullable().optional(),
    is_demo: z.boolean().optional(),
  })
  .strict()
  .refine(
    (data) =>
      !data.price_range_min ||
      !data.price_range_max ||
      data.price_range_max >= data.price_range_min,
    { message: "price_range_max must be >= price_range_min", path: ["price_range_max"] },
  );

export type PilotFeedbackRequest = z.output<typeof pilotFeedbackRequestSchema>;
