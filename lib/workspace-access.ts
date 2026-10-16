import { canWriteSalesRecords } from "@/lib/workspace-roles";
import type { WorkspaceContext } from "@/server/services/workspace-context";

type Workspace = Pick<WorkspaceContext, "mode" | "role" | "organization">;

export function isDemoWorkspace(workspace: Workspace) {
  return workspace.mode === "demo"
    || workspace.organization.id === (process.env.DEMO_ORG_ID || "d3e00000-0000-0000-0000-000000000000")
    || workspace.organization.slug === (process.env.DEMO_ORG_SLUG || "flowsales-demo");
}

export function canEditWorkspace(workspace: Workspace) {
  return !isDemoWorkspace(workspace) && canWriteSalesRecords(workspace.role);
}

export function canManageWorkspace(workspace: Workspace) {
  return !isDemoWorkspace(workspace) && (workspace.role === "owner" || workspace.role === "admin");
}
