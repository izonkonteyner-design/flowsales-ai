import { z } from "zod";

/**
 * Per-action payload schemas for AI approvals.
 *
 * The `ai_approvals.payload` column is JSONB and is ONLY trusted after passing
 * through the schema for its declared `action_type` here. The server-side
 * execution layer NEVER persists a generic payload: it always routes a mutation
 * through these validators first. This kills "payload tampering" vectors where
 * a compromised client could include `workspaceId`, `ownerId`, or `actorId`
 * inside the payload to escalate.
 *
 * Convention:
 *   - Only whitelisted field names appear in any payload.
 *   - IDs are accepted as UUID-ish strings; workspace scoping is enforced
 *     SERVER-SIDE against the membership session (the payload never carries it).
 *   - prices are coerced + bounds-checked.
 *   - channel/role/plan are enum-checked.
 */

export const APPROVAL_ACTION_TYPES = [
  "update_lead_stage",
  "update_lead_status",
  "create_next_action",
  "create_quote",
  "create_customer",
  "send_follow_up",
] as const;

export type ApprovalActionType = (typeof APPROVAL_ACTION_TYPES)[number];

const leadStageValues = [
  "new",
  "contacted",
  "qualified",
  "quote_sent",
  "negotiation",
  "won",
  "lost",
] as const;

const leadStatusValues = leadStageValues;

export const updateLeadStagePayloadSchema = z
  .object({
    leadId: z.string().trim().min(1).max(120),
    fromStage: z.enum(leadStageValues).optional(),
    toStage: z.enum(leadStageValues),
  })
  .strict();

export const updateLeadStatusPayloadSchema = z
  .object({
    leadId: z.string().trim().min(1).max(120),
    fromStatus: z.enum(leadStatusValues).optional(),
    toStatus: z.enum(leadStatusValues),
  })
  .strict();

export const createNextActionPayloadSchema = z
  .object({
    leadId: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(160),
    dueAt: z.string().trim().min(1).max(40),
    priority: z.enum(["low", "medium", "high"]).optional(),
    assignedTo: z.string().trim().max(120).nullable().optional(),
  })
  .strict();

export const quoteSuggestionItemSchema = z
  .object({
    productId: z.string().trim().min(1).max(120),
    quantity: z.coerce.number().positive().max(10_000),
    unitPrice: z.coerce.number().nonnegative().max(1_000_000_000),
  })
  .strict();

export const createQuotePayloadSchema = z
  .object({
    leadId: z.string().trim().max(120).nullable().optional(),
    customerId: z.string().trim().max(120).nullable().optional(),
    items: z.array(quoteSuggestionItemSchema).min(1).max(12),
    discount: z.coerce.number().nonnegative().max(100).optional(),
    tax: z.coerce.number().nonnegative().max(100).optional(),
    validityDays: z.coerce.number().int().positive().max(365).optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict()
  .refine((data) => Boolean(data.leadId ?? data.customerId), {
    message: "create_quote requires a leadId or customerId",
  });

export const createCustomerPayloadSchema = z
  .object({
    fullName: z.string().trim().min(1).max(160),
    company: z.string().trim().max(160).nullable().optional(),
    email: z.string().trim().max(200).nullable().optional(),
    phone: z.string().trim().max(80).nullable().optional(),
    city: z.string().trim().max(120).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    /** Optional leadId to record the conversion lineage. */
    sourceLeadId: z.string().trim().max(120).nullable().optional(),
  })
  .strict();

export const sendFollowUpPayloadSchema = z
  .object({
    leadId: z.string().trim().min(1).max(120),
    channel: z.enum(["email", "whatsapp", "phone", "internal"]),
    subject: z.string().trim().max(200).nullable().optional(),
    message: z.string().trim().min(1).max(4000),
    /** When the user proposes to send it (preview only; scheduler comes later). */
    scheduledFor: z.string().trim().max(40).nullable().optional(),
  })
  .strict();

/**
 * Discriminated-union discriminator: actionType -> schema.
 * Use `parseApprovalPayload(actionType, payload)` to get a validated, typed
 * value before touching any database write.
 */
export const approvalPayloadSchemas = {
  update_lead_stage: updateLeadStagePayloadSchema,
  update_lead_status: updateLeadStatusPayloadSchema,
  create_next_action: createNextActionPayloadSchema,
  create_quote: createQuotePayloadSchema,
  create_customer: createCustomerPayloadSchema,
  send_follow_up: sendFollowUpPayloadSchema,
} as const satisfies Record<ApprovalActionType, z.ZodTypeAny>;

export type ApprovalPayloadOf<T extends ApprovalActionType> = z.output<
  (typeof approvalPayloadSchemas)[T]
>;

export class ApprovalPayloadValidationError extends Error {
  code = "invalid_payload" as const;
  status = 400;
  issues: z.ZodIssue[];
  constructor(issues: z.ZodIssue[]) {
    super("Approval payload validation failed.");
    this.name = "ApprovalPayloadValidationError";
    this.issues = issues;
  }
}

/**
 * Validate an incoming approval payload against its action-specific schema.
 * Server-only; throw on invalid. Callers must `try/catch` and convert to a
 * web-safe `400` response; never leak Zod issues verbatim to UI in production.
 */
export function parseApprovalPayload<T extends ApprovalActionType>(
  actionType: T,
  payload: unknown,
): ApprovalPayloadOf<T> {
  const schema = approvalPayloadSchemas[actionType];
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new ApprovalPayloadValidationError(result.error.issues);
  }
  return result.data as ApprovalPayloadOf<T>;
}
