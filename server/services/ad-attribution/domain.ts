import { z } from "zod";

export const adAttributionPlatformSchema = z.enum([
  "google_ads",
  "meta_ads",
  "organic",
  "direct",
  "referral",
  "other",
]);
export type AdAttributionPlatform = z.infer<typeof adAttributionPlatformSchema>;

export const adAttributionRecordSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  leadId: z.string().min(1),
  campaignId: z.string().min(1).nullable().optional(),
  platform: adAttributionPlatformSchema,
  utmSource: z.string().nullable().optional(),
  utmMedium: z.string().nullable().optional(),
  utmCampaign: z.string().nullable().optional(),
  utmContent: z.string().nullable().optional(),
  utmTerm: z.string().nullable().optional(),
  clickId: z.string().nullable().optional(),
  landingPage: z.string().nullable().optional(),
  adSpendCents: z.number().int().nonnegative().default(0),
  attributedRevenueCents: z.number().int().nonnegative().default(0),
  quoteId: z.string().min(1).nullable().optional(),
  attributionModel: z.enum(["first_touch", "last_touch", "linear"]).default("last_touch"),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type AdAttributionRecord = z.infer<typeof adAttributionRecordSchema>;

export const campaignPerformanceMetricsSchema = z.object({
  platform: adAttributionPlatformSchema,
  campaignName: z.string(),
  campaignId: z.string().nullable().optional(),
  spendLira: z.number(),
  totalSpend: z.number().optional(),
  leadCount: z.number(),
  totalLeads: z.number().optional(),
  qualifiedCount: z.number(),
  quoteCount: z.number(),
  wonCount: z.number(),
  wonLeads: z.number().optional(),
  attributedRevenueLira: z.number(),
  attributedRevenue: z.number().optional(),
  costPerLeadLira: z.number(),
  costPerQualifiedLeadLira: z.number(),
  customerAcquisitionCostLira: z.number(),
  returnOnAdSpend: z.number().nullable(),
  roas: z.number().nullable().optional(),
  pipelineValueLira: z.number(),
});
export type CampaignPerformanceMetrics = z.infer<typeof campaignPerformanceMetricsSchema>;

export const adOptimizationRecommendationSchema = z.object({
  id: z.string(),
  platform: adAttributionPlatformSchema,
  campaignName: z.string(),
  campaignId: z.string().optional(),
  finding: z.string(),
  evidence: z.string(),
  periodAnalyzed: z.string(),
  recommendedAction: z.string(),
  suggestion: z.string().optional(),
  actionType: z.string().optional(),
  dataEvidence: z.array(z.string()).optional(),
  reasons: z.array(z.string()).optional(),
  priority: z.enum(["high", "medium", "low"]),
  expectedImpactCategory: z.enum(["budget_saving", "conversion_increase", "lead_quality"]),
  requiresHumanReview: z.boolean().default(true),
});
export type AdOptimizationRecommendation = z.infer<typeof adOptimizationRecommendationSchema>;
