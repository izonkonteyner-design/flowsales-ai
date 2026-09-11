import {
  APPROVAL_ACTION_TYPES,
  type ApprovalActionType,
} from "@/lib/validations/approval-payloads";

/**
 * Pure, server-only-free helpers for the AI approvals lifecycle.
 *
 * Kept separate from `server/services/approvals.ts` so unit tests can import
 * them without pulling the `"server-only"` guard (mirrors the split between
 * `lib/validations/ai-sales-agent.ts` and `server/services/ai-sales-agent.ts`).
 *
 * The only piece that MUST run on the server is the persistence / RPC layer;
 * deriving proposed actions from a recommendation is a pure transform that
 * should be unit-testable in isolation.
 */

/**
 * A single proposed action derived from an `AISalesRecommendation`. We keep
 * the mapping logic explicit (not auto-derived from JSON keys) so adding a
 * new action type is a deliberate change: schema + route + tests must move
 * together. Returns at most one row per action_type to avoid duplicates.
 *
 * Convention:
 *   - `create_quote`    <- recommendation.quoteSuggestion (when present)
 *   - `send_follow_up`  <- recommendation.followUpDraft (when present)
 *
 * `nextBestAction` is intentionally NOT auto-mapped to `create_next_action`:
 * the brief describes it as advisory, and its freeform `type` string is not a
 * trusted task title. The UI lets a human promote it to a real action via the
 * approval route with an explicit `create_next_action` payload.
 */
export function deriveProposedActionsFromRecommendation(
  recommendation: {
    quoteSuggestion?: {
      leadId?: string | null;
      customerId?: string | null;
      items: { productId: string; quantity: number; unitPrice: number }[];
      discount?: number;
      tax?: number;
      validityDays?: number;
      notes?: string | null;
    } | null;
    followUpDraft?: {
      subject?: string | null;
      message: string;
      channel: "email" | "whatsapp" | "phone" | "internal";
    } | null;
  },
  leadId: string,
): Array<{ actionType: ApprovalActionType; payload: Record<string, unknown> }> {
  const proposals: Array<{ actionType: ApprovalActionType; payload: Record<string, unknown> }> = [];

  if (recommendation.quoteSuggestion && recommendation.quoteSuggestion.items.length > 0) {
    const q = recommendation.quoteSuggestion;
    proposals.push({
      actionType: "create_quote",
      payload: {
        leadId: q.leadId ?? leadId,
        customerId: q.customerId ?? null,
        items: q.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
        discount: q.discount,
        tax: q.tax,
        validityDays: q.validityDays,
        notes: q.notes ?? null,
      },
    });
  }

  if (recommendation.followUpDraft && recommendation.followUpDraft.message.trim()) {
    const f = recommendation.followUpDraft;
    proposals.push({
      actionType: "send_follow_up",
      payload: {
        leadId,
        channel: f.channel,
        subject: f.subject ?? null,
        message: f.message,
      },
    });
  }

  return proposals;
}

export { APPROVAL_ACTION_TYPES };
export type { ApprovalActionType };
