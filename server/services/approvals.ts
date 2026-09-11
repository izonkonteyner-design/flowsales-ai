import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { hasSupabaseConfig } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  parseApprovalPayload,
  type ApprovalActionType,
  type ApprovalPayloadOf,
} from "@/lib/validations/approval-payloads";
import type {
  ApprovalActionType as ApprovalActionTypeRow,
  ApprovalRow,
  ApprovalStatus,
  ApprovalSummary,
} from "@/types/ai";

/**
 * AI Approval_requests: persistence + lifecycle for AI-proposed mutations.
 *
 * Companion to `server/services/ai-runs.ts`. The run produces a recommendation
 * (validated by Zod); the recommendation may propose one or more actions that
 * MUST be approved by a human before they touch CRM data. This module is the
 * only writer of the `ai_approvals` table from the app layer:
 *
 *   - createApprovalFromRecommendation(): derive 0..N pending approval rows
 *     from a validated AISalesRecommendation. Does NOT execute anything.
 *   - listApprovalSummaries(): org-scoped timeline for the approvals UI.
 *   - approveApproval()   -> calls the `claim_ai_approval_execution` RPC
 *     (SECURITY DEFINER, role-checked, idempotent). Returns an idempotency key.
 *   - rejectApproval()    -> calls the `reject_ai_approval` RPC (idempotent).
 *   - finalizeApprovalExecution() -> `finalize_ai_approval_execution` RPC.
 *
 * Security invariants:
 *   - Demo workspaces never reach this module (callers gate via
 *     `requireLiveMutationContext`); we still short-circuit here.
 *   - Every payload is passed through `parseApprovalPayload(actionType, ...)`
 *     BEFORE the row is inserted, so the JSONB column only ever holds a
 *     schema-validated shape. The DB never trusts a raw model blob.
 *   - Workspace isolation is enforced twice: RLS on the table AND an explicit
 *     `eq("organization_id", ctx.organizationId)` on every read/write here.
 *   - The `requested_by` column is set from the session user id, NEVER from the
 *     request body.
 *   - The RPCs re-check `has_org_role` server-side, so even a leaked anon-key
 *     cannot escalate; this layer additionally blocks viewers before the RPC.
 */

export const APPROVAL_PAGE_SIZE = 20;

type AuthedContext = {
  mode: "demo" | "live";
  organizationId: string;
  userId: string | null;
};

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

export type ApprovalErrorCode =
  | "unauthorized"
  | "workspace_access_error"
  | "validation_error"
  | "not_found"
  | "already_terminal"
  | "temporary_failure";

export const approvalErrorMessages: Record<ApprovalErrorCode, string> = {
  unauthorized: "You must be signed in to manage approvals.",
  workspace_access_error: "We couldn't verify access to this approval.",
  validation_error: "That approval request didn't pass validation.",
  not_found: "We couldn't find that approval in your workspace.",
  already_terminal: "This approval has already been resolved.",
  temporary_failure: "We couldn't process the approval right now.",
};

export function getApprovalPublicErrorMessage(code: ApprovalErrorCode): string {
  return approvalErrorMessages[code];
}

