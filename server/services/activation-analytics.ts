import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import {
  assessOnboardingAbandonment,
  computeActivationMetrics,
  type ActivationTimestamps,
  type AbandonmentAssessment,
  type ActivationMetrics,
} from "@/server/services/activation-analytics-domain";

export type ActivationAnalyticsReport = {
  organizationId: string;
  workspaceCreatedAt: string;
  onboardingCompletedAt: string | null;
  metrics: ActivationMetrics;
  abandonment: AbandonmentAssessment;
};

/**
 * Loads the raw milestone timestamps (plus onboarding_completed_at, surfaced as extra
 * context rather than an activation milestone) for a single workspace from existing
 * tables. Uses the admin client (bypasses RLS) and filters explicitly by organizationId,
 * matching the pattern used by server/services/sales-operations-v5.ts — callers are
 * responsible for verifying the caller is authorized for that organizationId first.
 */
async function loadActivationTimestamps(
  organizationId: string,
): Promise<{ timestamps: ActivationTimestamps; onboardingCompletedAt: string | null }> {
  const admin = createSupabaseAdminClient();

  const [orgResult, leadResult, importResult, aiRunResult] = await Promise.all([
    admin.from("organizations").select("created_at, onboarding_completed_at").eq("id", organizationId).maybeSingle(),
    admin
      .from("activities")
      .select("created_at")
      .eq("organization_id", organizationId)
      .eq("type", "lead_created")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    admin
      .from("import_jobs")
      .select("completed_at")
      .eq("organization_id", organizationId)
      .eq("status", "completed")
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    admin
      .from("ai_runs")
      .select("completed_at")
      .eq("organization_id", organizationId)
      .eq("status", "completed")
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  if (orgResult.error) throw new Error("Unable to load workspace for activation analytics.");
  if (!orgResult.data) throw new Error("Workspace not found for activation analytics.");
  if (leadResult.error) throw new Error("Unable to load first-lead activity for activation analytics.");
  if (importResult.error) throw new Error("Unable to load first-import data for activation analytics.");
  if (aiRunResult.error) throw new Error("Unable to load first-AI-run data for activation analytics.");

  return {
    timestamps: {
      workspaceCreatedAt: orgResult.data.created_at,
      firstLeadCreatedAt: leadResult.data?.created_at ?? null,
      firstImportCompletedAt: importResult.data?.completed_at ?? null,
      firstAiRunCompletedAt: aiRunResult.data?.completed_at ?? null,
    },
    onboardingCompletedAt: orgResult.data.onboarding_completed_at ?? null,
  };
}

/** Builds the full activation analytics report for a single workspace. */
export async function getActivationAnalytics(organizationId: string): Promise<ActivationAnalyticsReport> {
  const { timestamps, onboardingCompletedAt } = await loadActivationTimestamps(organizationId);

  return {
    organizationId,
    workspaceCreatedAt: timestamps.workspaceCreatedAt,
    onboardingCompletedAt,
    metrics: computeActivationMetrics(timestamps),
    abandonment: assessOnboardingAbandonment(timestamps),
  };
}
