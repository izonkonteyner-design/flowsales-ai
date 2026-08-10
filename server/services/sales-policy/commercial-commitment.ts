import { z } from "zod";

export const salesActionSchema = z.enum([
  "answer_product_question",
  "answer_showroom_question",
  "share_catalog_price",
  "draft_follow_up",
  "schedule_follow_up_task",
  "create_quote_draft",
  "send_customer_message",
  "place_outbound_call",
  "apply_discount",
  "promise_delivery_date",
  "confirm_stock_reservation",
  "accept_order",
  "collect_payment",
]);

export type SalesAction = z.infer<typeof salesActionSchema>;

export const salesPolicyDecisionSchema = z.enum(["allowed", "approval_required", "blocked"]);
export type SalesPolicyDecision = z.infer<typeof salesPolicyDecisionSchema>;

export type SalesPolicyResult = {
  action: SalesAction;
  decision: SalesPolicyDecision;
  reason: string;
};

const ALLOWED_ACTIONS = new Set<SalesAction>([
  "answer_product_question",
  "answer_showroom_question",
  "share_catalog_price",
  "draft_follow_up",
  "schedule_follow_up_task",
  "create_quote_draft",
]);

const APPROVAL_REQUIRED_ACTIONS = new Set<SalesAction>([
  "send_customer_message",
  "place_outbound_call",
  "apply_discount",
]);

const BLOCKED_AUTONOMOUS_ACTIONS = new Set<SalesAction>([
  "promise_delivery_date",
  "confirm_stock_reservation",
  "accept_order",
  "collect_payment",
]);

export function evaluateSalesAction(action: SalesAction): SalesPolicyResult {
  const parsed = salesActionSchema.parse(action);

  if (ALLOWED_ACTIONS.has(parsed)) {
    return { action: parsed, decision: "allowed", reason: "Informational or draft-only action with no customer-binding commitment." };
  }

  if (APPROVAL_REQUIRED_ACTIONS.has(parsed)) {
    return { action: parsed, decision: "approval_required", reason: "Customer-facing or commercial action requires explicit human approval." };
  }

  if (BLOCKED_AUTONOMOUS_ACTIONS.has(parsed)) {
    return { action: parsed, decision: "blocked", reason: "AI may not autonomously make binding delivery, stock, order or payment commitments." };
  }

  return { action: parsed, decision: "blocked", reason: "Unknown commercial risk; fail closed." };
}

export function assertSalesActionAllowed(action: SalesAction) {
  const result = evaluateSalesAction(action);
  if (result.decision !== "allowed") {
    throw new Error(`${result.decision}: ${result.reason}`);
  }
  return result;
}
