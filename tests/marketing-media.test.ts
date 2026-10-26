process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "dummy-service-role-key";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const req = createRequire(import.meta.url);
const serverOnlyPath = req.resolve("server-only");
req.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as NodeModule;

const {
  validateMediaFile,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_VIDEO_TYPES,
  MAX_IMAGE_SIZE_BYTES,
  MAX_VIDEO_SIZE_BYTES,
  mediaAnalysisResultSchema,
} = req("../server/services/media/domain") as typeof import("../server/services/media/domain");

const {
  analyzeMarketingMedia,
} = req("../server/services/media/service") as typeof import("../server/services/media/service");

const WORKTREE = process.cwd();

describe("Marketing Media Upload, Validation & Honest Analysis Tests", () => {
  it("validates allowed image formats (JPG, PNG, WebP) within size limits", () => {
    for (const mime of ALLOWED_IMAGE_TYPES) {
      const res = validateMediaFile({
        name: `test.${mime.split("/")[1]}`,
        type: mime,
        size: 2 * 1024 * 1024, // 2MB
      });
      assert.equal(res.valid, true);
      assert.equal(res.mediaType, "image");
    }
  });

  it("validates allowed video formats (MP4, MOV) within size limits", () => {
    for (const mime of ALLOWED_VIDEO_TYPES) {
      const res = validateMediaFile({
        name: `sample_video.mp4`,
        type: mime,
        size: 25 * 1024 * 1024, // 25MB
      });
      assert.equal(res.valid, true);
      assert.equal(res.mediaType, "video");
    }
  });

  it("rejects unsupported media formats like executables, pdfs, and audio", () => {
    const invalidTypes = ["application/pdf", "image/gif", "audio/mp3", "application/x-msdownload"];
    for (const mime of invalidTypes) {
      const res = validateMediaFile({
        name: "test.file",
        type: mime,
        size: 1024,
      });
      assert.equal(res.valid, false);
      assert.match(res.error || "", /Desteklenmeyen dosya türü/);
    }
  });

  it("rejects images exceeding 10MB", () => {
    const res = validateMediaFile({
      name: "huge.jpg",
      type: "image/jpeg",
      size: MAX_IMAGE_SIZE_BYTES + 1,
    });
    assert.equal(res.valid, false);
    assert.match(res.error || "", /Görsel boyutu.*sınırını aşıyor/);
  });

  it("rejects videos exceeding 100MB", () => {
    const res = validateMediaFile({
      name: "huge_video.mp4",
      type: "video/mp4",
      size: MAX_VIDEO_SIZE_BYTES + 1,
    });
    assert.equal(res.valid, false);
    assert.match(res.error || "", /Video boyutu.*sınırını aşıyor/);
  });

  it("honest analysis fallback: returns isFallback=true when media is video without pretending vision parsing", async () => {
    const analysis = await analyzeMarketingMedia({
      mediaType: "video",
      mimeType: "video/mp4",
      fileName: "konteyner-tanitim-klip.mp4",
    });

    assert.equal(analysis.isFallback, true);
    assert.ok(analysis.fallbackReason);
    assert.match(analysis.fallbackReason, /Video formatı doğrudan görsel API çözümlemesi için uygun değil/);
    assert.ok(analysis.productOrService.length > 0);
    assert.ok(analysis.suitablePlatforms.includes("youtube"));
  });

  it("schema parsing succeeds for mediaAnalysisResultSchema with default fields", () => {
    const parsed = mediaAnalysisResultSchema.parse({
      productOrService: "3x7 Yaşam Konteyneri",
      primarySubject: "Özel Tasarım Ofis",
      detectedTheme: "Modern ve Yalıtımlı",
      suggestedAudience: "Şantiye Yöneticileri",
      keyFeatures: ["Isıcam", "Poliüretan sandviç panel"],
      visualTone: "Kurumsal",
      marketingAngle: "Dayanıklı ve Hızlı Teslim",
      suitablePlatforms: ["instagram", "facebook"],
      summary: "Modern ofis konteyneri görseli.",
      isFallback: false,
    });

    assert.equal(parsed.productOrService, "3x7 Yaşam Konteyneri");
    assert.equal(parsed.isFallback, false);
  });

  it("migration 0064 defines marketing_media_assets table with tenant RLS policies", () => {
    const migrationPath = path.join(WORKTREE, "supabase/migrations/0064_marketing_media_and_campaign_ops.sql");
    assert.ok(fs.existsSync(migrationPath), "Migration 0064 file must exist");
    const sql = fs.readFileSync(migrationPath, "utf8");

    assert.match(sql, /create table if not exists public\.marketing_media_assets/);
    assert.match(sql, /alter table public\.marketing_media_assets enable row level security;/);
    assert.match(sql, /is_org_member\(organization_id\)/);
    assert.match(sql, /is_org_writer\(organization_id\)/);
    assert.match(sql, /'0064',\s*'marketing_media_and_campaign_ops'/);
  });
});
