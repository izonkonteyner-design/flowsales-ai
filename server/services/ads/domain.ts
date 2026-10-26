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
