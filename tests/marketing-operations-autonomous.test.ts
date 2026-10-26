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
  generateMultiplatformSocialDrafts,
  socialPlatformDraftSchema,
  multiplatformSocialCampaignDraftSchema,
} = req("../server/services/social/engine") as typeof import("../server/services/social/engine");

const {
  generateAdCampaignSuggestions,
  executeCampaignDeployment,
} = req("../server/services/ads/service") as typeof import("../server/services/ads/service");

const {
  generateMarketingOptimizationAdvice,
} = req("../server/services/analytics/service") as typeof import("../server/services/analytics/service");

describe("Autonomous Marketing Operations & Safety Test Suite", () => {
  it("Loop 2: Generates customized multiplatform social drafts across Instagram, Facebook, YouTube, Google Business", async () => {
    const analysis = {
      productOrService: "3x7 Metre Konteyner Ofis",
      primarySubject: "Şantiye Çözümleri",
      detectedTheme: "Endüstriyel Güvenilirlik",
      suggestedAudience: "Müteahhitler ve Şantiye Şefleri",
      keyFeatures: ["Isıcam", "Çelik Şase", "Sandviç Panel"],
      visualTone: "Kurumsal ve Sağlam",
      marketingAngle: "Aynı Gün Teslimat ve Dayanıklılık",
      suitablePlatforms: ["instagram", "facebook", "youtube", "google"],
      summary: "Modern şantiye ofis konteyneri görseli.",
      isFallback: true,
      fallbackReason: null,
    };

    const campaign = await generateMultiplatformSocialDrafts({
      analysis,
      companyName: "İzon Konteyner",
      websiteUrl: "https://flowsales-ai-six.vercel.app",
    });

    const validatedCampaign = multiplatformSocialCampaignDraftSchema.parse(campaign);
    assert.ok(validatedCampaign.campaignTitle.length > 0);
    assert.ok(campaign.campaignTitle.length > 0);
    assert.ok(campaign.drafts.length >= 8, "Must generate at least 8 drafts across placements");

    // Verify placements present
    const placements = campaign.drafts.map((d) => `${d.platform}:${d.placement}`);
    assert.ok(placements.includes("instagram:feed"), "Instagram Feed must exist");
    assert.ok(placements.includes("instagram:story"), "Instagram Story must exist");
    assert.ok(placements.includes("instagram:reel"), "Instagram Reel must exist");
    assert.ok(placements.includes("facebook:feed"), "Facebook Feed must exist");
    assert.ok(placements.includes("youtube:shorts"), "YouTube Shorts must exist");
    assert.ok(placements.includes("youtube:video"), "YouTube Video must exist");
    assert.ok(placements.includes("google:update"), "Google Business Update must exist");
    assert.ok(placements.includes("google:offer"), "Google Business Offer must exist");

    // Validate schema on all drafts
    for (const draft of campaign.drafts) {
      const validated = socialPlatformDraftSchema.parse(draft);
      assert.ok(validated.headline.length > 0);
      assert.ok(validated.caption.length > 0);
      assert.ok(validated.cta.length > 0);
    }
  });

  it("Loop 3: Generates Google Ads campaign with strict character limits, keywords, and negative keywords", async () => {
    const suggestions = await generateAdCampaignSuggestions({
      platform: "google_ads",
      topic: "Konteyner Ev Fiyatları",
      productOrService: "Yaşam Konteyneri",
      objective: "lead_generation",
      dailyBudget: 350,
      targetAudience: "Müstakil Yaşam Arayanlar",
    });

    assert.equal(suggestions.objective, "lead_generation");
    assert.equal(suggestions.dailyBudget, 350);
    assert.equal(suggestions.currency, "TRY");

    // Google Ads headlines and descriptions
    assert.ok(suggestions.headlines.length >= 3, "At least 3 headlines required");
    assert.ok(suggestions.descriptions.length >= 2, "At least 2 descriptions required");
    assert.ok(suggestions.keywords.length >= 3, "Keywords must be generated");
    assert.ok(suggestions.negativeKeywords.length >= 3, "Negative keywords must be present to prevent wasted ad spend");

    // Google search placement
    assert.equal(suggestions.targeting.placement, "search_network");
  });

  it("Loop 4: Generates Meta Ads campaign with primary text, rich headlines, and interest targeting", async () => {
    const suggestions = await generateAdCampaignSuggestions({
      platform: "meta_ads",
      topic: "Şantiye Ofis Konteynerleri",
      productOrService: "Modüler Ofis",
      objective: "lead_generation",
      dailyBudget: 500,
    });

    assert.equal(suggestions.objective, "lead_generation");
    assert.equal(suggestions.dailyBudget, 500);
    assert.ok(suggestions.primaryText.length > 20, "Primary text must be detailed for Meta feed");
    assert.ok(suggestions.headlines.length >= 2);
    assert.ok(suggestions.targeting.interests.length > 0, "Meta targeting interests must be populated");
  });

  it("Loop 5: Safety Guardrail: executeCampaignDeployment rejects unconfirmed live spend", async () => {
    const res = await executeCampaignDeployment({
      campaignId: "550e8400-e29b-41d4-a716-446655440000",
      organizationId: "550e8400-e29b-41d4-a716-446655440001",
      userId: "550e8400-e29b-41d4-a716-446655440002",
      livePublishConfirmed: false, // Not confirmed!
    });

    assert.equal(res.success, false);
    assert.match(res.error || "", /açık kullanıcı onayı zorunludur/i);
  });

  it("Loop 7: Generates AI optimization advice without modifying ad budgets autonomously", async () => {
    const advice = await generateMarketingOptimizationAdvice({
      social: {
        totalPosts: 12,
        publishedCount: 8,
        scheduledCount: 3,
        draftCount: 1,
        failedCount: 0,
        platformsBreakdown: { instagram: 6, facebook: 4, google: 2 },
        latestPublishedAt: new Date().toISOString(),
      },
      ads: {
        totalCampaigns: 4,
        draftCount: 1,
        reviewPendingCount: 1,
        approvedCount: 1,
        pausedCount: 1,
        liveCount: 0,
        totalDailyBudgetTry: 750,
        platformsBreakdown: { google_ads: 2, meta_ads: 2 },
      },
      companyName: "İzon Konteyner",
    });

    assert.ok(advice.headlineSuggestions.length > 0);
    assert.ok(advice.freshCallToActions.length > 0);
    assert.ok(advice.optimalPostingTimes.length > 0);
    assert.ok(advice.budgetShiftRecommendations.length > 0);
    assert.match(advice.summaryNote, /onay/i, "Summary note must highlight that budget shifts require human approval");
  });
});
