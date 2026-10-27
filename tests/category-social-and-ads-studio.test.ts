process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "dummy-service-role-key";

import test from "node:test";
import assert from "node:assert/strict";
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
  generateCategorySpecificDrafts,
} = req("../server/services/social/engine") as typeof import("../server/services/social/engine");

const {
  detectAdPolicyRisks,
  runDedicatedAiAdsManager,
} = req("../server/services/ads/service") as typeof import("../server/services/ads/service");

const {
  aiAdsManagerResultSchema,
  adCampaignInputSchema,
} = req("../server/services/ads/domain") as typeof import("../server/services/ads/domain");

test("Category Studio: Generates tailored drafts for 'post' category", async () => {
  const result = await generateCategorySpecificDrafts({
    category: "post",
    topic: "21m² Standart Şantiye Konteyneri",
    catalogContext: "İzon Konteyner — Yüksek yalıtımlı galvaniz sac",
    mediaAnalysis: {
      detected_objects: ["container", "modular building", "white container", "construction"],
      visual_description: "Fabrika bahçesinde yer alan beyaz modüler yaşam konteyneri",
      product_category: "modular_buildings",
      visible_features: ["Galvaniz karkas", "Beyaz sandviç panel"],
      visible_text: [],
      possible_use_cases: ["Şantiye ofisi", "Bağ evi"],
      confidence: 0.95,
      unknown_or_unverified_details: [],
      analysis_provider: "gemini",
      analysis_model: "gemini-2.5-flash",
      analysis_status: "ANALYZED",
      analyzed_at: new Date().toISOString(),
      productOrService: "21m² Standart Şantiye Konteyneri",
      primarySubject: "Beyaz Modüler Yaşam Konteyneri",
      detectedTheme: "Endüstriyel Üretim",
      suggestedAudience: "Şantiye Şefleri ve Arsa Sahipleri",
      keyFeatures: ["Yüksek ısı yalıtımı", "Galvaniz çelik şase"],
      visualTone: "Profesyonel",
      marketingAngle: "Hızlı fabrika teslim",
      suitablePlatforms: ["instagram", "facebook", "google"],
      summary: "21m2 galvaniz konteyner",
      isFallback: false,
      fallbackReason: null,
    },
  });

  assert.equal(result.category, "post");
  assert.ok(result.drafts.length >= 2, "Should produce drafts for multiple platforms");
  
  // Post platforms: instagram, facebook, google
  const platforms = result.drafts.map((d) => d.platform);
  assert.ok(platforms.includes("instagram"), "Instagram post must be generated");
  assert.ok(platforms.includes("facebook"), "Facebook post must be generated");
  assert.ok(platforms.includes("google"), "Google Business post must be generated");

  for (const draft of result.drafts) {
    assert.ok(draft.hashtags.length <= 5, "Hashtags must not exceed 5");
    assert.ok(draft.caption.length > 20, "Caption must be meaningful");
    assert.ok(draft.cta.length > 5, "Draft must include a call to action");
  }
});

test("Category Studio: Generates tailored drafts for 'reel' category with short-form video constraints", async () => {
  const result = await generateCategorySpecificDrafts({
    category: "reel",
    topic: "Konteyner İçi Lüks Yaşam Turu",
  });

  assert.equal(result.category, "reel");
  const platforms = result.drafts.map((d) => d.platform);
  assert.ok(platforms.includes("instagram"), "IG Reel must be generated");
  assert.ok(platforms.includes("youtube"), "YT Shorts must be generated");

  for (const draft of result.drafts) {
    assert.ok(draft.hook.length > 10, "Reel must have an engaging hook");
    assert.ok(draft.caption.length > 20, "Reel caption must be descriptive");
    assert.ok(draft.hashtags.length <= 5, "Hashtags must be <= 5");
  }
});

test("Category Studio: Generates tailored drafts for 'story' category with 24h CTA", async () => {
  const result = await generateCategorySpecificDrafts({
    category: "story",
    topic: "Haftalık Sevkiyat İndirimi",
  });

  assert.equal(result.category, "story");
  const platforms = result.drafts.map((d) => d.platform);
  assert.ok(platforms.includes("instagram") || platforms.includes("facebook"));

  for (const draft of result.drafts) {
    assert.ok(draft.caption.length <= 250, "Story text must be punchy and brief");
    assert.ok(draft.cta.length > 3, "Story must recommend interactive/direct CTA");
  }
});

