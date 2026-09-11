import { NextResponse } from "next/server";
import { z } from "zod";

import {
  assertCanManage,
  assertNoCrossWorkspaceKeys,
  DemoMutationDeniedError,
  isAuthError,
  PermissionDeniedError,
} from "@/server/services/server-auth";
import { resolvePlanState } from "@/lib/entitlements";
import {
  APPROVAL_ACTION_TYPES,
  parseApprovalPayload,
  ApprovalPayloadValidationError,
  type ApprovalActionType,
} from "@/lib/validations/approval-payloads";
import {
  ApprovalServiceError,
  approveApproval,
  createApprovalRequests,
  finalizeApprovalExecution,
  getApprovalPublicErrorMessage,
  listApprovalSummaries,
  rejectApproval,
  type ApprovalErrorCode,
} from "@/server/services/approvals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StatusFor = Record<ApprovalErrorCode, number>;
const statusFor: StatusFor = {
  unauthorized: 401,
  workspace_access_error: 403,
  validation_error: 400,
  not_found: 404,
  already_terminal: 409,
  temporary_failure: 502,
};

function logDiagnostic(event: string, details: Record<string, unknown>) {
  console.error(`[ai-approvals-route] ${event}`, details);
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { message: String(error) };
}

// ---------------------------------------------------------------------------
// POST: create one or more pending approval requests for a given AI run.
//
// The caller is the UI flow that just received a recommendation from
// /api/ai/sales-agent. The recommendation itself is NOT re-trusted here —
// the client must send an explicit `proposals` array. Each proposal is
// independently schema-validated via parseApprovalPayload BEFORE insert, so
// the JSONB column only ever holds a conforming shape. Workspace isolation +
// requested_by are derived from the session, never the body.
// ---------------------------------------------------------------------------

