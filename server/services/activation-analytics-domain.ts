// Pure, dependency-free domain logic for activation and onboarding analytics.
// No Supabase/network access here so this module stays unit-testable in isolation,
// mirroring the pattern used by server/services/lead-domain.ts and friends.

/**
 * Abandonment thresholds.
 *
 * These windows measure time elapsed since workspace creation (organizations.created_at),
 * not since the previous step, because a workspace that never creates a lead should still
 * be flagged even though there is no "previous step" timestamp to measure from.
 *
 * - FIRST_LEAD_ABANDONMENT_HOURS = 24h: creating (or importing) the first lead is the
 *   earliest meaningful activation action after signup. A full day covers a normal
 *   business day plus evening hours for a workspace created late in the day, without
 *   letting a genuinely stalled signup linger unflagged for days.
 * - FIRST_AI_VALUE_ABANDONMENT_HOURS = 72h: reaching a completed AI run is a strictly
 *   later milestone than the first lead (most AI capabilities operate on an existing
 *   lead), and typically requires the operator to explore the product a bit before
 *   triggering a capability. 72h (3 days) gives enough buffer beyond the lead window
 *   to avoid conflating normal evaluation pacing with true onboarding abandonment,
 *   while still surfacing stalled workspaces well before a week has passed.
 *
 * These are deliberately the two checkpoints called out in the roadmap item; CSV import
 * completion is still reported as a time-to-value metric but is not, on its own, treated
 * as an abandonment trigger (a workspace can reach first AI value without ever importing
 * a CSV, e.g. by adding a lead manually).
 */
export const FIRST_LEAD_ABANDONMENT_HOURS = 24;
export const FIRST_AI_VALUE_ABANDONMENT_HOURS = 72;

export type ActivationTimestamps = {
  /** organizations.created_at — the anchor every duration is measured from. */
  workspaceCreatedAt: string;
  /** Earliest activities.created_at where type = 'lead_created', if any. */
  firstLeadCreatedAt: string | null;
  /** Earliest import_jobs.completed_at where status = 'completed', if any. */
  firstImportCompletedAt: string | null;
  /** Earliest ai_runs.completed_at where status = 'completed', if any. */
  firstAiRunCompletedAt: string | null;
};

export type ActivationMilestoneMetric = {
  reached: boolean;
  reachedAt: string | null;
  /** Hours from workspace creation to this milestone. Null when not yet reached. */
  hoursToReach: number | null;
};

export type ActivationMetrics = {
  firstLead: ActivationMilestoneMetric;
  firstImport: ActivationMilestoneMetric;
  firstAiRun: ActivationMilestoneMetric;
};

export type AbandonmentStepStatus = "completed" | "pending" | "abandoned";

export type AbandonmentReason = "no_lead_created_within_24h" | "no_ai_run_completed_within_72h";

export type AbandonmentAssessment = {
  firstLeadStatus: AbandonmentStepStatus;
  firstAiRunStatus: AbandonmentStepStatus;
  isAbandoned: boolean;
  abandonedReasons: AbandonmentReason[];
  hoursSinceWorkspaceCreated: number;
};

function hoursBetween(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return ms / 3_600_000;
}

function toMilestoneMetric(workspaceCreatedAt: string, reachedAt: string | null): ActivationMilestoneMetric {
  if (!reachedAt) {
    return { reached: false, reachedAt: null, hoursToReach: null };
  }
  return {
    reached: true,
    reachedAt,
    // Clamp to zero: defends against clock skew producing a tiny negative duration.
    hoursToReach: Math.max(0, hoursBetween(workspaceCreatedAt, reachedAt)),
  };
}

/** Computes time-to-first-value metrics for a single workspace. Pure and side-effect free. */
export function computeActivationMetrics(timestamps: ActivationTimestamps): ActivationMetrics {
  return {
    firstLead: toMilestoneMetric(timestamps.workspaceCreatedAt, timestamps.firstLeadCreatedAt),
    firstImport: toMilestoneMetric(timestamps.workspaceCreatedAt, timestamps.firstImportCompletedAt),
    firstAiRun: toMilestoneMetric(timestamps.workspaceCreatedAt, timestamps.firstAiRunCompletedAt),
  };
}

/**
 * Determines whether a workspace should be flagged as having abandoned onboarding.
 *
 * Boundary semantics: a step becomes "abandoned" only once elapsed time strictly
 * exceeds its threshold. Exactly at the threshold (e.g. precisely 24h with no lead)
 * the step is still "pending" — the workspace gets the full window before being flagged.
 */
export function assessOnboardingAbandonment(
  timestamps: ActivationTimestamps,
  now: Date | string = new Date(),
): AbandonmentAssessment {
  const nowIso = typeof now === "string" ? now : now.toISOString();
  const hoursSinceWorkspaceCreated = Math.max(0, hoursBetween(timestamps.workspaceCreatedAt, nowIso));

  const firstLeadStatus: AbandonmentStepStatus = timestamps.firstLeadCreatedAt
    ? "completed"
    : hoursSinceWorkspaceCreated > FIRST_LEAD_ABANDONMENT_HOURS
      ? "abandoned"
      : "pending";

  const firstAiRunStatus: AbandonmentStepStatus = timestamps.firstAiRunCompletedAt
    ? "completed"
    : hoursSinceWorkspaceCreated > FIRST_AI_VALUE_ABANDONMENT_HOURS
      ? "abandoned"
      : "pending";

  const abandonedReasons: AbandonmentReason[] = [];
  if (firstLeadStatus === "abandoned") abandonedReasons.push("no_lead_created_within_24h");
  if (firstAiRunStatus === "abandoned") abandonedReasons.push("no_ai_run_completed_within_72h");

  return {
    firstLeadStatus,
    firstAiRunStatus,
    isAbandoned: abandonedReasons.length > 0,
    abandonedReasons,
    hoursSinceWorkspaceCreated,
  };
}

/** Formats an hours duration as a short, human-readable label (e.g. "3.5h", "2.1d"). */
export function formatActivationDuration(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}