test("Category Studio: Generates tailored drafts for 'video' long-form category", async () => {
  const result = await generateCategorySpecificDrafts({
    category: "video",
    topic: "Konteyner Üretim Aşamaları ve İzolasyon Testi",
  });

  assert.equal(result.category, "video");
  const platforms = result.drafts.map((d) => d.platform);
  assert.ok(platforms.includes("youtube") || platforms.includes("facebook"));

  const ytDraft = result.drafts.find((d) => d.platform === "youtube");
  if (ytDraft) {
    assert.ok(ytDraft.headline.length > 5, "YouTube video must have a title");
    assert.ok(ytDraft.caption.length > 30, "YouTube video must have a detailed description");
  }
});

test("AI Ads Manager: Enforces Google Ads headline <= 30 chars and description <= 90 chars", async () => {
  const result = await runDedicatedAiAdsManager({
    platform: "google_ads",
    topic: "İzon Konteyner Satışı",
    websiteUrl: "https://flowsales-ai-six.vercel.app/quotes",
    currentDailyBudget: 350,
  });

  assert.ok(result.searchAssets, "Search assets config must be present");
  for (const headline of result.searchAssets.headlines) {
    assert.ok(
      headline.length <= 30,
      `Headline exceeds 30 chars: "${headline}" (${headline.length})`
    );
  }

  for (const description of result.searchAssets.descriptions) {
    assert.ok(
      description.length <= 90,
      `Description exceeds 90 chars: "${description}" (${description.length})`
    );
  }

  assert.ok(result.searchAssets.keywords.length >= 2, "Keywords must be provided");
  assert.ok(result.searchAssets.negativeKeywords.length >= 2, "Negative keywords must protect budget");
});

test("AI Ads Manager: Generates multi-angle ad copy variations matching schema", async () => {
  const result = await runDedicatedAiAdsManager({
    platform: "meta_ads",
    topic: "Bahçe Yaşam Konteyneri",
    websiteUrl: "https://flowsales-ai-six.vercel.app/quotes",
  });

  assert.ok(result.variations.length >= 1, "Must generate copy variations");
  for (const variation of result.variations) {
    assert.ok(variation.id, "Variation must have an ID");
    assert.ok(variation.angle, "Variation must have an angle name");
    assert.ok(variation.primaryText, "Variation must have primary text");
  }

  // Validate against Zod schema
  const parsed = aiAdsManagerResultSchema.safeParse(result);
  assert.ok(parsed.success, `Result must match aiAdsManagerResultSchema: ${JSON.stringify(parsed.error)}`);
});

test("Policy Risk Detector: Flags prohibited guarantees and uppercase spam", () => {
  const riskyResult = detectAdPolicyRisks({
    headlines: ["%100 GARANTİ İLE EN UCUZ KONTEYNER SATIŞI", "HEMEN AL"],
    descriptions: ["Sektörün en ucuz ve en kaliteli ürünleri."],
    finalUrl: "http://insecure-site.com",
  });

  assert.ok(riskyResult.length >= 2, "Should detect multiple policy violations");

  const rules = riskyResult.map((i) => i.rule);
  assert.ok(
    rules.some((r) => r.includes("Ticari İddia") || r.includes("Büyük Harf") || r.includes("Güvenlik")),
    "Must flag policy issues"
  );

  const cleanResult = detectAdPolicyRisks({
    headlines: ["İzon Yaşam Konteynerleri", "Fabrikadan Doğrudan Teslimat"],
    descriptions: ["Yüksek yalıtımlı modüler yaşam konteynerleri İzon kalitesiyle."],
    finalUrl: "https://flowsales-ai-six.vercel.app/quotes",
  });

  assert.equal(cleanResult.length, 0, "Clean ad should pass with zero violations");
});

test("Campaign Domain: Validates campaign input schema constraints", () => {
  const campaignData = {
    organizationId: "550e8400-e29b-41d4-a716-446655440000",
    platform: "meta_ads" as const,
    campaignName: "İzon Bahçe Konteynerleri Q4",
    objective: "lead_generation" as const,
    dailyBudget: 200,
    currency: "TRY",
    adGroupName: "Bahçe Konsepti",
    primaryText: "Hayalinizdeki konforlu ve yalıtımlı bahçe konteynerleri fabrikadan doğrudan teslimatla.",
    headlines: ["Bahçe Konteynerleri", "Hızlı Kurulum"],
    descriptions: ["Yüksek ısı ve ses yalıtımlı modüler yapılar."],
    callToAction: "GET_QUOTE",
    finalUrl: "https://flowsales-ai-six.vercel.app/quotes",
    targeting: {
      locations: ["İstanbul", "Kocaeli", "Bursa"],
      languages: ["tr"],
      ageRange: [25, 60] as [number, number],
      interests: ["Bahçe", "Prefabrik"],
      placement: "feed_only" as const,
    },
  };

  const parsed = adCampaignInputSchema.safeParse(campaignData);
  assert.ok(parsed.success, "Valid campaign input must pass schema validation");
});
