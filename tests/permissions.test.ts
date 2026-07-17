import test from "node:test";
import assert from "node:assert/strict";

import {
  canChangeWorkspaceMemberRole,
  canManageWorkspaceMembersRole,
  canMutateWorkspaceMembers,
  canRemoveWorkspaceMember,
} from "@/server/services/workspace-members";
import type { WorkspaceContext } from "@/server/services/workspace-context";

const liveOwnerContext: WorkspaceContext = {
  mode: "live",
  organization: {
    id: "org_1",
    name: "FlowSales AI",
    slug: "flowsales",
    currency: "TRY",
    role: "owner",
  },
  role: "owner",
  userId: "user_1",
  members: [],
};

const demoContext: WorkspaceContext = {
  ...liveOwnerContext,
  mode: "demo",
  userId: null,
};

test("viewer permissions are read only", () => {
  assert.equal(canManageWorkspaceMembersRole("viewer"), false);
  assert.equal(canMutateWorkspaceMembers(demoContext), false);
});

test("admin and owner permissions can mutate live members", () => {
  assert.equal(canManageWorkspaceMembersRole("owner"), true);
  assert.equal(canManageWorkspaceMembersRole("admin"), true);
  assert.equal(canMutateWorkspaceMembers(liveOwnerContext), true);
});

test("owner cannot remove or demote themselves", () => {
  const ownerMember = {
    id: "member_1",
    organization_id: "org_1",
    user_id: "user_1",
    role: "owner" as const,
    created_at: "2026-07-10T00:00:00.000Z",
    updated_at: "2026-07-10T00:00:00.000Z",
    full_name: "Selin Kaya",
    joined_label: "Jul 10, 2026",
    is_current_user: true,
    can_edit_role: false,
    can_remove: false,
  };

  assert.equal(canChangeWorkspaceMemberRole(liveOwnerContext, ownerMember), false);
  assert.equal(canRemoveWorkspaceMember(liveOwnerContext, ownerMember), false);
});

test("viewer members cannot mutate workspace roles", () => {
  const viewerMember = {
    id: "member_2",
    organization_id: "org_1",
    user_id: "user_2",
    role: "viewer" as const,
    created_at: "2026-07-10T00:00:00.000Z",
    updated_at: "2026-07-10T00:00:00.000Z",
    full_name: "Mert Yilmaz",
    joined_label: "Jul 10, 2026",
    is_current_user: false,
    can_edit_role: true,
    can_remove: true,
  };

  const viewerContext: WorkspaceContext = { ...liveOwnerContext, role: "viewer" };
  assert.equal(canMutateWorkspaceMembers(viewerContext), false);
  assert.equal(canChangeWorkspaceMemberRole(viewerContext, viewerMember), false);
  assert.equal(canRemoveWorkspaceMember(viewerContext, viewerMember), false);
});