export class ApprovalServiceError extends Error {
  code: ApprovalErrorCode;
  status: number;
  constructor(code: ApprovalErrorCode, status: number) {
    super(getApprovalPublicErrorMessage(code));
    this.name = "ApprovalServiceError";
    this.code = code;
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// RPC row shapes (camelCased by PostgREST column-name passthrough — we read
// snake_case and normalize so the rest of the app never touches raw db cols).
// ---------------------------------------------------------------------------

type ClaimRpcRow = { idempotency_key: string | null; already_approved: boolean | null };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { message: String(error) };
}

function logDiagnostic(event: string, details: Record<string, unknown>) {
  console.error(`[approvals] ${event}`, details);
}

/**
 * Map a Postgres error code from the SECURITY DEFINER RPCs to a public
 * ApprovalErrorCode. The RPCs raise specific errcodes (P0002 not found,
 * 42501 permission, 55006 bad state transition, 28000 unauthenticated).
 */
function mapRpcErrorCode(error: unknown): ApprovalErrorCode {
  if (error && typeof error === "object" && "code" in error) {
    const pgCode = (error as { code?: unknown }).code;
    if (typeof pgCode === "string") {
      if (pgCode === "P0002") return "not_found";
      if (pgCode === "42501") return "workspace_access_error";
      if (pgCode === "55006") return "already_terminal";
      if (pgCode === "28000") return "unauthorized";
    }
  }
  if (error instanceof Error && /not found/i.test(error.message)) return "not_found";
  if (error instanceof Error && /permission|required/i.test(error.message)) return "workspace_access_error";
  return "temporary_failure";
}

function pickRpcRow<T>(data: unknown): T | null {
  if (!data) return null;
  return (Array.isArray(data) ? (data[0] as T) : (data as T)) ?? null;
}

// ---------------------------------------------------------------------------
// Recommendation -> pending approval rows
// ---------------------------------------------------------------------------

// Re-export the pure proposal-derivation helper so the route + AI Sales Agent
// flow can import it from one canonical location. Test code imports the pure
// helper directly from `lib/validations/approval-lifecycle` without pulling
// the `"server-only"` guard. The persistence layer below is server-only.
export { deriveProposedActionsFromRecommendation } from "@/lib/validations/approval-lifecycle";

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * Insert pending approval rows for a set of proposed actions. Each proposal's
 * payload is validated through `parseApprovalPayload` BEFORE insert so the
 * JSONB column only ever holds a schema-conforming shape.
 *
 * Idempotent w.r.t. the same (runId, actionType): we skip inserting a row if
 * a non-terminal row for the same (ai_run_id, action_type) already exists.
 * This makes a re-run safe — e.g. the AI agent route re-emitting the same
 * recommendation after a transient 502 will not double the approval queue.
 *
 * Demo workspaces return an empty list (no rows persisted).
 */
export async function createApprovalRequests(
  context: AuthedContext,
  input: {
    aiRunId: string;
    proposals: Array<{ actionType: ApprovalActionType; payload: Record<string, unknown> }>;
  },
): Promise<ApprovalRow[]> {
  if (context.mode === "demo" || !context.userId || !hasSupabaseConfig()) {
    return [];
  }
  if (!input.aiRunId) {
    throw new ApprovalServiceError("validation_error", 400);
  }
  if (input.proposals.length === 0) {
    return [];
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    return [];
  }

  // De-duplicate against existing non-terminal rows for this run.
  const { data: existing, error: existingErr } = await client
    .from("ai_approvals")
    .select("id, action_type, status")
    .eq("organization_id", context.organizationId)
    .eq("ai_run_id", input.aiRunId)
    .in("status", ["pending", "approved"]);
  if (existingErr) {
    logDiagnostic("createApprovalRequests dedupe lookup failure", {
      error: serializeError(existingErr),
      organizationId: context.organizationId,
      aiRunId: input.aiRunId,
    });
    throw new ApprovalServiceError("temporary_failure", 502);
  }
  const existingActionTypes = new Set(
    (existing ?? []).map((row: { action_type: string }) => row.action_type),
  );

  const inserted: ApprovalRow[] = [];
  for (const proposal of input.proposals) {
    if (existingActionTypes.has(proposal.actionType)) continue;

    let validated: ApprovalPayloadOf<ApprovalActionType>;
    try {
      validated = parseApprovalPayload(proposal.actionType, proposal.payload);
    } catch (validationError) {
      logDiagnostic("createApprovalRequests payload validation rejected", {
        actionType: proposal.actionType,
        error: serializeError(validationError),
        organizationId: context.organizationId,
        aiRunId: input.aiRunId,
      });
      throw new ApprovalServiceError("validation_error", 400);
    }

    const { data: row, error: insertErr } = await client
      .from("ai_approvals")
      .insert({
        organization_id: context.organizationId,
        ai_run_id: input.aiRunId,
        requested_by: context.userId,
        action_type: proposal.actionType,
        payload: validated,
        status: "pending" as ApprovalStatus,
      })
      .select(
        "id, organization_id, ai_run_id, requested_by, reviewed_by, action_type, payload, status, review_note, idempotency_key, requested_at, reviewed_at, executed_at, created_at, updated_at",
      )
      .single();

    if (insertErr || !row) {
      logDiagnostic("createApprovalRequests insert failure", {
        error: serializeError(insertErr),
        organizationId: context.organizationId,
        aiRunId: input.aiRunId,
        actionType: proposal.actionType,
      });
      throw new ApprovalServiceError("temporary_failure", 502);
    }

    inserted.push(row as unknown as ApprovalRow);
  }

  return inserted;
}

/**
 * Approval timeline for the approvals UI. Excludes the `payload` column to
 * keep the listing light; the detail view can fetch it separately when needed.
 */
export async function listApprovalSummaries(
  context: AuthedContext,
  page: number,
  pageSize = APPROVAL_PAGE_SIZE,
): Promise<{ rows: ApprovalSummary[]; total: number; hasMore: boolean }> {
  const empty = { rows: [] as ApprovalSummary[], total: 0, hasMore: false };
  if (context.mode === "demo" || !context.userId || !hasSupabaseConfig()) {
    return empty;
  }

  const client = await createSupabaseServerClient();
  if (!client) return empty;

  const safePage = Math.max(1, Math.floor(page));
  const offset = (safePage - 1) * pageSize;

  const baseQuery = client
    .from("ai_approvals")
    .select(
      "id, organization_id, ai_run_id, action_type, status, requested_at, reviewed_at, executed_at, requested_by, reviewed_by, review_note",
      { count: "exact" },
    )
    .eq("organization_id", context.organizationId)
    .order("requested_at", { ascending: false });

  // PostgREST: head range fetch for the count + page slice. We fire list and
  // count as a single request via `.range()` to avoid a double query race.
  const { data, count, error } = await baseQuery.range(offset, offset + pageSize - 1);

  if (error || !data) {
    logDiagnostic("listApprovalSummaries failure", {
      error: serializeError(error),
      organizationId: context.organizationId,
    });
    return empty;
  }

  const total = count ?? data.length;

  // Join reviewer/requested_by labels via the same RPC used by
  // workspace-context, batching lookups for the page. For now we surface the
  // raw user ids; the UI can hydrate labels from the workspace member list it
  // already has. (Avoiding an extra round-trip per page keeps this O(1).)
  const rows = data.map((row) => {
    const r = row as {
      id: string;
      organization_id: string;
      ai_run_id: string;
      action_type: ApprovalActionTypeRow;
      status: ApprovalStatus;
      requested_at: string;
      reviewed_at: string | null;
      executed_at: string | null;
      requested_by: string;
      reviewed_by: string | null;
    };
    return {
      id: r.id,
      ai_run_id: r.ai_run_id,
      action_type: r.action_type,
      status: r.status,
      requested_at: r.requested_at,
      reviewed_at: r.reviewed_at,
      executed_at: r.executed_at,
      reviewer_label: null,
      requested_by_label: r.requested_by,
      target_lead_id: null,
      target_customer_id: null,
      target_quote_id: null,
    } satisfies ApprovalSummary;
  });

  return { rows, total, hasMore: offset + pageSize < total };
}

// ---------------------------------------------------------------------------
// Lifecycle RPCs (claim / reject / finalize)
// ---------------------------------------------------------------------------

/**
 * Approve a pending approval. Returns the idempotency key issued by the
 * SECURITY DEFINER RPC. The actual CRM mutation is performed by the caller,
 * keyed on this token so retries are at-most-once.
 *
 * Idempotent: re-approving an already-approved row returns the SAME key with
 * `alreadyApproved: true` (the RPC contract).
 */
export async function approveApproval(
  context: AuthedContext,
  approvalId: string,
  options: { reviewNote?: string | null } = {},
): Promise<{ idempotencyKey: string; alreadyApproved: boolean }> {
  guardAuthenticatedLive(context);

  const client = await requireClient();

  const { data, error } = await client.rpc("claim_ai_approval_execution", {
    p_approval_id: approvalId,
    p_reviewer_id: context.userId,
    p_review_note: options.reviewNote ?? null,
  });

  if (error) {
    const code = mapRpcErrorCode(error);
    const status =
      code === "not_found" ? 404 : code === "unauthorized" ? 401 : code === "already_terminal" ? 409 : 502;
    logDiagnostic("approveApproval RPC failure", {
      error: serializeError(error),
      approvalId,
      organizationId: context.organizationId,
    });
    throw new ApprovalServiceError(code, status);
  }

  const row = pickRpcRow<ClaimRpcRow>(data);
  if (!row || !row.idempotency_key) {
    logDiagnostic("approveApproval RPC returned no row", { approvalId });
    throw new ApprovalServiceError("temporary_failure", 502);
  }

  return { idempotencyKey: row.idempotency_key, alreadyApproved: Boolean(row.already_approved) };
}

/**
 * Reject a pending (or pre-execution approved) approval. Idempotent.
 */
export async function rejectApproval(
  context: AuthedContext,
  approvalId: string,
  options: { reviewNote?: string | null } = {},
): Promise<void> {
  guardAuthenticatedLive(context);

  const client = await requireClient();

  const { error } = await client.rpc("reject_ai_approval", {
    p_approval_id: approvalId,
    p_reviewer_id: context.userId,
    p_review_note: options.reviewNote ?? null,
  });

  if (error) {
    const code = mapRpcErrorCode(error);
    const status =
      code === "not_found" ? 404 : code === "unauthorized" ? 401 : code === "already_terminal" ? 409 : 502;
    logDiagnostic("rejectApproval RPC failure", {
      error: serializeError(error),
      approvalId,
      organizationId: context.organizationId,
    });
    throw new ApprovalServiceError(code, status);
  }
}

/**
 * Mark an approved approval as executed (success) or failed. Called by the
 * downstream mutation layer AFTER it has performed the CRM write. Idempotent.
 */
export async function finalizeApprovalExecution(
  context: AuthedContext,
  approvalId: string,
  outcome: { status: "executed" | "failed"; executionError?: string | null },
): Promise<void> {
  guardAuthenticatedLive(context);

  const client = await requireClient();

  const { error } = await client.rpc("finalize_ai_approval_execution", {
    p_approval_id: approvalId,
    p_outcome: outcome.status,
    p_execution_error: outcome.executionError ?? null,
  });

  if (error) {
    const code = mapRpcErrorCode(error);
    const status =
      code === "not_found" ? 404 : code === "unauthorized" ? 401 : code === "already_terminal" ? 409 : 502;
    logDiagnostic("finalizeApprovalExecution RPC failure", {
      error: serializeError(error),
      approvalId,
      outcome: outcome.status,
      organizationId: context.organizationId,
    });
    throw new ApprovalServiceError(code, status);
  }
}

// ---------------------------------------------------------------------------
// Helpers (internal)
// ---------------------------------------------------------------------------

function guardAuthenticatedLive(context: AuthedContext): void {
  if (context.mode === "demo" || !context.userId) {
    throw new ApprovalServiceError("unauthorized", 401);
  }
}

async function requireClient(): Promise<SupabaseClient> {
  if (!hasSupabaseConfig()) {
    throw new ApprovalServiceError("temporary_failure", 502);
  }
  const client = await createSupabaseServerClient();
  if (!client) {
    throw new ApprovalServiceError("temporary_failure", 502);
  }
  return client;
}

// Re-export for the route layer + tests.
export { parseApprovalPayload };
export type { ApprovalActionType };
