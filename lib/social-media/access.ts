import { canEditWorkspace, canManageWorkspace } from "@/lib/workspace-access";
import type { WorkspaceContext } from "@/server/services/workspace-context";

export function socialPublishingAllowed(workspace: WorkspaceContext, plan: { configured: boolean; planKey: string; status: string; trialEndsAt: string | null }, now = new Date()) {
  if (!canEditWorkspace(workspace) || !plan.configured) return false;
  if (!["active", "trialing"].includes(plan.status)) return false;
  if (plan.status === "trialing" && plan.trialEndsAt && (!Number.isFinite(Date.parse(plan.trialEndsAt)) || Date.parse(plan.trialEndsAt) <= now.getTime())) return false;
  return ["trial", "growth", "pro", "enterprise"].includes(plan.planKey);
}

export function socialConnectionsAllowed(workspace: WorkspaceContext) {
  return canManageWorkspace(workspace);
}
