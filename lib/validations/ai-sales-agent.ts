import { z } from "zod";

import { CURRENCY_CODES } from "@/lib/constants";
import type { Activity, CurrencyCode, Lead, Organization, Task } from "@/types/crm";

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

// ---------------------------------------------------------------------------
// Prompt builder + output parser (testable, server-only-free).
//
// Kept here rather than `server/services/ai-sales-agent.ts` so unit tests can
// import the prompt builder and parser without pulling the `"server-only"`
// guard. The server service re-exports these via `generateAiSalesAgentRecommendation`.
// ---------------------------------------------------------------------------

/**
 * Slim projection of a related quote used to seed the prompt. Defined locally
 * so the prompt builder doesn't pull `server/services/*` (this file is
 * imported by client components and unit tests). Mirrors `RelatedQuoteSummary`
 * from `server/services/crm-integration`.
 */
type RelatedQuoteSummaryInput = {
  id: string;
  quote_number: string;
  status: string;
  issue_date: string;
  currency: CurrencyCode;
  grand_total: number;
  total: number;
  lead_id: string | null;
  customer_id: string | null;
};

export type AiSalesAgentLeadInput = {
  lead: Pick<
    Lead,
    | "id"
    | "full_name"
    | "company"
    | "email"
    | "phone"
    | "city"
    | "source"
    | "status"
    | "estimated_value"
    | "currency"
    | "notes"
    | "next_follow_up_at"
    | "created_at"
  >;
  tasks: Task[];
  activities: Activity[];
  relatedQuotes: RelatedQuoteSummaryInput[];
  organization: Pick<Organization, "name" | "city" | "default_payment_terms" | "default_delivery_terms">;
  availableProducts: {
    id: string;
    name: string;
    sku: string | null;
    unit: string | null;
    currency: CurrencyCode;
    unit_price: number | null;
    base_price: number | null;
  }[];
};

export type AiSalesAgentOptions = {
  temperature?: number;
  workspacePrompt?: string | null;
};

export type AiSalesAgentErrorCode =
  | "ai_not_configured"
  | "unauthorized"
  | "workspace_access_error"
  | "usage_limit_reached"
  | "validation_error"
  | "concurrent_request"
  | "temporary_failure"
  | "invalid_output";

export const aiSalesAgentErrorMessages: Record<AiSalesAgentErrorCode, string> = {
  ai_not_configured: "AI is not configured. Set the required environment variables to enable the sales agent.",
  unauthorized: "You must be signed in to run the AI Sales Agent.",
  workspace_access_error: "We couldn't verify access to this lead in your workspace.",
  usage_limit_reached: "You've reached your AI run budget for this billing cycle.",
  validation_error: "That request didn't pass validation. Please review and try again.",
  concurrent_request: "An analysis for this lead is already in flight.",
  temporary_failure: "The AI service is temporarily unavailable. Please try again.",
  invalid_output: "The AI returned an unexpected response that couldn't be validated.",
};

export function getAiSalesAgentPublicErrorMessage(code: AiSalesAgentErrorCode): string {
  return aiSalesAgentErrorMessages[code];
}

export class AiSalesAgentServiceError extends Error {
  code: AiSalesAgentErrorCode;
  status: number;
  constructor(code: AiSalesAgentErrorCode, status: number) {
    super(getAiSalesAgentPublicErrorMessage(code));
    this.name = "AiSalesAgentServiceError";
    this.code = code;
    this.status = status;
  }
}

