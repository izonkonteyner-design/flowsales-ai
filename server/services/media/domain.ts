import { z } from "zod";

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/quicktime"] as const;
export const ALL_ALLOWED_MEDIA_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES] as const;

export type AllowedMediaType = (typeof ALL_ALLOWED_MEDIA_TYPES)[number];

export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const MAX_VIDEO_SIZE_BYTES = 100 * 1024 * 1024; // 100MB
export const MAX_VIDEO_DURATION_SECONDS = 600; // 10 minutes

export const mediaKindSchema = z.enum(["image", "video"]);
export type MediaKind = z.infer<typeof mediaKindSchema>;

export const mediaAnalysisStatusEnum = z.enum([
  "ANALYZED",
  "NEEDS_INPUT",
  "RATE_LIMITED",
  "PROVIDER_UNAVAILABLE",
  "FAILED",
]);
export type MediaAnalysisStructuredStatus = z.infer<typeof mediaAnalysisStatusEnum>;

export const mediaAnalysisStatusSchema = z.enum([
  "pending",
  "completed",
  "fallback",
  "failed",
  "ANALYZED",
  "NEEDS_INPUT",
  "RATE_LIMITED",
  "PROVIDER_UNAVAILABLE",
  "FAILED",
]);
export type MediaAnalysisStatus = z.infer<typeof mediaAnalysisStatusSchema>;

export const manualMediaInputSchema = z.object({
  productOrService: z.string().optional(),
  productCategory: z.string().optional(),
  features: z.array(z.string()).optional(),
  targetCity: z.string().optional(),
  targetAudience: z.string().optional(),
  marketingAngle: z.string().optional(),
  notes: z.string().optional(),
});
export type ManualMediaInput = z.infer<typeof manualMediaInputSchema>;

export const mediaAnalysisResultSchema = z.object({
  // Section 2: Structured Visual Analysis Attributes
  detected_objects: z.array(z.string()).default([]),
  visual_description: z.string().default(""),
  product_category: z.string().default(""),
  visible_features: z.array(z.string()).default([]),
  visible_text: z.array(z.string()).default([]),
  possible_use_cases: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0),
  unknown_or_unverified_details: z.array(z.string()).default([]),
  analysis_provider: z.enum(["gemini", "ollama", "manual", "none"]).default("gemini"),
  analysis_model: z.string().default(""),
  analysis_status: mediaAnalysisStatusEnum.default("ANALYZED"),
  analyzed_at: z.string().default(() => new Date().toISOString()),

  // Backwards compatibility / convenience fields for existing consumers
  productOrService: z.string().default("İzon Konteyner Ürünleri"),
  primarySubject: z.string().default("Modüler Yaşam ve Çalışma Alanı"),
  detectedTheme: z.string().default("Endüstriyel Üretim ve Yüksek Kalite"),
  suggestedAudience: z.string().default("Prefabrik & Konteyner Arayan Müşteriler"),
  keyFeatures: z.array(z.string()).default([]),
  visualTone: z.string().default("Profesyonel, Güvenilir, Çağdaş"),
  marketingAngle: z.string().default("Dayanıklılık, hızlı teslimat ve özel tasarım"),
  suitablePlatforms: z.array(z.string()).default(["instagram", "facebook", "google", "youtube"]),
  summary: z.string().default(""),
  isFallback: z.boolean().default(false),
  fallbackReason: z.string().nullable().default(null),
});
export type MediaAnalysisResult = z.infer<typeof mediaAnalysisResultSchema>;

export const marketingMediaAssetSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  storagePath: z.string(),
  publicUrl: z.string().url(),
  fileName: z.string(),
  fileType: z.string(),
  fileSizeBytes: z.number().int().nonnegative(),
  mediaType: mediaKindSchema,
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  durationSeconds: z.number().positive().nullable().optional(),
  analysisStatus: mediaAnalysisStatusSchema,
  analysisResult: mediaAnalysisResultSchema,
  createdBy: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type MarketingMediaAsset = z.infer<typeof marketingMediaAssetSchema>;

/**
 * Validates a file against allowed MIME types and size constraints.
 */
export function validateMediaFile(file: { name: string; type: string; size: number }): {
  valid: boolean;
  error?: string;
  mediaType?: MediaKind;
} {
  const isImage = (ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type);
  const isVideo = (ALLOWED_VIDEO_TYPES as readonly string[]).includes(file.type);

  if (!isImage && !isVideo) {
    return {
      valid: false,
      error: `Desteklenmeyen dosya türü (${file.type}). Yalnızca JPG, PNG, WebP, MP4 veya MOV dosyaları kabul edilir.`,
    };
  }

  if (isImage && file.size > MAX_IMAGE_SIZE_BYTES) {
    return {
      valid: false,
      error: `Görsel boyutu ${Math.round(MAX_IMAGE_SIZE_BYTES / (1024 * 1024))} MB sınırını aşıyor (${(file.size / (1024 * 1024)).toFixed(1)} MB).`,
    };
  }

  if (isVideo && file.size > MAX_VIDEO_SIZE_BYTES) {
    return {
      valid: false,
      error: `Video boyutu ${Math.round(MAX_VIDEO_SIZE_BYTES / (1024 * 1024))} MB sınırını aşıyor (${(file.size / (1024 * 1024)).toFixed(1)} MB).`,
    };
  }

  return {
    valid: true,
    mediaType: isImage ? "image" : "video",
  };
}
