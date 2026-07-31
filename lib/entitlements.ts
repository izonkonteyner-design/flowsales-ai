import type { Organization } from "@/types/crm";

export type PlanId = "demo" | "trial" | "starter" | "pro" | "business";

/**
 * Feature identifiers used by the entitlement layer.
 *
 * Gate UI affordances AND server-side mutations on the same Feature identifier
 * so a disabled button never disagrees with an authenticated worker. Keep this
 * list narrow: only features that ACTUALLY differ across plans go here. Common
 * CRM primitives that every plan has (leads, customers, products, quotes) are
 * intentionally in the list so we can record entitlement state explicitly.
 */
export type Feature =
  | "crm_core"
  | "quotes"
  | "ai_sales_agent"
  | "ai_approvals"
  | "activity_history"
  | "advanced_dashboard"
  | "team_members"
  | "exports";

/**
 * Entitlement = {(feature -> enabled)} union {limits}.
 * Single source of truth for plan -> features. The database stores only the
 * plan string; this map is consulted by both server actions and UI badges.
 */
export type PlanEntitlement = {
  plan: PlanId;
  /** Sellable label shown on Account/Pricing pages. */
  label: string;
  /** One-line description used on upgrade CTAs. */
  summary: string;
  features: Record<Feature, boolean>;
  limits: {
    /** Maximum number of workspace members. */
    members: number;
    /** AI run budget per billing cycle. */
    aiMessagesPerCycle: number;
    /** Whether paid billing is wired up. */
    billingEnabled: boolean;
  };
};

export const PLAN_ENTITLEMENTS: Record<PlanId, PlanEntitlement> = {
  demo: {
    plan: "demo",
    label: "Demo",
    summary: "Read-only sandbox workspace for evaluating FlowSales AI.",
    features: {
      crm_core: true,
      quotes: true,
      ai_sales_agent: true,
      ai_approvals: true,
      activity_history: true,
      advanced_dashboard: true,
      team_members: false,
      exports: false,
    },
    limits: { members: 1, aiMessagesPerCycle: 25, billingEnabled: false },
  },
  trial: {
    plan: "trial",
    label: "Trial",
    summary: "Full feature access for the duration of your trial period.",
    features: {
      crm_core: true,
      quotes: true,
      ai_sales_agent: true,
      ai_approvals: true,
      activity_history: true,
      advanced_dashboard: true,
      team_members: true,
      exports: true,
    },
    limits: { members: 3, aiMessagesPerCycle: 100, billingEnabled: false },
  },
  starter: {
    plan: "starter",
    label: "Starter",
    summary: "CRM essentials, quotes, and a limited AI budget for solo sellers.",
    features: {
      crm_core: true,
      quotes: true,
      ai_sales_agent: true,
      ai_approvals: true,
      activity_history: true,
      advanced_dashboard: false,
      team_members: false,
      exports: false,
    },
    limits: { members: 3, aiMessagesPerCycle: 100, billingEnabled: true },
  },
  pro: {
    plan: "pro",
    label: "Pro",
    summary: "Full AI Sales Agent, approvals, and activity history for small teams.",
    features: {
      crm_core: true,
      quotes: true,
      ai_sales_agent: true,
      ai_approvals: true,
      activity_history: true,
      advanced_dashboard: true,
      team_members: true,
      exports: true,
    },
    limits: { members: 10, aiMessagesPerCycle: 500, billingEnabled: true },
  },
  business: {
    plan: "business",
    label: "Business",
    summary: "Higher AI budget and team scaling for growing sales orgs.",
    features: {
      crm_core: true,
      quotes: true,
      ai_sales_agent: true,
      ai_approvals: true,
      activity_history: true,
      advanced_dashboard: true,
      team_members: true,
      exports: true,
    },
    limits: { members: 50, aiMessagesPerCycle: 2000, billingEnabled: true },
  },
};

export function getPlanEntitlement(plan: string | null | undefined): PlanEntitlement {
  if (plan && plan in PLAN_ENTITLEMENTS) {
    return PLAN_ENTITLEMENTS[plan as PlanId];
  }
  // Unknown / null plan defaults to the most restrictive non-demo plan so a
  // misconfigured live workspace fails closed, not open.
  return PLAN_ENTITLEMENTS.starter;
}

export function hasFeature(entitlement: PlanEntitlement, feature: Feature): boolean {
  return entitlement.features[feature] === true;
}

export type SubscriptionRecord = {
  plan: string;
  status: string | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  trial_converted_at: string | null;
  current_period_end: string | null;
};

export type ResolvedPlanState = {
  /** The plan the workspace is currently on (demo/trial/starter/pro/business). */
  plan: PlanId;
  /** Whether the user is on a trial that is still within its window. */
  inTrial: boolean;
  /** ISO timestamp when the trial ends, if applicable. */
  trialEndsAt: string | null;
  /** Whether a trial has expired (distinct from never having had one). */
  trialExpired: boolean;
  /** Entitlement resolution for the current plan. */
  entitlement: PlanEntitlement;
  /** Whether this is the global demo workspace. Used for explicit badge copy. */
  isDemoWorkspace: boolean;
};

const DEMO_ORG_ID = "d3e00000-0000-0000-0000-000000000000";

/**
 * Pure resolver: subscription row + org id -> ResolvedPlanState.
 * The resolver is pure and deterministic so unit tests can pin its behavior
 * without hitting the database. Input validation lives in callers.
 */
export function resolvePlanState(
  subscription: SubscriptionRecord | null,
  organizationId: string,
): ResolvedPlanState {
  // Global demo workspace always reads as demo, regardless of stale row state.
  const isDemoWorkspace = organizationId === DEMO_ORG_ID;
  if (isDemoWorkspace) {
    const entitlement = PLAN_ENTITLEMENTS.demo;
    return {
      plan: "demo",
      inTrial: false,
      trialEndsAt: null,
      trialExpired: false,
      entitlement,
      isDemoWorkspace: true,
    };
  }

  if (!subscription) {
    return {
      plan: "starter",
      inTrial: false,
      trialEndsAt: null,
      trialExpired: false,
      entitlement: PLAN_ENTITLEMENTS.starter,
      isDemoWorkspace: false,
    };
  }

  const plan = (subscription.plan in PLAN_ENTITLEMENTS
    ? (subscription.plan as PlanId)
    : "starter") as PlanId;

  const now = Date.now();
  const trialEndsAt = subscription.trial_ends_at;
  const inTrial =
    plan === "trial" &&
    Boolean(trialEndsAt) &&
    new Date(trialEndsAt as string).getTime() > now;
  const trialExpired =
    plan === "trial" &&
    Boolean(trialEndsAt) &&
    new Date(trialEndsAt as string).getTime() <= now;

  return {
    plan,
    inTrial,
    trialEndsAt: trialEndsAt ?? null,
    trialExpired,
    entitlement: getPlanEntitlement(plan),
    isDemoWorkspace: false,
  };
}

/**
 * Demo-safe gate: returns true when the workspace can perform mutations.
 * Demo viewers can SEE everything but mutations are rejected server-side.
 * This helper is used by UI affordances to mirror the server's enforcement.
 */
export function canMutate(
  context: { mode: "demo" | "live"; role: Organization["role"] },
  entitlement: PlanEntitlement,
  feature: Feature,
): boolean {
  if (context.mode === "demo") return false;
  if (!hasFeature(entitlement, feature)) return false;
  if (context.role === "viewer") return false;
  return true;
}
