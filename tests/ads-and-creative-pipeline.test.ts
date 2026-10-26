process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "dummy-service-role-key";

import test from "node:test";
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

import { socialPlatformSchema } from "../lib/validations/social-publisher";

const {
  adCampaignInputSchema,
  adPlatformSchema,
  campaignObjectiveSchema,
} = req("../server/services/ads/domain") as typeof import("../server/services/ads/domain");

const {
  generateCreativeProductionBrief,
  creativeFormatSchema,
} = req("../server/services/creative/pipeline") as typeof import("../server/services/creative/pipeline");

const {
  PLATFORM_CAPABILITY_MATRIX,
  adaptCaptionForPlatform,
} = req("../server/services/integrations/social-domain") as typeof import("../server/services/integrations/social-domain");

const {
  checkAdsPlatformDiagnostics,
} = req("../server/services/ads/service") as typeof import("../server/services/ads/service");

test("Ads Domain: Validates ad campaign input and budget limits", () => {
  const validInput = {
    organizationId: "550e8400-e29b-41d4-a716-446655440000",
    platform: "google_ads" as const,
    campaignName: "2026 Konteyner Satış Kampanyası",
    objective: "lead_generation" as const,
    dailyBudget: 250,
    currency: "TRY",
    adGroupName: "Yaşam Konteynerleri Grubu",
    keywords: ["konteyner ev", "şantiye konteyner"],
    headlines: ["İzon Konteyner", "Fabrikadan Hızlı Teslimat"],
    descriptions: ["Depreme dayanıklı lüks konteyner ve prefabrik çözümleri."],
    finalUrl: "https://flowsales-ai-six.vercel.app/quotes",
    targeting: {
      locations: ["Türkiye", "İstanbul"],
      languages: ["tr"],
      ageRange: [25, 60] as [number, number],
      interests: ["İnşaat", "Mimarlık"],
      placement: "all" as const,
    },
  };

  const parsed = adCampaignInputSchema.safeParse(validInput);
  assert.equal(parsed.success, true);

  // Negative budget must fail
  const negativeBudget = { ...validInput, dailyBudget: -50 };
  assert.equal(adCampaignInputSchema.safeParse(negativeBudget).success, false);

  // Zero budget must fail
  const zeroBudget = { ...validInput, dailyBudget: 0 };
  assert.equal(adCampaignInputSchema.safeParse(zeroBudget).success, false);

  // Empty campaign name must fail
  const emptyName = { ...validInput, campaignName: "" };
  assert.equal(adCampaignInputSchema.safeParse(emptyName).success, false);
});

test("Ads Domain: Validates supported platforms and objectives", () => {
  assert.equal(adPlatformSchema.safeParse("google_ads").success, true);
  assert.equal(adPlatformSchema.safeParse("meta_ads").success, true);
  assert.equal(adPlatformSchema.safeParse("unsupported_ads").success, false);

  assert.equal(campaignObjectiveSchema.safeParse("lead_generation").success, true);
  assert.equal(campaignObjectiveSchema.safeParse("traffic").success, true);
  assert.equal(campaignObjectiveSchema.safeParse("conversions").success, true);
  assert.equal(campaignObjectiveSchema.safeParse("brand_awareness").success, true);
  assert.equal(campaignObjectiveSchema.safeParse("sales").success, true);
  assert.equal(campaignObjectiveSchema.safeParse("invalid_objective").success, false);
});

test("Ads Safety Invariant: Live publication always requires human approval", async () => {
  const diagGoogle = await checkAdsPlatformDiagnostics(
    "550e8400-e29b-41d4-a716-446655440000",
    "google_ads",
  );
  assert.equal(diagGoogle.canPublishLive, false, "canPublishLive must always be false without approval");

  const diagMeta = await checkAdsPlatformDiagnostics(
    "550e8400-e29b-41d4-a716-446655440000",
    "meta_ads",
  );
  assert.equal(diagMeta.canPublishLive, false, "canPublishLive must always be false without approval");
});

test("Creative Pipeline: Formats and dimensions match technical specifications", async () => {
  const formats = [
    { format: "feed_image" as const, expectedDim: "1080x1080 (1:1 Kare)" },
    { format: "story_reel" as const, expectedDim: "1080x1920 (9:16 Dikey)" },
    { format: "landscape_ad" as const, expectedDim: "1200x628 (1.91:1 Yatay Reklam)" },
    { format: "carousel" as const, expectedDim: "1080x1080 (1:1 Çoklu Kaydırmalı)" },
    { format: "video_storyboard" as const, expectedDim: "1080x1920 (9:16 Video)" },
  ];

  for (const item of formats) {
    assert.equal(creativeFormatSchema.safeParse(item.format).success, true);

    const brief = await generateCreativeProductionBrief({
      topic: "Sonbahar İndirimi",
      productOrService: "İzon Prefabrik Ofis",
      targetAudience: "Şantiye yöneticileri",
      format: item.format,
      language: "tr",
    });

    assert.equal(brief.format, item.format);
    assert.equal(brief.dimensions, item.expectedDim);
    assert.ok(brief.visualPrompt.length > 20, "Visual prompt should be descriptive");
    assert.ok(brief.shotList.length >= 3, "Shot list should have at least 3 scenes");
    assert.ok(brief.shotList[0].visualDescription.length > 0);
    assert.ok(brief.shotList[0].audioNarration.length > 0);
    assert.ok(brief.shotList[0].overlayText.length > 0);
    assert.ok(brief.voiceoverScript && brief.voiceoverScript.length > 0);
  }
});

test("Social Multiplatform: Google Business Profile supported in schema and matrix", () => {
  assert.equal(socialPlatformSchema.safeParse("google").success, true);
  assert.equal(socialPlatformSchema.safeParse("instagram").success, true);
  assert.equal(socialPlatformSchema.safeParse("facebook").success, true);
  assert.equal(socialPlatformSchema.safeParse("tiktok").success, true);
  assert.equal(socialPlatformSchema.safeParse("youtube").success, true);

  const googleCap = PLATFORM_CAPABILITY_MATRIX.google;
  assert.ok(googleCap, "Google capability must exist");
  assert.equal(googleCap.name, "Google Business Profile");
  assert.ok(googleCap.maxCaptionLength > 0);

  // Platform adaptation
  const baseCaption = "İzon Konteyner ile şantiye ve yaşam alanlarınız güvende.";
  const adapted = adaptCaptionForPlatform(baseCaption, "google", {
    google: { title: "Özel Google Başlığı", caption: "Google Özel Açıklama", cta: "Arayın" },
  });
  assert.equal(adapted, "Google Özel Açıklama");
});

test("Turkish Fonts: TrueType Roboto fonts bundled and verified for PDFKit", () => {
  const regularPath = path.resolve(process.cwd(), "server/assets/fonts/Roboto-Regular.ttf");
  const boldPath = path.resolve(process.cwd(), "server/assets/fonts/Roboto-Bold.ttf");

  assert.ok(fs.existsSync(regularPath), "Roboto-Regular.ttf must exist in server/assets/fonts/");
  assert.ok(fs.existsSync(boldPath), "Roboto-Bold.ttf must exist in server/assets/fonts/");

  const regularStat = fs.statSync(regularPath);
  const boldStat = fs.statSync(boldPath);

  assert.ok(regularStat.size > 100000, "Roboto-Regular.ttf should be valid font size");
  assert.ok(boldStat.size > 100000, "Roboto-Bold.ttf should be valid font size");
});