const proposalSchema = z
  .object({
    actionType: z.enum(APPROVAL_ACTION_TYPES),
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();

const createApprovalsRequestSchema = z
  .object({
    aiRunId: z.string().trim().min(1).max(120),
    leadId: z.string().trim().min(1).max(120),
    proposals: z.array(proposalSchema).min(1).max(6),
  })
  .strict();

export async function POST(request: Request) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: getApprovalPublicErrorMessage("validation_error") },
      { status: 400 },
    );
  }

  // No client payload may carry workspace/role/user id keys.
  try {
    assertNoCrossWorkspaceKeys(rawBody);
  } catch {
    return NextResponse.json(
      { success: false, message: getApprovalPublicErrorMessage("validation_error") },
      { status: 400 },
    );
  }

  const parsed = createApprovalsRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: getApprovalPublicErrorMessage("validation_error") },
      { status: 400 },
    );
  }
  const { aiRunId, leadId, proposals } = parsed.data;

  let liveContext: Awaited<
    ReturnType<typeof import("@/server/services/server-auth").requireLiveMutationContext>
  >;
  try {
    const { requireLiveMutationContext } = await import("@/server/services/server-auth");
    liveContext = await requireLiveMutationContext();
  } catch (error) {
    if (error instanceof DemoMutationDeniedError) {
      return NextResponse.json(
        { success: false, message: getApprovalPublicErrorMessage("unauthorized") },
        { status: 401 },
      );
    }
    if (isAuthError(error)) {
      return NextResponse.json(
        { success: false, message: getApprovalPublicErrorMessage("workspace_access_error") },
        { status: 403 },
      );
    }
    logDiagnostic("auth context failure", { error: serializeError(error) });
    return NextResponse.json(
      { success: false, message: getApprovalPublicErrorMessage("temporary_failure") },
      { status: 502 },
    );
  }

  try {
    assertCanManage(liveContext.role, "create approval requests");
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return NextResponse.json(
        { success: false, message: getApprovalPublicErrorMessage("workspace_access_error") },
        { status: 403 },
      );
    }
    throw error;
  }

  const { client, organization, userId } = liveContext;

  // Entitlement gate: ai_approvals must be enabled on the plan.
  const { data: subscription } = await client
    .from("subscriptions")
    .select("plan, status, trial_started_at, trial_ends_at, trial_converted_at, current_period_end")
    .eq("organization_id", organization.id)
    .maybeSingle();

  const planState = resolvePlanState(
    subscription
      ? {
          plan: subscription.plan as string,
          status: subscription.status as string | null,
          trial_started_at: subscription.trial_started_at as string | null,
          trial_ends_at: subscription.trial_ends_at as string | null,
          trial_converted_at: subscription.trial_converted_at as string | null,
          current_period_end: subscription.current_period_end as string | null,
        }
      : null,
    organization.id,
  );
  if (!planState.entitlement.features.ai_approvals) {
    return NextResponse.json(
      { success: false, message: getApprovalPublicErrorMessage("workspace_access_error") },
      { status: 403 },
    );
  }

  // Cross-check that the ai_run belongs to this workspace AND targets the
  // supplied lead. RLS already scopes reads, but we re-check explicitly so a
  // typo'd run id can't be used to attach approvals to a lead silently.
  const { data: runRow, error: runErr } = await client
    .from("ai_usage_events")
    .select("id, organization_id, target_lead_id, feature, status")
    .eq("id", aiRunId)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (runErr || !runRow) {
    logDiagnostic("ai_run lookup failure", {
      error: serializeError(runErr),
      aiRunId,
      organizationId: organization.id,
    });
    return NextResponse.json(
      { success: false, message: getApprovalPublicErrorMessage("not_found") },
      { status: 404 },
    );
  }
  if (runRow.target_lead_id && runRow.target_lead_id !== leadId) {
    logDiagnostic("ai_run lead mismatch", {
      aiRunId,
      runTargetLeadId: runRow.target_lead_id,
      payloadLeadId: leadId,
    });
    return NextResponse.json(
      { success: false, message: getApprovalPublicErrorMessage("validation_error") },
      { status: 400 },
    );
  }

  // Pre-validate every proposal payload through the action-specific schema.
  // We do this BEFORE insert so a single bad proposal fails the whole request
  // atomically rather than leaving partial rows behind.
  const preparedProposals: Array<{ actionType: ApprovalActionType; payload: ReturnType<typeof parseApprovalPayload<ApprovalActionType>> }> = [];
  for (const proposal of proposals) {
    try {
      const validated = parseApprovalPayload(proposal.actionType, proposal.payload);
      preparedProposals.push({ actionType: proposal.actionType, payload: validated });
    } catch (validationError) {
      if (validationError instanceof ApprovalPayloadValidationError) {
        logDiagnostic("proposal payload validation rejected", {
          actionType: proposal.actionType,
          issues: validationError.issues.map((i) => i.path.join(".")),
        });
      }
      return NextResponse.json(
        { success: false, message: getApprovalPublicErrorMessage("validation_error") },
        { status: 400 },
      );
    }
  }

  // De-duplicate proposals by actionType within the same request so the UI
  // can't enqueue two create_quote rows for one run.
  const seenActionTypes = new Set<ApprovalActionType>();
  for (const p of preparedProposals) {
    if (seenActionTypes.has(p.actionType)) {
      return NextResponse.json(
        { success: false, message: getApprovalPublicErrorMessage("validation_error") },
        { status: 400 },
      );
    }
    seenActionTypes.add(p.actionType);
  }

  try {
    const rows = await createApprovalRequests(
      { mode: "live", organizationId: organization.id, userId },
      {
        aiRunId,
        // Forward the already-validated proposals. The service re-validates
        // each payload via parseApprovalPayload — by design: the JSONB column
        // is the trust boundary and the service is the only writer.
        proposals: preparedProposals.map((p) => ({
          actionType: p.actionType,
          payload: p.payload as Record<string, unknown>,
        })),
      },
    );

    return NextResponse.json({ success: true, approvals: rows });
  } catch (error) {
    if (error instanceof ApprovalServiceError) {
      logDiagnostic("createApprovalRequests failure", {
        code: error.code,
        error: serializeError(error),
        aiRunId,
        organizationId: organization.id,
      });
      return NextResponse.json(
        { success: false, message: getApprovalPublicErrorMessage(error.code) },
        { status: statusFor[error.code] },
      );
    }
    logDiagnostic("createApprovalRequests unexpected failure", {
      error: serializeError(error),
      aiRunId,
    });
    return NextResponse.json(
      { success: false, message: getApprovalPublicErrorMessage("temporary_failure") },
      { status: 502 },
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH: review (approve / reject) or finalize an approval.
// ---------------------------------------------------------------------------

const reviewSchema = z
  .object({
    approvalId: z.string().trim().min(1).max(120),
    decision: z.enum(["approve", "reject", "finalize_executed", "finalize_failed"]),
    reviewNote: z.string().trim().max(2000).nullable().optional(),
    executionError: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

export async function PATCH(request: Request) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: getApprovalPublicErrorMessage("validation_error") },
      { status: 400 },
    );
  }

  try {
    assertNoCrossWorkspaceKeys(rawBody);
  } catch {
    return NextResponse.json(
      { success: false, message: getApprovalPublicErrorMessage("validation_error") },
      { status: 400 },
    );
  }

  const parsed = reviewSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: getApprovalPublicErrorMessage("validation_error") },
      { status: 400 },
    );
  }
  const { approvalId, decision, reviewNote, executionError } = parsed.data;

  let liveContext: Awaited<
    ReturnType<typeof import("@/server/services/server-auth").requireLiveMutationContext>
  >;
  try {
    const { requireLiveMutationContext } = await import("@/server/services/server-auth");
    liveContext = await requireLiveMutationContext();
  } catch (error) {
    if (error instanceof DemoMutationDeniedError) {
      return NextResponse.json(
        { success: false, message: getApprovalPublicErrorMessage("unauthorized") },
        { status: 401 },
      );
    }
    if (isAuthError(error)) {
      return NextResponse.json(
        { success: false, message: getApprovalPublicErrorMessage("workspace_access_error") },
        { status: 403 },
      );
    }
    logDiagnostic("auth context failure", { error: serializeError(error) });
    return NextResponse.json(
      { success: false, message: getApprovalPublicErrorMessage("temporary_failure") },
      { status: 502 },
    );
  }

  try {
    assertCanManage(liveContext.role, "review approval requests");
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return NextResponse.json(
        { success: false, message: getApprovalPublicErrorMessage("workspace_access_error") },
        { status: 403 },
      );
    }
    throw error;
  }

  const { client, organization, userId } = liveContext;

  // Entitlement gate consistent with POST.
  const { data: subscription } = await client
    .from("subscriptions")
    .select("plan, status, trial_started_at, trial_ends_at, trial_converted_at, current_period_end")
    .eq("organization_id", organization.id)
    .maybeSingle();

  const planState = resolvePlanState(
    subscription
      ? {
          plan: subscription.plan as string,
          status: subscription.status as string | null,
          trial_started_at: subscription.trial_started_at as string | null,
          trial_ends_at: subscription.trial_ends_at as string | null,
          trial_converted_at: subscription.trial_converted_at as string | null,
          current_period_end: subscription.current_period_end as string | null,
        }
      : null,
    organization.id,
  );
  if (!planState.entitlement.features.ai_approvals) {
    return NextResponse.json(
      { success: false, message: getApprovalPublicErrorMessage("workspace_access_error") },
      { status: 403 },
    );
  }

  // Defense-in-depth: confirm approval row belongs to this workspace before
  // invoking the RPC. The SECURITY DEFINER RPC re-checks has_org_role, but
  // a 404 from our side (vs a 403 from the RPC) is clearer for the client
  // and avoids leaking the existence of a foreign-workspace approval id.
  const { data: approvalRow, error: approvalErr } = await client
    .from("ai_approvals")
    .select("id, organization_id, status, action_type")
    .eq("id", approvalId)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (approvalErr || !approvalRow) {
    return NextResponse.json(
      { success: false, message: getApprovalPublicErrorMessage("not_found") },
      { status: 404 },
    );
  }

  const ctx = { mode: "live" as const, organizationId: organization.id, userId };

  try {
    switch (decision) {
      case "approve": {
        const result = await approveApproval(ctx, approvalId, { reviewNote });
        return NextResponse.json({ success: true, idempotencyKey: result.idempotencyKey, alreadyApproved: result.alreadyApproved });
      }
      case "reject": {
        await rejectApproval(ctx, approvalId, { reviewNote });
        return NextResponse.json({ success: true });
      }
      case "finalize_executed": {
        await finalizeApprovalExecution(ctx, approvalId, { status: "executed" });
        return NextResponse.json({ success: true });
      }
      case "finalize_failed": {
        await finalizeApprovalExecution(ctx, approvalId, {
          status: "failed",
          executionError: executionError ?? null,
        });
        return NextResponse.json({ success: true });
      }
      // Unreachable: zod enum already constrained `decision`.
      default: {
        return NextResponse.json(
          { success: false, message: getApprovalPublicErrorMessage("validation_error") },
          { status: 400 },
        );
      }
    }
  } catch (error) {
    if (error instanceof ApprovalServiceError) {
      logDiagnostic("approval lifecycle failure", {
        code: error.code,
        decision,
        approvalId,
        organizationId: organization.id,
      });
      return NextResponse.json(
        { success: false, message: getApprovalPublicErrorMessage(error.code) },
        { status: statusFor[error.code] },
      );
    }
    logDiagnostic("approval lifecycle unexpected failure", {
      error: serializeError(error),
      decision,
      approvalId,
    });
    return NextResponse.json(
      { success: false, message: getApprovalPublicErrorMessage("temporary_failure") },
      { status: 502 },
    );
  }
}

