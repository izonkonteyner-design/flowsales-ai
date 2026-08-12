import type { Organization } from "@/types/crm";

export type WorkspaceRole = Organization["role"];

export function isSalesRepresentativeRole(role: string | null | undefined) {
  return role === "sales" || role === "sales_rep";
}

export function canWriteSalesRecords(role: WorkspaceRole | null | undefined) {
  return role === "owner" || role === "admin" || role === "manager" || isSalesRepresentativeRole(role);
}
