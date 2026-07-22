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

test("invitation url generation follows the same site URL fallback contract", () => {
  const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const originalProjectUrl = process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL;
  const originalPreviewUrl = process.env.NEXT_PUBLIC_VERCEL_URL;
  const originalVercelUrl = process.env.VERCEL_URL;

  try {
    process.env.NEXT_PUBLIC_SITE_URL = "https://site.example";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example";
    process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL = "project.example";
    process.env.NEXT_PUBLIC_VERCEL_URL = "https://preview.example";
    process.env.VERCEL_URL = "preview.example";

    const siteToken = generateWorkspaceInvitationTokenValue();
    const siteUrl = buildWorkspaceInvitationUrl(siteToken);
    assert.match(siteUrl, /^https:\/\/site\.example\/invite\//);

    delete process.env.NEXT_PUBLIC_SITE_URL;
    const appToken = generateWorkspaceInvitationTokenValue();
    const appUrl = buildWorkspaceInvitationUrl(appToken);
    assert.match(appUrl, /^https:\/\/app\.example\/invite\//);

    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL;
    delete process.env.NEXT_PUBLIC_VERCEL_URL;
    const vercelToken = generateWorkspaceInvitationTokenValue();
    const vercelUrl = buildWorkspaceInvitationUrl(vercelToken);
    assert.match(vercelUrl, /^https:\/\/preview\.example\/invite\//);
  } finally {
    if (originalSiteUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
    }

    if (originalAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
    }

    if (originalProjectUrl === undefined) {
      delete process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL;
    } else {
      process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL = originalProjectUrl;
    }

    if (originalPreviewUrl === undefined) {
      delete process.env.NEXT_PUBLIC_VERCEL_URL;
    } else {
      process.env.NEXT_PUBLIC_VERCEL_URL = originalPreviewUrl;
    }

    if (originalVercelUrl === undefined) {
      delete process.env.VERCEL_URL;
    } else {
      process.env.VERCEL_URL = originalVercelUrl;
    }
  }
});

test("invitation status helper maps pending, expired, revoked, and accepted states", () => {
  assert.equal(normalizeWorkspaceInvitationStatus({ status: "pending", expires_at: futureExpiresAt }), "pending");
  assert.equal(normalizeWorkspaceInvitationStatus({ status: "pending", expires_at: pastExpiresAt }), "expired");
  assert.equal(normalizeWorkspaceInvitationStatus({ status: "revoked", expires_at: futureExpiresAt }), "revoked");
  assert.equal(normalizeWorkspaceInvitationStatus({ status: "accepted", expires_at: futureExpiresAt }), "accepted");
});

