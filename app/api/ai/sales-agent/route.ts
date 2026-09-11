import { NextResponse } from "next/server";

import {
  assertCanManage,
  assertNoCrossWorkspaceKeys,
  DemoMutationDeniedError,
  isAuthError,
  PermissionDeniedError,
  PayloadTamperingError,
} from "@/server/services/server-auth";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import { getGeminiModel, hasGeminiConfig } from "@/server/services/ai";
import {
  AiSalesAgentServiceError,
  generateAiSalesAgentRecommendation,
  getAiSalesAgentPublicErrorMessage,
  type AiSalesAgentErrorCode,
  type AiSalesAgentLeadInput,
} from "@/server/services/ai-sales-agent";
import {
  finalizeAiSalesAgentRun,
  reserveAiSalesAgentRun,
} from "@/server/services/ai-runs";
import { getLeadDetailData } from "@/server/services/leads";
import { resolvePlanState } from "@/lib/entitlements";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * In-flight guard keyed by (userId:leadId). Prevents a double-submit from
 * creating two concurrent Gemini calls for the same lead. The persisted run
 * row is the durable source of truth; this is only the optimistic guard for
 * the latency window before we have a row id.
 */
const inFlight = new Set<string>();

const salesAgentRequestSchema = z
  .object({
    leadId: z.string().trim().min(1).max(120),
    /** Optional workspace-level steering prompt. Server enforces a sane length. */
    workspacePrompt: z.string().trim().max(2000).optional(),
  })
  .strict();

type StatusFor = Record<AiSalesAgentErrorCode, number>;
const statusFor: StatusFor = {
  ai_not_configured: 503,
  unauthorized: 401,
  workspace_access_error: 403,
  usage_limit_reached: 429,
  validation_error: 400,
  concurrent_request: 409,
  temporary_failure: 502,
  invalid_output: 502,
};

function logDiagnostic(event: string, details: Record<string, unknown>) {
  console.error(`[ai-sales-agent-route] ${event}`, details);
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { message: String(error) };
}

