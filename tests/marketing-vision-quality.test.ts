process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "dummy-service-role-key";

import { describe, it } from "node:test";
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
  analyzeMarketingMedia,
} = req("../server/services/media/service") as typeof import("../server/services/media/service");

const {
  mediaAnalysisResultSchema,
} = req("../server/services/media/domain") as typeof import("../server/services/media/domain");

const {
  generateMultiplatformSocialDrafts,
  multiplatformSocialCampaignDraftSchema,
  socialPlatformDraftSchema,
} = req("../server/services/social/engine") as typeof import("../server/services/social/engine");

const {
  evaluateDraftQuality,
  verifyCrossPlatformDistinctness,
} = req("../server/services/social/quality-gate") as typeof import("../server/services/social/quality-gate");

describe("Critical Vision Analysis & SEO/GEO Quality Gate Suite", () => {
  it("Scenario 1: No fake fallback on quota/offline — does not use file name as fake product description", async () => {
    // Media without base64 or when provider is unavailable
    const result = await analyzeMarketingMedia({
      mediaType: "image",
      mimeType: "image/jpeg",
      fileName: "kullanici_rastgele_fotograf_9941.jpg",
      base64Data: undefined, // Missing data triggers honest fallback
    });

    assert.equal(result.isFallback, true);
    assert.ok(
      result.analysis_status === "NEEDS_INPUT" || result.analysis_status === "PROVIDER_UNAVAILABLE",
      `Expected NEEDS_INPUT or PROVIDER_UNAVAILABLE, got ${result.analysis_status}`
    );
    // CRITICAL: primarySubject must NOT be fake-filled from fileName
    assert.equal(result.primarySubject, "");
    assert.equal(result.detected_objects.length, 0);
    assert.equal(result.visible_features.length, 0);
    assert.ok(result.unknown_or_unverified_details.length > 0);
  });

  it("Scenario 2: Video format truthfully demands input without faking vision parsing", async () => {
    const result = await analyzeMarketingMedia({
      mediaType: "video",
      mimeType: "video/mp4",
      fileName: "santiye_gece_cekimi.mp4",
    });

    assert.equal(result.isFallback, true);
    assert.equal(result.analysis_status, "NEEDS_INPUT");
    assert.equal(result.detected_objects.length, 0);
    assert.ok(result.fallbackReason?.includes("Video formatı"));
  });

  it("Scenario 3: Accepts verified manual input when vision model is unavailable or needs correction", async () => {
    const result = await analyzeMarketingMedia({
      mediaType: "image",
      mimeType: "image/jpeg",
      fileName: "WhatsApp_Image_123.jpeg",
      base64Data: undefined,
      manualInput: {
        productOrService: "3x7m Sandviç Panel Ofis Konteyneri",
        productCategory: "Şantiye Ofis Konteyneri",
        features: ["50mm EPS Sandviç Panel", "Galvaniz Çelik Karkas", "PVC Çift Cam"],
        targetCity: "İstanbul & Gebze Sanayi Bölgesi",
        targetAudience: "Şantiye Şefleri ve Müteahhitler",
      },
    });

    assert.equal(result.analysis_status, "ANALYZED");
    assert.equal(result.analysis_provider, "manual");
    assert.equal(result.confidence, 1.0);
    assert.equal(result.isFallback, false);
    assert.equal(result.productOrService, "3x7m Sandviç Panel Ofis Konteyneri");
    assert.ok(result.visible_features.includes("Galvaniz Çelik Karkas"));
  });

  it("Scenario 4: Two distinct container products with misleading filenames produce distinctly different content", async () => {
    // Product A: Container Home (deliberately misleading filename 'santiye_hurda.jpg')
    const containerHomeAnalysis = mediaAnalysisResultSchema.parse({
      detected_objects: ["modüler konteyner ev", "ahşap veranda", "geniş sürgülü cam", "antrasit kompozit cephe"],
      visual_description: "Doğa içinde konumlanmış, ahşap teraslı ve antrasit kaplamalı modern lüks konteyner ev.",
      product_category: "Konteyner Ev & Yaşam Alanı",
      visible_features: ["Ahşap zemin teras", "Antrasit kompozit dış cephe", "Geniş antrasit PVC doğrama camlar"],
      visible_text: [],
      possible_use_cases: ["Bağ evi", "Hobi bahçesi yaşam alanı", "Butik otel ünitesi"],
      confidence: 0.96,
      unknown_or_unverified_details: ["Fiyat ve iç bölme planı görselden doğrulanamadı."],
      analysis_provider: "gemini",
      analysis_model: "gemini-3.5-flash-lite",
      analysis_status: "ANALYZED",
      analyzed_at: new Date().toISOString(),
      productOrService: "Lüks Konteyner Ev",
      primarySubject: "Modern Yaşam Konteyneri",
      detectedTheme: "Doğa ile Uyumlu Çağdaş Yaşam",
      suggestedAudience: "Villa ve bahçe sahipleri, butik turizm yatırımcıları",
      keyFeatures: ["Ahşap teraslı", "Kompozit cepheli", "4 mevsim yalıtımlı"],
      visualTone: "Ferah, estetik ve prestijli",
      marketingAngle: "Doğada konforlu ve estetik modüler yaşam",
      suitablePlatforms: ["instagram", "facebook", "youtube", "google"],
      summary: "Modern lüks konteyner ev görseli.",
      isFallback: false,
      fallbackReason: null,
    });

    // Product B: Construction Site Container (deliberately misleading filename 'luks_villa_tatil.jpg')
    const siteContainerAnalysis = mediaAnalysisResultSchema.parse({
      detected_objects: ["şantiye ofis konteyneri", "çelik karkas", "beyaz sandviç panel", "korkuluklu pencere"],
      visual_description: "İnşaat sahasında konumlu, çift emniyet pencereli dayanıklı şantiye yönetim konteyneri.",
      product_category: "Şantiye Ofis Konteyneri",
      visible_features: ["Demir parmaklıklı pencere", "Ağır hizmet galvaniz şase", "Beyaz boyalı sandviç panel"],
      visible_text: ["İZON 01"],
      possible_use_cases: ["Şantiye şefliği", "Yemekhane", "Güvenlik ve kontrol kabini"],
      confidence: 0.94,
      unknown_or_unverified_details: ["Net sac kalınlığı ve yangın sınıfı doğrulanamadı."],
      analysis_provider: "gemini",
      analysis_model: "gemini-3.5-flash-lite",
      analysis_status: "ANALYZED",
      analyzed_at: new Date().toISOString(),
      productOrService: "Şantiye Ofis Konteyneri",
      primarySubject: "Ağır Şartlara Dayanıklı Şantiye Konteyneri",
      detectedTheme: "Endüstriyel Güvenilirlik ve Ağır Saha Dayanımı",
      suggestedAudience: "İnşaat müteahhitleri, proje müdürleri, şantiye yöneticileri",
      keyFeatures: ["Güvenlik demirli", "Ağır şase", "Hızlı sevkiyat"],
      visualTone: "Sağlam, işlevsel ve güvenilir",
      marketingAngle: "Zorlu saha koşullarında kesintisiz çalışma ve dayanıklılık",
      suitablePlatforms: ["instagram", "facebook", "youtube", "google"],
      summary: "Standart şantiye konteyneri.",
      isFallback: false,
      fallbackReason: null,
    });

    const homeCampaign = await generateMultiplatformSocialDrafts({
      analysis: containerHomeAnalysis,
      companyName: "İzon Konteyner",
      targetCity: "İzmir & Muğla",
    });

    const siteCampaign = await generateMultiplatformSocialDrafts({
      analysis: siteContainerAnalysis,
      companyName: "İzon Konteyner",
      targetCity: "İstanbul Şantiye Bölgeleri",
    });

    // Validate campaigns validate strictly against schema
    multiplatformSocialCampaignDraftSchema.parse(homeCampaign);
    multiplatformSocialCampaignDraftSchema.parse(siteCampaign);

    // Verify significant content differentiation between Home and Site Container
    const homeInstaFeed = homeCampaign.drafts.find((d) => d.platform === "instagram" && d.placement === "feed");
    const siteInstaFeed = siteCampaign.drafts.find((d) => d.platform === "instagram" && d.placement === "feed");

    assert.ok(homeInstaFeed, "Home Instagram feed draft must exist");
    assert.ok(siteInstaFeed, "Site Instagram feed draft must exist");

    // File name is NOT in headlines or captions
    assert.ok(!homeInstaFeed.headline.includes("santiye_hurda"), "Must not use misleading filename");
    assert.ok(!siteInstaFeed.headline.includes("luks_villa_tatil"), "Must not use misleading filename");

    // The two captions must be different
    assert.notEqual(homeInstaFeed.caption, siteInstaFeed.caption);

    // Hashtags strictly capped at 5
    assert.ok(homeInstaFeed.hashtags.length <= 5, "Hashtag count must be <= 5");
    assert.ok(siteInstaFeed.hashtags.length <= 5, "Hashtag count must be <= 5");

    // Check SEO metadata presence
    assert.ok(homeInstaFeed.primaryKeyword.length > 0);
    assert.ok(siteInstaFeed.primaryKeyword.length > 0);
    assert.ok(homeInstaFeed.alternativeHooks.length > 0);
    assert.ok(siteInstaFeed.alternativeHooks.length > 0);
  });

  it("Scenario 5: Quality Gate strictly catches ungrounded raw file names and limits hashtags to 5", () => {
    const analysis = mediaAnalysisResultSchema.parse({
      detected_objects: ["konteyner ev"],
      visual_description: "Modüler yaşam evi.",
      product_category: "Konteyner Ev",
      analysis_status: "ANALYZED",
    });

    const badDraft = socialPlatformDraftSchema.parse({
      platform: "instagram",
      placement: "feed",
      headline: "İzon — IMG_99214.jpg Fırsatı!",
      hook: "Hemen al",
      caption: "İşte yeni IMG_99214.jpg modelimiz harika fiyatlarla.",
      cta: "Bize ulaşın",
      hashtags: ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"], // valid schema length
      targetUrl: "",
      mediaUrl: "",
      scheduledAt: null,
    });

    const evalResult = evaluateDraftQuality(badDraft, analysis);
    assert.equal(evalResult.passed, false, "Raw file name in copy must fail quality gate");
    assert.ok(evalResult.issues.some((i) => i.includes("ham dosya adı")));
  });

  it("Scenario 6: Cross-platform distinctness ensures platforms do not copy-paste identical captions", () => {
    const identicalDrafts = [
      socialPlatformDraftSchema.parse({
        platform: "instagram",
        placement: "feed",
        headline: "Başlık 1",
        hook: "Kanca 1",
        caption: "Bu aynı kopyalanmış uzun metin şantiye konteynerleri için geçerlidir ve iki yerde kullanılmıştır.",
        cta: "Linke tıkla",
        hashtags: ["#a", "#b"],
      }),
      socialPlatformDraftSchema.parse({
        platform: "facebook",
        placement: "feed",
        headline: "Başlık 2",
        hook: "Kanca 2",
        caption: "Bu aynı kopyalanmış uzun metin şantiye konteynerleri için geçerlidir ve iki yerde kullanılmıştır.",
        cta: "Web sitemize git",
        hashtags: ["#a", "#b"],
      }),
    ];

    const distinctness = verifyCrossPlatformDistinctness(identicalDrafts);
    assert.equal(distinctness.distinct, false, "Identical copy across Instagram and Facebook must trigger warning");
    assert.ok(distinctness.warnings.length > 0);
  });
});