// ---------------------------------------------------------------------------
// GET: approvals timeline for the workspace.
// ---------------------------------------------------------------------------

const getQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().max(1000).default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict();

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = getQuerySchema.safeParse({
    page: url.searchParams.get("page") ?? undefined,
    pageSize: url.searchParams.get("pageSize") ?? undefined,
  });
  if (!query.success) {
    return NextResponse.json(
      { success: false, message: getApprovalPublicErrorMessage("validation_error") },
      { status: 400 },
    );
  }
  const { page, pageSize } = query.data;

  let liveContext: Awaited<
    ReturnType<typeof import("@/server/services/server-auth").requireLiveMutationContext>
  >;
  try {
    const { requireLiveMutationContext } = await import("@/server/services/server-auth");
    liveContext = await requireLiveMutationContext();
  } catch (error) {
    if (error instanceof DemoMutationDeniedError) {
      return NextResponse.json(
        { success: false, message: getApprovalPublicErrorMessage("unauthorized") },
        { status: 401 },
      );
    }
    if (isAuthError(error)) {
      return NextResponse.json(
        { success: false, message: getApprovalPublicErrorMessage("workspace_access_error") },
        { status: 403 },
      );
    }
    logDiagnostic("auth context failure", { error: serializeError(error) });
    return NextResponse.json(
      { success: false, message: getApprovalPublicErrorMessage("temporary_failure") },
      { status: 502 },
    );
  }

  try {
    assertCanManage(liveContext.role, "view approval requests");
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return NextResponse.json(
        { success: false, message: getApprovalPublicErrorMessage("workspace_access_error") },
        { status: 403 },
      );
    }
    throw error;
  }

  const { organization, userId } = liveContext;

  try {
    const result = await listApprovalSummaries(
      { mode: "live", organizationId: organization.id, userId },
      page,
      pageSize,
    );
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof ApprovalServiceError) {
      return NextResponse.json(
        { success: false, message: getApprovalPublicErrorMessage(error.code) },
        { status: statusFor[error.code] },
      );
    }
    logDiagnostic("listApprovalSummaries unexpected failure", {
      error: serializeError(error),
      organizationId: organization.id,
    });
    return NextResponse.json(
      { success: false, message: getApprovalPublicErrorMessage("temporary_failure") },
      { status: 502 },
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
