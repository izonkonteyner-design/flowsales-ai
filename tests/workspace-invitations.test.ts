import test from "node:test";
import assert from "node:assert/strict";

import {
  buildWorkspaceInvitationUrl,
  generateWorkspaceInvitationTokenValue,
  hashWorkspaceInvitationToken,
  normalizeWorkspaceInvitationStatus,
} from "@/server/services/workspace-members";
import { invitationAcceptanceSchema, invitationLookupSchema } from "@/lib/validations/workspace-invitation";

const futureExpiresAt = "2999-01-01T00:00:00.000Z";
const pastExpiresAt = "2000-01-01T00:00:00.000Z";

test("invitation token validation rejects malformed tokens", () => {
  assert.equal(invitationLookupSchema.safeParse({ token: "short" }).success, false);
});

test("invitation acceptance validation accepts a valid token", () => {
  const token = generateWorkspaceInvitationTokenValue();
  const parsed = invitationAcceptanceSchema.parse({
    token,
    next: "/settings/members",
  });

  assert.equal(parsed.token, token);
});

test("invitation url generation includes the raw token only in the invite link", () => {
  const token = generateWorkspaceInvitationTokenValue();
  const url = buildWorkspaceInvitationUrl(token);

  assert.match(url, /\/invite\//);
  assert.ok(url.endsWith(token));
  assert.equal(hashWorkspaceInvitationToken(token).length, 64);
});

test("invitation status helper maps pending, expired, revoked, and accepted states", () => {
  assert.equal(normalizeWorkspaceInvitationStatus({ status: "pending", expires_at: futureExpiresAt }), "pending");
  assert.equal(normalizeWorkspaceInvitationStatus({ status: "pending", expires_at: pastExpiresAt }), "expired");
  assert.equal(normalizeWorkspaceInvitationStatus({ status: "revoked", expires_at: futureExpiresAt }), "revoked");
  assert.equal(normalizeWorkspaceInvitationStatus({ status: "accepted", expires_at: futureExpiresAt }), "accepted");
});

