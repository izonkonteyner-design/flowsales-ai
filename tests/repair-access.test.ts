import { isReadOnlyRepairPreview } from "@/lib/preview-safety";
import { amountForCurrency } from "@/lib/currency-value";
import assert from "node:assert/strict";
import test from "node:test";
import { canEditWorkspace, canManageWorkspace, isDemoWorkspace } from "@/lib/workspace-access";
import { socialPublishingAllowed } from "@/lib/social-media/access";
import { detectSocialMediaType } from "@/lib/social-media/media-validation";
import { releaseInfo } from "@/lib/release-info";
import { isSameOriginSocialRequest } from "@/lib/social-media/request";
import type { WorkspaceContext } from "@/server/services/workspace-context";

const live = { mode: "live", organization: { id: "org-test", slug: "workspace" }, role: "owner", userId: "user-test", members: [] } as unknown as WorkspaceContext;
test("live demo organizations remain read-only even when their membership role is owner", () => {
  const demo = { ...live, organization: { ...live.organization, id: process.env.DEMO_ORG_ID || "d3e00000-0000-0000-0000-000000000000" } };
  assert.equal(isDemoWorkspace(demo), true);
  assert.equal(canEditWorkspace(demo), false);
  assert.equal(canManageWorkspace(demo), false);
  assert.equal(canEditWorkspace({ ...live, role: "viewer" }), false);
  assert.equal(canEditWorkspace({ ...live, role: "sales_rep" }), true);
});
test("social publishing requires current role, plan status and unexpired trial", () => {
  const plan = { configured: true, planKey: "pro", status: "active", trialEndsAt: null };
  assert.equal(socialPublishingAllowed(live, plan), true);
  assert.equal(socialPublishingAllowed({ ...live, role: "viewer" }, plan), false);
  assert.equal(socialPublishingAllowed(live, { ...plan, configured: false }), false);
  assert.equal(socialPublishingAllowed(live, { ...plan, status: "past_due" }), false);
  assert.equal(socialPublishingAllowed(live, { ...plan, status: "trialing", trialEndsAt: "2026-01-01" }, new Date("2026-10-16")), false);
});
test("media upload signature detection rejects scripts and mismatched formats", () => {
  assert.equal(detectSocialMediaType(new TextEncoder().encode('<svg onload="alert(1)"/>')), null);
  assert.equal(detectSocialMediaType(new Uint8Array([137,80,78,71,13,10,26,10])), "image/png");
  assert.equal(detectSocialMediaType(new Uint8Array([255,216,255,0])), "image/jpeg");
});
test("cookie authenticated social mutations reject missing or foreign origins", () => {
  assert.equal(isSameOriginSocialRequest(new Request("https://app.example/api/social-media/posts", { headers: { origin: "https://attacker.example" } })), false);
  assert.equal(isSameOriginSocialRequest(new Request("https://app.example/api/social-media/posts")), false);
  assert.equal(isSameOriginSocialRequest(new Request("https://app.example/api/social-media/posts", { headers: { origin: "https://app.example" } })), true);
});
test("release metadata exposes commit and module flags without secrets", () => {
  const result = releaseInfo({ VERCEL_GIT_COMMIT_SHA: "abc123", VERCEL_ENV: "preview", SOCIAL_PUBLISHING_ENABLED: "true", SUPABASE_SERVICE_ROLE_KEY: "secret-test" });
  assert.equal(result.commit, "abc123");
  assert.equal(result.publishingEnabled, true);
  assert.equal(JSON.stringify(result).includes("secret-test"), false);
});

test("monetary intelligence never adds USD or EUR values to a TRY aggregate", () => {
  assert.equal(amountForCurrency(100, "USD", "TRY"), 0);
  assert.equal(amountForCurrency("120.50", "TRY", "TRY"), 120.5);
  assert.equal(amountForCurrency(100, "USD", "USD"), 100);
  assert.equal(amountForCurrency("bad", "TRY"), 0);
});

test("repair Preview is isolated while production and unrelated branches keep their configuration", () => {
  const preview = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "fix/flowsales-complete-repair", SOCIAL_PUBLISHING_ENABLED: "true" };
  assert.equal(isReadOnlyRepairPreview(preview), true);
  assert.equal(releaseInfo(preview).publishingEnabled, false);
  assert.equal(isReadOnlyRepairPreview({ ...preview, VERCEL_ENV: "production" }), false);
  assert.equal(isReadOnlyRepairPreview({ ...preview, VERCEL_GIT_COMMIT_REF: "another-branch" }), false);
});