function asOptionalString(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function formatCurrency(value: number, currency: string): string {
  return `${Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${currency}`;
}

/**
 * Build the prompt. We deliberately feed ONLY workspace-authoritative data:
 * the lead row + tasks + activities + the related-quote history + the
 * authorized product catalog. The model must NOT invent ids/prices — those
 * constraints are repeated in the prompt and enforced again by Zod.
 */
export function buildAiSalesAgentPrompt(input: AiSalesAgentLeadInput, options: AiSalesAgentOptions = {}): string {
  const { lead, tasks, activities, relatedQuotes, organization, availableProducts } = input;

  const lines: string[] = [];
  lines.push("You are FlowSales AI, a senior sales assistant embedded in a CRM.");
  lines.push("Analyze the lead below and return a STRICT JSON recommendation.");
  lines.push("");
  lines.push("Hard rules:");
  lines.push("- Never invent prices: only quote `quoteSuggestion.items.unitPrice` values that are justified from the catalog or the lead's prior quotes.");
  lines.push("- `recommendedProducts[].productId` and `quoteSuggestion.items[].productId` MUST be one of the catalog product ids listed below.");
  lines.push("- `leadScore` is a 0-100 number with higher = more likely to convert.");
  lines.push("- `priority` must be one of: low, medium, high, urgent.");
  lines.push("- `nextBestAction.description` should be a concrete, bounded next step in <= 600 chars.");
  lines.push("- If no follow-up is appropriate, omit `followUpDraft`. If no products are relevant, omit `recommendedProducts`. If no quote is justified, omit `quoteSuggestion`.");
  lines.push("- Output JSON only. No markdown, no commentary.");
  lines.push("");

  if (options.workspacePrompt && options.workspacePrompt.trim()) {
    lines.push("Workspace system prompt (organization-specific guidance):");
    lines.push(options.workspacePrompt.trim());
    lines.push("");
  }

  lines.push(`Organization: ${organization.name}${organization.city ? ` (${organization.city})` : ""}`);
  if (organization.default_payment_terms || organization.default_delivery_terms) {
    lines.push(
      `Terms: payment=${organization.default_payment_terms ?? "n/a"}, delivery=${organization.default_delivery_terms ?? "n/a"}`,
    );
  }
  lines.push("");

  lines.push("Lead:");
  lines.push(`- id: ${lead.id}`);
  lines.push(`- name: ${lead.full_name}`);
  lines.push(`- company: ${lead.company || "n/a"}`);
  lines.push(`- email: ${lead.email || "n/a"}`);
  lines.push(`- phone: ${lead.phone || "n/a"}`);
  lines.push(`- city: ${lead.city || "n/a"}`);
  lines.push(`- source: ${lead.source}`);
  lines.push(`- stage: ${lead.status}`);
  lines.push(`- estimated_value: ${formatCurrency(lead.estimated_value, lead.currency)}`);
  lines.push(`- next_follow_up_at: ${asOptionalString(lead.next_follow_up_at) ?? "none"}`);
  lines.push(`- created_at: ${lead.created_at}`);
  lines.push(`- notes: ${lead.notes?.trim() ? lead.notes.trim() : "none"}`);
  lines.push("");

  if (tasks.length > 0) {
    lines.push("Open / recent tasks:");
    for (const task of tasks.slice(0, 10)) {
      lines.push(`- [${task.status}] ${task.title} (due ${task.due_at}, priority ${task.priority})`);
    }
    lines.push("");
  }

  if (activities.length > 0) {
    lines.push("Recent activity (newest first):");
    for (const activity of activities.slice(0, 12)) {
      lines.push(`- ${activity.title}${activity.detail ? ` — ${activity.detail}` : ""}`);
    }
    lines.push("");
  }

  if (relatedQuotes.length > 0) {
    lines.push("Related quotes:");
    for (const quote of relatedQuotes.slice(0, 10)) {
      lines.push(
        `- ${quote.quote_number} [${quote.status}] ${formatCurrency(quote.grand_total ?? quote.total, quote.currency)} issued ${quote.issue_date}`,
      );
    }
    lines.push("");
  }

  if (availableProducts.length > 0) {
    lines.push("Authorized catalog (use these product ids only):");
    for (const product of availableProducts.slice(0, 40)) {
      const price = product.unit_price ?? product.base_price;
      lines.push(
        `- id=${product.id} | ${product.name}${product.sku ? ` (sku ${product.sku})` : ""} | unit=${product.unit ?? "n/a"} | price=${price != null ? formatCurrency(price, product.currency) : "n/a"}`,
      );
    }
    lines.push("");
  } else {
    lines.push("Authorized catalog: (empty — do not recommend products or quote suggestions).");
    lines.push("");
  }

  lines.push("Return JSON matching this shape:");
  lines.push("{");
  lines.push("  \"summary\": string (<=1200 chars),");
  lines.push("  \"leadScore\": number 0-100,");
  lines.push("  \"priority\": \"low\" | \"medium\" | \"high\" | \"urgent\",");
  lines.push("  \"reasoning\": string[] (1-8 items, each <=280 chars),");
  lines.push("  \"nextBestAction\": { \"type\": string (<=80), \"description\": string (<=600), \"dueAt\"?: string|null },");
  lines.push("  \"followUpDraft\"?: { \"subject\"?: string|null, \"message\": string (<=4000), \"channel\": \"email\"|\"whatsapp\"|\"phone\"|\"internal\" },");
  lines.push("  \"recommendedProducts\"?: { \"productId\": string, \"reason\": string (<=280), \"quantity\"?: number }[] (<=8),");
  lines.push("  \"quoteSuggestion\"?: { \"customerId\"?: string|null, \"leadId\"?: string|null, \"items\": { \"productId\": string, \"quantity\": number>0, \"unitPrice\": number>=0 }[] (1-12), \"discount\"?: number, \"tax\"?: number, \"validityDays\"?: number, \"notes\"?: string|null }");
  lines.push("}");

  return lines.join("\n");
}

/**
 * Parse a raw Gemini response string into a validated `AISalesRecommendation`.
 * Throws `AiSalesAgentServiceError("invalid_output")` on schema failure so
 * the caller can mark the run as failed WITHOUT leaking the raw model output.
 */
export function parseAiSalesAgentResponse(responseText: string): AISalesRecommendation {
  const trimmed = responseText?.trim();
  if (!trimmed) {
    throw new AiSalesAgentServiceError("invalid_output", 502);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new AiSalesAgentServiceError("invalid_output", 502);
  }

  const result = aiSalesRecommendationSchema.safeParse(parsed);
  if (!result.success) {
    throw new AiSalesAgentServiceError("invalid_output", 502);
  }

  return result.data;
}
