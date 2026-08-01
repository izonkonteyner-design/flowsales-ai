import { z } from "zod";

export const organizationRoleSchema = z.enum([
  "owner",
  "admin",
  "manager",
  "sales_manager",
  "sales_rep",
  "member",
  "viewer",
]);
export type OrganizationRole = z.infer<typeof organizationRoleSchema>;

export const organizationPermissionSchema = z.enum([
  "manage_members",
  "manage_billing",
  "manage_workspace",
  "review_ai",
  "manage_pipeline",
  "run_ai",
  "import_data",
  "edit_crm",
  "view_crm",
]);
export type OrganizationPermission = z.infer<typeof organizationPermissionSchema>;

const ROLE_PERMISSIONS: Record<OrganizationRole, ReadonlySet<OrganizationPermission>> = {
  owner: new Set(organizationPermissionSchema.options),
  admin: new Set(organizationPermissionSchema.options),
  manager: new Set(["review_ai", "manage_pipeline", "run_ai", "import_data", "edit_crm", "view_crm"]),
  sales_manager: new Set(["review_ai", "manage_pipeline", "run_ai", "import_data", "edit_crm", "view_crm"]),
  sales_rep: new Set(["run_ai", "import_data", "edit_crm", "view_crm"]),
  member: new Set(["run_ai", "import_data", "edit_crm", "view_crm"]),
  viewer: new Set(["view_crm"]),
};

export function roleHasPermission(role: OrganizationRole, permission: OrganizationPermission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

export const planKeySchema = z.enum(["trial", "starter", "growth", "pro", "enterprise"]);
export type PlanKey = z.infer<typeof planKeySchema>;

export type WorkspaceEntitlement = {
  plan: PlanKey;
  status: "trialing" | "active" | "past_due" | "cancelled" | "expired";
  trialEndsAt?: string;
  seatLimit: number;
  monthlyAiRunLimit: number;
  currentAiRuns: number;
};

export type EntitlementDecision = {
  allowed: boolean;
  reason?: "inactive_subscription" | "trial_expired" | "ai_limit_reached" | "seat_limit_reached";
};

export function evaluateEntitlement(
  entitlement: WorkspaceEntitlement,
  request: { capability: "ai_run" | "invite_member"; currentSeats?: number; now?: Date },
): EntitlementDecision {
  const now = request.now ?? new Date();
  if (!new Set(["trialing", "active"]).has(entitlement.status)) {
    return { allowed: false, reason: "inactive_subscription" };
  }
  if (entitlement.status === "trialing" && entitlement.trialEndsAt && new Date(entitlement.trialEndsAt) <= now) {
    return { allowed: false, reason: "trial_expired" };
  }
  if (request.capability === "ai_run" && entitlement.currentAiRuns >= entitlement.monthlyAiRunLimit) {
    return { allowed: false, reason: "ai_limit_reached" };
  }
  if (request.capability === "invite_member" && (request.currentSeats ?? 0) >= entitlement.seatLimit) {
    return { allowed: false, reason: "seat_limit_reached" };
  }
  return { allowed: true };
}
