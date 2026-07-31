/**
 * Type definitions for AI Sales Agent runs and approvals.
 *
 * Server-side serialization happens in `server/services/ai-runs.ts` /
 * `server/services/approvals.ts`; these TS types live in `types/` so they can
 * be imported safely from both server and client components without pulling
 * the service module's `"server-only"` guard.
 */

export type AiRunFeature = "quote_draft" | "sales_agent" | "manager_brief";

export type AiRunStatus = "pending" | "succeeded" | "failed";
export type AiRunValidationStatus = "valid" | "invalid" | "error";

export type AiRunRow = {
  id: string;
  organization_id: string;
  user_id: string | null;
  feature: AiRunFeature;
  provider: string | null;
  model: string | null;
  status: AiRunStatus;
  target_lead_id: string | null;
  target_customer_id: string | null;
  target_quote_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  output: unknown;
  validation_status: AiRunValidationStatus | null;
  error_category: string | null;
  error_message: string | null;
  prompt_version: string | null;
  context_version: string | null;
  token_total: number | null;
  cost_estimate: number | null;
  created_at: string;
};

export type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "executed"
  | "failed"
  | "expired";

export type ApprovalActionType =
  | "update_lead_stage"
  | "update_lead_status"
  | "create_next_action"
  | "create_quote"
  | "create_customer"
  | "send_follow_up";

export type ApprovalRow = {
  id: string;
  organization_id: string;
  ai_run_id: string;
  requested_by: string;
  reviewed_by: string | null;
  action_type: ApprovalActionType;
  payload: Record<string, unknown>;
  status: ApprovalStatus;
  review_note: string | null;
  idempotency_key: string | null;
  requested_at: string;
  reviewed_at: string | null;
  executed_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Slimmed projection for list views (no payload, light metadata). */
export type ApprovalSummary = {
  id: string;
  ai_run_id: string;
  action_type: ApprovalActionType;
  status: ApprovalStatus;
  requested_at: string;
  reviewed_at: string | null;
  executed_at: string | null;
  reviewer_label: string | null;
  requested_by_label: string;
  target_lead_id: string | null;
  target_customer_id: string | null;
  target_quote_id: string | null;
};
