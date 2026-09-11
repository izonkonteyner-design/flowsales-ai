import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AiRunFeature, AiRunRow, AiRunStatus, AiRunValidationStatus } from "@/types/ai";

/**
 * Reads & writes for the `ai_usage_events` table (the unified AI run record).
 *
 * Read paths:
 *   - `listAiRuns(context)` -> timeline of recent AI runs in the workspace.
 *   - `countAiRunsAnalyzedLeads(context, inDays)` -> dashboard exec summary.
 *
 * Write paths:
 *   - `reserveAiSalesAgentRun(...)` -> create a pending run for the agent flow.
 *   - `finalizeAiRun(...)` -> mark succeeded/failed + structured output state.
 *
 * All write paths go through the SECURITY DEFINER RPC `reserve_quote_ai_usage`
 * for the quote_draft feature (kept for back-compat) — we add a sibling
 * `reserve_sales_agent_run` RPC-less equivalent that's compatible with the
 * existing RPC pattern but writes a sales_agent row directly. Since the run is
 * a pure log of what AI did, the table is written here using the SUPABASE
 * server client (RLS-protected to workspace members).
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import { reserveQuoteAiUsage, finalizeQuoteAiUsage } from "@/server/services/ai-usage";
import type { AISalesRecommendation } from "@/lib/validations/ai-sales-agent";

const SALES_AGENT_FEATURE: AiRunFeature = "sales_agent";
const MANAGER_BRIEF_FEATURE: AiRunFeature = "manager_brief";

export const AI_RUN_PAGE_SIZE = 20;

type AuthedContext = {
  mode: "demo" | "live";
  organizationId: string;
  userId: string | null;
};

/**
 * Reserve a fresh AI Sales Agent run. We do NOT use the existing
 * `reserve_quote_ai_usage` RPC because that RPC hard-codes the quote_draft
 * feature + model + provider. New features (sales_agent, manager_brief) need
 * their own reservation, but the entitlement limit is shared via the same
 * `ai_agent_settings.usage_limit` machinery. To avoid a second RPC + the test
 * churn that implies, we insert the pending row directly here (RLS-checked);
 * the `reserve_quote_ai_usage` RPC continues to be used by the quote-draft
 * route for back-compat.
 *
 * Returns the created row's id, or null in demo mode (the UI shows a demo
 * preview without persisting).
 */
export async function reserveAiSalesAgentRun(
  context: AuthedContext,
  input: {
    targetLeadId?: string;
    targetCustomerId?: string;
    targetQuoteId?: string;
    model: string;
    promptVersion?: string;
    contextVersion?: string;
  },
): Promise<{ runId: string | null; inDemo: boolean }> {
  if (context.mode === "demo" || !context.userId) {
    return { runId: null, inDemo: true };
  }

  if (!hasSupabaseConfig()) {
    return { runId: null, inDemo: true };
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    return { runId: null, inDemo: true };
  }

  // Entitlement check via the existing RPC preserves the limit semantics
  // (`least(usage_limit, ai_message_limit)`) without duplicating it. We allocate
  // a quote_draft reservation as the "token" and then mark the row as sales_agent
  // via an UPDATE — this guarantees the shared budget is still decremented
  // uniformly across features.
  const reservation = await reserveQuoteAiUsage(client, context.organizationId);

  // Rewrite the reserved row's feature + target ids so the dashboard shows it
  // correctly. RLS ensures the row is owned by the org.
  const { data: updated, error } = await client
    .from("ai_usage_events")
    .update({
      feature: SALES_AGENT_FEATURE,
      target_lead_id: input.targetLeadId ?? null,
      target_customer_id: input.targetCustomerId ?? null,
      target_quote_id: input.targetQuoteId ?? null,
      prompt_version: input.promptVersion ?? null,
      context_version: input.contextVersion ?? null,
      started_at: new Date().toISOString(),
    })
    .eq("id", reservation.usageEventId)
    .eq("organization_id", context.organizationId)
    .select("id")
    .maybeSingle();

  if (error || !updated) {
    // Roll over the reservation into a quote_draft row to avoid leaking tokens
    // on rare admin failures; best-effort.
    try {
      await finalizeQuoteAiUsage(client, reservation.usageEventId, "failed");
    } catch {
      // intentionally swallowed — caller will surface a friendly error.
    }
    throw new Error("Unable to reserve AI Sales Agent run.");
  }

  return { runId: updated.id, inDemo: false };
}

