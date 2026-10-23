import { z } from "zod";

export const socialPlatformSchema = z.enum(["instagram", "facebook", "tiktok", "youtube", "both", "all"]);
export type SocialPlatform = z.infer<typeof socialPlatformSchema>;

export const socialContentTypeSchema = z.enum(["post", "reel_short", "story", "video", "text"]);
export type SocialContentType = z.infer<typeof socialContentTypeSchema>;

export const socialPostStatusSchema = z.enum([
  "draft",
  "scheduled",
  "publishing",
  "published",
  "failed",
  "cancelled",
]);
export type SocialPostStatus = z.infer<typeof socialPostStatusSchema>;

export const platformCustomizationSchema = z.object({
  title: z.string().trim().optional(),
  caption: z.string().trim().optional(),
  hashtags: z.array(z.string().trim()).optional(),
  mediaUrl: z.string().url().optional(),
});

export const socialPostInputSchema = z.object({
  workspaceId: z.string().uuid("Geçerli bir workspace_id gerekli"),
  platform: socialPlatformSchema,
  contentType: socialContentTypeSchema.default("post"),
  content: z.string().trim().min(1, "İçerik boş olamaz").max(65000, "Metin sınırı aşıldı"),
  title: z.string().trim().max(200).optional(),
  mediaUrls: z.array(z.string().url("Geçerli bir medya URL'si gerekli")).default([]),
  hashtags: z.array(z.string().trim()).default([]),
  platformCustomizations: z.record(z.string(), platformCustomizationSchema).optional().default({}),
  aiGeneratedDisclosure: z.boolean().default(false),
  status: socialPostStatusSchema.default("draft"),
  scheduledAt: z.string().datetime().optional().nullable(),
});

export type SocialPostInput = z.infer<typeof socialPostInputSchema>;

export type SocialPostRecord = {
  id: string;
  workspace_id: string;
  platform: SocialPlatform;
  contentType: SocialContentType;
  content: string;
  title: string | null;
  media_urls: string[];
  hashtags: string[];
  platform_customizations: Record<string, unknown>;
  ai_generated_disclosure: boolean;
  status: SocialPostStatus;
  scheduled_at: string | null;
  published_at: string | null;
  error_message: string | null;
  meta_post_id: string | null;
  created_at: string;
  updated_at: string;
};

export function validateSocialPostInput(input: unknown): SocialPostInput {
  return socialPostInputSchema.parse(input);
}

export function buildMockSocialPost(input: Partial<SocialPostInput> & { workspaceId: string; content: string; platform: SocialPlatform }): SocialPostRecord {
  const now = new Date().toISOString();
  return {
    id: `post_${Math.random().toString(36).slice(2, 10)}`,
    workspace_id: input.workspaceId,
    platform: input.platform,
    contentType: input.contentType || "post",
    content: input.content,
    title: input.title || null,
    media_urls: input.mediaUrls || [],
    hashtags: input.hashtags || [],
    platform_customizations: input.platformCustomizations || {},
    ai_generated_disclosure: input.aiGeneratedDisclosure || false,
    status: input.status || "draft",
    scheduled_at: input.scheduledAt || null,
    published_at: input.status === "published" ? now : null,
    error_message: null,
    meta_post_id: null,
    created_at: now,
    updated_at: now,
  };
}

export function publishSocialPostToMetaMock(post: SocialPostRecord, pageAccessToken?: string): {
  success: boolean;
  metaPostId?: string;
  errorMessage?: string;
} {
  if (!pageAccessToken) {
    return {
      success: false,
      errorMessage: "Meta Sayfa erişim tokenı tanımlı değil. Lütfen Meta entegrasyonunu tamamlayın.",
    };
  }

  if (pageAccessToken === "invalid_token") {
    return {
      success: false,
      errorMessage: "Meta Graph API token yetkisiz veya süresi dolmuş.",
    };
  }

  return {
    success: true,
    metaPostId: `meta_post_${Date.now()}`,
  };
}
