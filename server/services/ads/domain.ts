import { z } from "zod";

export const adPlatformSchema = z.enum(["google_ads", "meta_ads"]);
export type AdPlatform = z.infer<typeof adPlatformSchema>;

export const campaignObjectiveSchema = z.enum([
  "lead_generation",
  "traffic",
  "conversions",
  "brand_awareness",
  "sales",
]);
export type CampaignObjective = z.infer<typeof campaignObjectiveSchema>;
export type AdObjective = CampaignObjective;

export const campaignStatusSchema = z.enum([
  "draft",
  "review_pending",
  "approved",
  "live",
  "paused",
  "rejected",
  "completed",
]);
export type CampaignStatus = z.infer<typeof campaignStatusSchema>;

export const adTargetingSchema = z.object({
  locations: z.array(z.string().trim()).default(["Türkiye"]),
  languages: z.array(z.string().trim()).default(["tr"]),
  ageRange: z.tuple([z.number().int().min(18), z.number().int().max(65)]).default([24, 55]),
  interests: z.array(z.string().trim()).default([]),
  placement: z.enum(["all", "feed_only", "stories_reels", "search_network"]).default("all"),
});
export type AdTargeting = z.infer<typeof adTargetingSchema>;

export const adCampaignInputSchema = z.object({
  organizationId: z.string().uuid(),
  platform: adPlatformSchema,
  campaignName: z.string().trim().min(3, "Kampanya adı en az 3 karakter olmalıdır").max(120),
  objective: campaignObjectiveSchema,
  dailyBudget: z.number().positive("Günlük bütçe 0'dan büyük olmalıdır"),
  currency: z.string().default("TRY"),
  targeting: adTargetingSchema.default({
    locations: ["Türkiye"],
    languages: ["tr"],
    ageRange: [24, 55],
    interests: [],
    placement: "all",
  }),
  adGroupName: z.string().trim().min(2).max(120).optional().default("Genel Reklam Grubu"),
  keywords: z.array(z.string().trim()).default([]),
  negativeKeywords: z.array(z.string().trim()).default([]),
  headlines: z.array(z.string().trim().min(2)).max(15).default([]),
  descriptions: z.array(z.string().trim().min(5)).max(5).default([]),
  primaryText: z.string().trim().optional().default(""),
  callToAction: z.string().trim().default("LEARN_MORE"),
  mediaUrl: z.string().url("Geçerli bir medya URL girilmelidir").optional().or(z.literal("")),
  mediaAssetId: z.string().uuid().optional().nullable(),
  adAccountId: z.string().trim().optional().nullable(),
  pageId: z.string().trim().optional().nullable(),
  finalUrl: z.string().url("Geçerli bir hedef URL girilmelidir").optional().or(z.literal("")),
});
export type AdCampaignInput = z.input<typeof adCampaignInputSchema>;
export type AdCampaignOutput = z.output<typeof adCampaignInputSchema>;

export type AdCampaignRecord = {
  id: string;
  organizationId: string;
  platform: AdPlatform;
  campaignName: string;
  objective: CampaignObjective;
  status: CampaignStatus;
  dailyBudgetCents: number;
  currency: string;
  targeting: AdTargeting;
  adGroupName: string | null;
  keywords: string[];
  negativeKeywords?: string[];
  headlines: string[];
  descriptions: string[];
  primaryText?: string | null;
  callToAction?: string | null;
  mediaUrl?: string | null;
  finalUrl: string | null;
  approvalRequestId: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdsDiagnosticResult = {
  platform: AdPlatform;
  isConfigured: boolean;
  isConnected: boolean;
  accountId: string | null;
  accountName: string | null;
  statusText: string;
  canPublishLive: boolean;
  missingRequirements: string[];
};


// ==========================================
// LOOP 5: AI Ads Manager Domain Definitions
// ==========================================

export const adPolicyRiskSchema = z.object({
  severity: z.enum(["low", "medium", "high", "none"]),
  rule: z.string(),
  reason: z.string(),
  suggestedFix: z.string(),
});
export type AdPolicyRisk = z.infer<typeof adPolicyRiskSchema>;

export const adCopyVariationSchema = z.object({
  id: z.string(),
  angle: z.string(),
  headlines: z.array(z.string().max(30)).default([]),
  descriptions: z.array(z.string().max(90)).default([]),
  primaryText: z.string().default(""),
  callToAction: z.string().default("GET_QUOTE"),
});
export type AdCopyVariation = z.infer<typeof adCopyVariationSchema>;

export const aiAdsManagerResultSchema = z.object({
  platform: adPlatformSchema,
  recommendedCampaignType: z.enum(["search", "performance_max", "display", "meta_feed", "meta_story_reels"]),
  recommendedObjective: campaignObjectiveSchema,
  campaignName: z.string(),
  recommendedDailyBudget: z.number().positive(),
  currency: z.string().default("TRY"),
  targetAudience: z.object({
    locations: z.array(z.string()),
    languages: z.array(z.string()),
    ageRange: z.tuple([z.number(), z.number()]),
    interests: z.array(z.string()),
    rationale: z.string(),
  }),
  searchAssets: z.object({
    headlines: z.array(z.string().max(30)),
    descriptions: z.array(z.string().max(90)),
    keywords: z.array(z.string()),
    negativeKeywords: z.array(z.string()),
  }).optional(),
  metaCreative: z.object({
    primaryText: z.string(),
    headlines: z.array(z.string()),
    descriptions: z.array(z.string()),
    callToAction: z.string(),
  }).optional(),
  variations: z.array(adCopyVariationSchema).default([]),
  policyRisks: z.array(adPolicyRiskSchema).default([]),
  missingInfo: z.array(z.string()).default([]),
  optimizationAdvice: z.array(z.string()).default([]),
  visualAnalysisSummary: z.string().optional(),
});
export type AiAdsManagerResult = z.infer<typeof aiAdsManagerResultSchema>;
