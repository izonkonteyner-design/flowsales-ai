import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { describe } from "node:test";
import assert from "node:assert/strict";

import {
  socialPlatformSchema,
  socialPostInputSchema,
  validateSocialPostInput,
  buildMockSocialPost,
  publishSocialPostToMetaMock,
} from "@/lib/validations/social-publisher";

const testsDir = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(testsDir, "..", "supabase", "migrations", "0055_social_media_publishing.sql");
const servicePath = join(testsDir, "..", "server", "services", "integrations", "social-publisher.ts");

const migrationSource = readFileSync(migrationPath, "utf8");
const serviceSource = readFileSync(servicePath, "utf8");

describe("Social Media Publishing Module Tests", () => {
  test("0055 migration defines social_posts table, RLS, and indexes", () => {
    assert.match(migrationSource, /CREATE TABLE IF NOT EXISTS public\.social_posts/);
    assert.match(migrationSource, /workspace_id UUID NOT NULL REFERENCES public\.workspaces/);
    assert.match(migrationSource, /platform TEXT NOT NULL CHECK \(platform IN \('instagram', 'facebook', 'both'\)\)/);
    assert.match(migrationSource, /ALTER TABLE public\.social_posts ENABLE ROW LEVEL SECURITY;/);
    assert.match(migrationSource, /CREATE POLICY "Users can manage social posts for their workspaces"/);
  });

  test("social-publisher.ts is server only and re-exports publisher contract", () => {
    assert.match(serviceSource, /import "server-only";/);
    assert.match(serviceSource, /export async function generateCaptionAi/);
    assert.match(serviceSource, /export async function publishSocialPostToMeta/);
  });

  test("socialPlatformSchema validates supported platforms", () => {
    assert.equal(socialPlatformSchema.parse("instagram"), "instagram");
    assert.equal(socialPlatformSchema.parse("facebook"), "facebook");
    assert.equal(socialPlatformSchema.parse("both"), "both");
    assert.throws(() => socialPlatformSchema.parse("twitter"));
  });

  test("socialPostInputSchema validates input requirements and limits", () => {
    const valid = socialPostInputSchema.parse({
      workspaceId: "550e8400-e29b-41d4-a716-446655440000",
      platform: "instagram",
      content: "Yaz kampanyamız başladı!",
      hashtags: ["#kampanya", "#yaz"],
    });

    assert.equal(valid.workspaceId, "550e8400-e29b-41d4-a716-446655440000");
    assert.equal(valid.platform, "instagram");
    assert.equal(valid.status, "draft");

    assert.throws(
      () =>
        socialPostInputSchema.parse({
          workspaceId: "invalid-uuid",
          platform: "instagram",
          content: "Test",
        }),
      /workspace_id/
    );

    assert.throws(
      () =>
        socialPostInputSchema.parse({
          workspaceId: "550e8400-e29b-41d4-a716-446655440000",
          platform: "instagram",
          content: "",
        }),
      /İçerik boş olamaz/
    );
  });

  test("buildMockSocialPost constructs valid post record", () => {
    const input = validateSocialPostInput({
      workspaceId: "550e8400-e29b-41d4-a716-446655440000",
      platform: "both",
      content: "Şantiye konteyner teslimatımız tamamlandı.",
      hashtags: ["#santiye", "#ofis"],
      status: "scheduled",
      scheduledAt: "2026-04-01T10:00:00Z",
    });

    const record = buildMockSocialPost(input);
    assert.equal(record.workspace_id, input.workspaceId);
    assert.equal(record.platform, "both");
    assert.equal(record.status, "scheduled");
    assert.equal(record.scheduled_at, "2026-04-01T10:00:00Z");
    assert.ok(record.id.startsWith("post_"));
  });

  test("publishSocialPostToMetaMock handles missing or invalid token safely", () => {
    const post = buildMockSocialPost({
      workspaceId: "550e8400-e29b-41d4-a716-446655440000",
      platform: "instagram",
      content: "Test post",
      mediaUrls: [],
      hashtags: [],
      status: "draft",
      scheduledAt: null,
    });

    const noTokenRes = publishSocialPostToMetaMock(post, undefined);
    assert.equal(noTokenRes.success, false);
    assert.match(noTokenRes.errorMessage!, /tokenı tanımlı değil/);

    const invalidTokenRes = publishSocialPostToMetaMock(post, "invalid_token");
    assert.equal(invalidTokenRes.success, false);
    assert.match(invalidTokenRes.errorMessage!, /token yetkisiz veya süresi dolmuş/);

    const successRes = publishSocialPostToMetaMock(post, "valid_page_access_token_123");
    assert.equal(successRes.success, true);
    assert.ok(successRes.metaPostId?.startsWith("meta_post_"));
  });
});
