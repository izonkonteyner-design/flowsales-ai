import test from "node:test";
import assert from "node:assert/strict";

import {
  canManageWorkspaceMembersRole,
  hasPendingWorkspaceInvitationForEmail,
  hasWorkspaceMemberForUserId,
  isWorkspaceInvitationInOrganization,
  isWorkspaceMemberInOrganization,
} from "@/server/services/workspace-members";
import { inviteMemberSchema } from "@/lib/validations/workspace-member";

test("invite validation accepts normalized member input", () => {
  const parsed = inviteMemberSchema.parse({
    email: "  teammate@company.com ",
    role: "admin",
    next: "/settings/members",
  });

  assert.equal(parsed.email, "teammate@company.com");
  assert.equal(parsed.role, "admin");
});

test("duplicate invite detection only blocks pending same-email invites", () => {
  const invitations = [
    { email: "teammate@company.com", status: "pending" as const, expires_at: "2026-07-18T00:00:00.000Z" },
    { email: "archived@company.com", status: "revoked" as const, expires_at: "2026-07-18T00:00:00.000Z" },
  ];

  assert.equal(hasPendingWorkspaceInvitationForEmail(invitations, "Teammate@company.com"), true);
  assert.equal(hasPendingWorkspaceInvitationForEmail(invitations, "archived@company.com"), false);
});

test("duplicate member detection blocks the same workspace user", () => {
  const members = [{ organization_id: "org_1", user_id: "user_1" }];

  assert.equal(hasWorkspaceMemberForUserId(members, "org_1", "user_1"), true);
  assert.equal(hasWorkspaceMemberForUserId(members, "org_2", "user_1"), false);
});

test("workspace isolation helpers block cross-workspace access", () => {
  assert.equal(isWorkspaceMemberInOrganization({ organization_id: "org_1" }, "org_1"), true);
  assert.equal(isWorkspaceMemberInOrganization({ organization_id: "org_1" }, "org_2"), false);
  assert.equal(isWorkspaceInvitationInOrganization({ organization_id: "org_1" }, "org_2"), false);
});

test("admin and owner roles can manage workspace members", () => {
  assert.equal(canManageWorkspaceMembersRole("owner"), true);
  assert.equal(canManageWorkspaceMembersRole("admin"), true);
  assert.equal(canManageWorkspaceMembersRole("viewer"), false);
});

