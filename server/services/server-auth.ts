import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import { getWorkspaceContext, type WorkspaceRole } from "@/server/services/workspace-context";
import type { Organization } from "@/types/crm";

/**
 * Server-side authorization primitives.
 *
 * The legacy service files (leads/products/quotes) each roll their own
 * `getMutationContext` + `ensureCanManage` pair, which is fine. This module
 * centralizes the building blocks so new subsystems (AI runs / approvals /
 * pilot feedback / dashboard) use the SAME enforcement logic.
 *
 * Key invariants enforced here:
 *   - Demo workspaces can NEVER run mutations through this helper. The demo
 *     flag is derived from the session, NOT from a client-supplied payload.
 *   - Cross-workspace reads are blocked by `assertWorkspaceScopedEntity`.
 *   - Viewer role is always rejected for mutations, regardless of business
 *     rules on top.
 */

export type LiveMutationContext = {
  client: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;
  organization: Organization;
  role: WorkspaceRole;
  userId: string;
};

/**
 * Returns a live mutation context, or throws a typed `DemoMutationDeniedError`
 * if the active workspace is the demo (or no live session exists).
 *
 * Demo-safe operations (reads, AI analysis, approval REQUESTS that don't
 * persist real mutations) bypass this and call `getWorkspaceContext` directly
 * so the UI can still surface the demo experience.
 */
export async function requireLiveMutationContext(): Promise<LiveMutationContext> {
  const context = await getWorkspaceContext();
  if (context.mode !== "live" || !context.userId) {
    throw new DemoMutationDeniedError();
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    // hasSupabaseConfig() false -> getWorkspaceContext returned demo fallback.
    throw new DemoMutationDeniedError();
  }

  return {
    client,
    organization: context.organization,
    role: context.role,
    userId: context.userId,
  };
}

/**
 * Mutation role gate. Accepts the role from `LiveMutationContext` only.
 * Callers SHOULD additionally check feature entitlement via `canMutate`.
 */
export function assertCanManage(role: WorkspaceRole, label = "this resource"): void {
  if (role !== "owner" && role !== "admin" && role !== "sales") {
    throw new PermissionDeniedError(`You do not have permission to change ${label}.`);
  }
}

/**
 * Generic IDOR / cross-workspace access guard. Use on every read of an entity
 * that was hydrated by ID (e.g. quotes/[id], leads/[id]). The contract is:
 *   - The loader MUST have already fetched the row using a workspace-scoped
 *     query (`eq("organization_id", ctx.organization.id)`), so by construction
 *     rows outside the workspace never reach this check. We still call this
 *     helper on the returned row as defense-in-depth: if any caller forgets
 *     the org filter and a leaked row reaches us, we reject loudly.
 *
 * Throws `PermissionDeniedError` if `entityOrganizationId` does not match the
 * active workspace id. The error message is intentionally generic ("not
 * found") so it does not leak the existence of another workspace's entities.
 */
export function assertWorkspaceScopedEntity(
  activeOrganizationId: string,
  entityOrganizationId: string,
): void {
  if (entityOrganizationId !== activeOrganizationId) {
    throw new PermissionDeniedError("Resource not found.");
  }
}

/**
 * Reject a client-supplied workspace id. No client payload may carry a
 * `workspaceId` / `organizationId` / `ownerId` / `actorId` — those values
 * must come from the session. Use this as a cheap pre-check on raw payloads.
 */
export function assertNoCrossWorkspaceKeys(payload: unknown): void {
  if (payload && typeof payload === "object") {
    const keys = Object.keys(payload as Record<string, unknown>);
    const forbidden = keys.find((k) =>
      /^(workspace_?id|organization_?id|owner_?id|actor_?id|role|plan)$/i.test(k),
    );
    if (forbidden) {
      throw new PayloadTamperingError(`Payload must not include "${forbidden}".`);
    }
  }
}

export class DemoMutationDeniedError extends Error {
  code = "demo_mutation_denied" as const;
  status = 403;
  constructor() {
    super("This workspace is read-only. Mutations require a live workspace.");
    this.name = "DemoMutationDeniedError";
  }
}

export class PermissionDeniedError extends Error {
  code = "permission_denied" as const;
  status = 403;
  constructor(public override message: string) {
    super(message);
    this.name = "PermissionDeniedError";
  }
}

export class PayloadTamperingError extends Error {
  code = "payload_tampering" as const;
  status = 400;
  constructor(public override message: string) {
    super(message);
    this.name = "PayloadTamperingError";
  }
}

/** Re-export for call sites that want to react to the typed errors. */
export function isAuthError(error: unknown): error is DemoMutationDeniedError | PermissionDeniedError {
  return error instanceof DemoMutationDeniedError || error instanceof PermissionDeniedError;
}

/** True when there is no live Supabase config (i.e. preview / local demo). */
export function isDemoOnlyEnvironment(): boolean {
  return !hasSupabaseConfig();
}