export async function POST(request: Request) {
  // Refuse early when the AI provider is not configured, so the page can render
  // a "configuration required" state without wasting a request cycle.
  if (!hasSupabaseConfig() || !hasGeminiConfig()) {
    return NextResponse.json(
      { success: false, message: getAiSalesAgentPublicErrorMessage("ai_not_configured") },
      { status: 503 },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: getAiSalesAgentPublicErrorMessage("validation_error") },
      { status: 400 },
    );
  }

  // Client payloads may never carry workspace/id/role keys.
  try {
    assertNoCrossWorkspaceKeys(rawBody);
  } catch (error) {
    const code: AiSalesAgentErrorCode =
      error instanceof PayloadTamperingError ? "validation_error" : "validation_error";
    return NextResponse.json(
      { success: false, message: getAiSalesAgentPublicErrorMessage(code) },
      { status: 400 },
    );
  }

  const parsed = salesAgentRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: getAiSalesAgentPublicErrorMessage("validation_error") },
      { status: 400 },
    );
  }
  const { leadId, workspacePrompt } = parsed.data;

  // Live workspace + role gate. Demo users reach this endpoint only if they
  // bypass the client guard; we still deny mutations server-side.
  let liveContext: Awaited<ReturnType<typeof import("@/server/services/server-auth").requireLiveMutationContext>>;
  try {
    const { requireLiveMutationContext } = await import("@/server/services/server-auth");
    liveContext = await requireLiveMutationContext();
  } catch (error) {
    if (error instanceof DemoMutationDeniedError) {
      return NextResponse.json(
        { success: false, message: getAiSalesAgentPublicErrorMessage("unauthorized") },
        { status: 401 },
      );
    }
    if (isAuthError(error)) {
      return NextResponse.json(
        { success: false, message: getAiSalesAgentPublicErrorMessage("workspace_access_error") },
        { status: 403 },
      );
    }
    logDiagnostic("auth context failure", { error: serializeError(error) });
    return NextResponse.json(
      { success: false, message: getAiSalesAgentPublicErrorMessage("temporary_failure") },
      { status: 502 },
    );
  }

  try {
    assertCanManage(liveContext.role, "AI Sales Agent runs");
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return NextResponse.json(
        { success: false, message: getAiSalesAgentPublicErrorMessage("workspace_access_error") },
        { status: 403 },
      );
    }
    throw error;
  }

  // Entitlement gate: ai_sales_agent must be enabled on the current plan.
  // We resolve the plan lazily so a misconfigured workspace fails closed.
  const { client, organization, userId } = liveContext;
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
  if (!planState.entitlement.features.ai_sales_agent) {
    return NextResponse.json(
      { success: false, message: getAiSalesAgentPublicErrorMessage("workspace_access_error") },
      { status: 403 },
    );
  }

  // Concurrent-request optimistic guard.
  const requestKey = `${userId}:${leadId}`;
  if (inFlight.has(requestKey)) {
    return NextResponse.json(
      { success: false, message: getAiSalesAgentPublicErrorMessage("concurrent_request") },
      { status: 409 },
    );
  }
  inFlight.add(requestKey);

  let runId: string | null = null;
  let inDemo = false;
  try {
    // Load lead + workspace context BEFORE reserving a run, so a 404 on the
    // lead does NOT decrement the AI budget.
    const leadDetail = await getLeadDetailData(leadId);
    if (!leadDetail.lead) {
      return NextResponse.json(
        { success: false, message: getAiSalesAgentPublicErrorMessage("workspace_access_error") },
        { status: 403 },
      );
    }
    // Cross-workspace defense-in-depth: getLeadDetailData already scopes by
    // org id, but enforce again on the returned row.
    if (leadDetail.lead.organization_id !== organization.id) {
      logDiagnostic("cross-workspace lead access blocked", {
        organizationId: organization.id,
        leadOrgId: leadDetail.lead.organization_id,
        userId,
      });
      return NextResponse.json(
        { success: false, message: getAiSalesAgentPublicErrorMessage("workspace_access_error") },
        { status: 403 },
      );
    }

    // Authorized product catalog for this workspace, loaded directly via the
    // server client (org-scoped). We cap at 40 rows to keep the prompt bounded;
    // the prompt builder caps the rendered catalog again.
    const { data: catalogRows, error: catalogError } = await client
      .from("products")
      .select("id, name, sku, unit, currency, unit_price, base_price")
      .eq("organization_id", organization.id)
      .order("name", { ascending: true })
      .limit(40);
    if (catalogError) {
      logDiagnostic("product catalog load failure", {
        error: serializeError(catalogError),
        organizationId: organization.id,
      });
      return NextResponse.json(
        { success: false, message: getAiSalesAgentPublicErrorMessage("temporary_failure") },
        { status: 502 },
      );
    }
    const products = (catalogRows ?? []) as Array<{
      id: string;
      name: string;
      sku: string | null;
      unit: string | null;
      currency: string;
      unit_price: number | null;
      base_price: number | null;
    }>;

    const reservation = await reserveAiSalesAgentRun(
      { mode: "live", organizationId: organization.id, userId },
      {
        targetLeadId: leadId,
        targetCustomerId: leadDetail.linkedCustomer?.id ?? undefined,
        model: getGeminiModel(),
      },
    );
    runId = reservation.runId;
    inDemo = reservation.inDemo;

    // Load workspace-level AI agent settings (system prompt/temperature), if any.
    let workspacePromptFromSettings: string | null = null;
    let temperature = 0.2;
    try {
      const { data: settings } = await client
        .from("ai_agent_settings")
        .select("system_prompt, temperature")
        .eq("organization_id", organization.id)
        .maybeSingle();
      if (settings?.system_prompt && typeof settings.system_prompt === "string") {
        workspacePromptFromSettings = settings.system_prompt.trim() || null;
      }
      if (typeof settings?.temperature === "number" && Number.isFinite(settings.temperature)) {
        temperature = settings.temperature;
      }
    } catch {
      // Settings are optional; fall back to defaults.
    }

    const recommendation = await generateAiSalesAgentRecommendation(
      {
        lead: leadDetail.lead,
        tasks: leadDetail.tasks,
        activities: leadDetail.activities,
        relatedQuotes: leadDetail.leadQuotes,
        organization,
        availableProducts: products.map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku ?? null,
          unit: p.unit ?? null,
          currency: p.currency as AiSalesAgentLeadInput["availableProducts"][number]["currency"],
          unit_price: p.unit_price ?? null,
          base_price: p.base_price ?? null,
        })),
      },
      {
        temperature,
        workspacePrompt: workspacePrompt?.trim() || workspacePromptFromSettings,
      },
    );

    if (runId) {
      try {
        await finalizeAiSalesAgentRun(
          { mode: "live", organizationId: organization.id, userId },
          runId,
          {
            status: "succeeded",
            validationStatus: "valid",
            output: recommendation,
            tokenTotal: null,
            costEstimate: null,
          },
        );
      } catch (finalizeError) {
        logDiagnostic("run finalization failure", {
          runId,
          error: serializeError(finalizeError),
        });
        // Swallow: the recommendation itself is valid; the row update is best-effort.
      }
    }

    return NextResponse.json({ success: true, recommendation, runId, inDemo });
  } catch (error) {    if (runId) {
      try {
        await finalizeAiSalesAgentRun(
          { mode: "live", organizationId: organization.id, userId },
          runId,
          {
            status: "failed",
            validationStatus:
              error instanceof AiSalesAgentServiceError && error.code === "invalid_output"
                ? "invalid"
                : "error",
            output: null,
            errorCategory:
              error instanceof AiSalesAgentServiceError ? error.code : "temporary_failure",
            errorMessage:
              error instanceof Error ? error.message : getAiSalesAgentPublicErrorMessage("temporary_failure"),
            tokenTotal: null,
            costEstimate: null,
          },
        );
      } catch (finalizeError) {
        logDiagnostic("failed-run finalization error", {
          runId,
          error: serializeError(finalizeError),
        });
      }
    }

    const code =
      error instanceof AiSalesAgentServiceError
        ? error.code
        : error instanceof DemoMutationDeniedError
          ? "unauthorized"
          : isAuthError(error)
            ? "workspace_access_error"
            : "temporary_failure";
    const status =
      error instanceof AiSalesAgentServiceError
        ? error.status
        : statusFor[code];

    logDiagnostic("recommendation generation failure", {
      code,
      status,
      error: serializeError(error),
      leadId,
      userId,
    });

    return NextResponse.json(
      { success: false, message: getAiSalesAgentPublicErrorMessage(code) },
      { status },
    );
  } finally {
    inFlight.delete(requestKey);
  }
}