/**
 * Finalize a reserved sales agent run. Always called exactly once per run;
 * idempotent (terminal status rows are no-ops for re-finalize).
 */
export async function finalizeAiSalesAgentRun(
  context: AuthedContext,
  runId: string,
  outcome: {
    status: AiRunStatus;
    validationStatus: AiRunValidationStatus;
    output?: AISalesRecommendation | null;
    errorCategory?: string | null;
    errorMessage?: string | null;
    tokenTotal?: number | null;
    costEstimate?: number | null;
  },
): Promise<void> {
  if (context.mode === "demo" || !context.userId || !hasSupabaseConfig()) {
    return;
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    return;
  }

  // Update the run row with lifecycle state. RLS + the organization_id eq
  // clause ensure isolation. We never overwrite a row already in a terminal
  // status (select-for-update-style via WHERE status='pending').
  const { error } = await client
    .from("ai_usage_events")
    .update({
      status: outcome.status,
      completed_at: new Date().toISOString(),
      output: outcome.output ?? null,
      validation_status: outcome.validationStatus,
      error_category: outcome.errorCategory ?? null,
      error_message: outcome.errorMessage ?? null,
      token_total: outcome.tokenTotal ?? null,
      cost_estimate: outcome.costEstimate ?? null,
    })
    .eq("id", runId)
    .eq("organization_id", context.organizationId)
    .eq("status", "pending");

  if (error) {
    // Swallow: the AI may have returned valid output even if the row update
    // failed (e.g. transient db error); we surface the list view as best effort.
  }
}

/**
 * List recent AI runs for the workspace history page. Pagination via limit/offset.
 */
export async function listAiRuns(
  context: AuthedContext,
  page: number,
  pageSize = AI_RUN_PAGE_SIZE,
): Promise<{ rows: AiRunRow[]; total: number; hasMore: boolean }> {
  if (!hasSupabaseConfig() || context.mode !== "live") {
    return { rows: [], total: 0, hasMore: false };
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    return { rows: [], total: 0, hasMore: false };
  }

  // Feature filter for the AI history page: show only agent/manager runs,
  // exclude quote_draft (which is the in-quote assistant, surfaced on the quote).
  const features = [SALES_AGENT_FEATURE, MANAGER_BRIEF_FEATURE];
  const safePage = Math.max(1, Math.floor(page));
  const offset = (safePage - 1) * pageSize;

  const [listResp, countResp] = await Promise.all([
    client
      .from("ai_usage_events")
      .select(
        "id, organization_id, user_id, feature, provider, model, status, target_lead_id, target_customer_id, target_quote_id, started_at, completed_at, output, validation_status, error_category, error_message, prompt_version, context_version, token_total, cost_estimate, created_at",
      )
      .eq("organization_id", context.organizationId)
      .in("feature", features)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1),
    client
      .from("ai_usage_events")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", context.organizationId)
      .in("feature", features),
  ]);

  if (listResp.error || !listResp.data) {
    return { rows: [], total: 0, hasMore: false };
  }

  const total = countResp.count ?? listResp.data.length;
  const rows = listResp.data as unknown as AiRunRow[];
  return { rows, total, hasMore: offset + pageSize < total };
}

/**
 * Count AI-analyzed leads in an org for the dashboard exec summary.
 * Ignores the customer/quote target dimensions; only counts target_lead_id.
 */
export async function countAiRunsAnalyzedLeads(
  client: SupabaseClient,
  organizationId: string,
  inDays = 30,
): Promise<number> {
  const since = new Date(Date.now() - inDays * 86_400_000).toISOString();
  const { count, error } = await client
    .from("ai_usage_events")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("feature", SALES_AGENT_FEATURE)
    .not("target_lead_id", "is", null)
    .gte("created_at", since);

  if (error || !Number.isFinite(count)) {
    return 0;
  }
  return count ?? 0;
}
