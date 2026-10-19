import { z } from "zod";

export const socialPlatformSchema = z.enum(["instagram", "facebook", "both"]);
export type SocialPlatform = z.infer<typeof socialPlatformSchema>;

export const socialPostStatusSchema = z.enum([
  "draft",
  "scheduled",
  "publishing",
  "published",
  "failed",
  "cancelled",
]);
export type SocialPostStatus = z.infer<typeof socialPostStatusSchema>;

export const socialPostInputSchema = z.object({
  workspaceId: z.string().uuid("Geçerli bir workspace_id gerekli"),
  platform: socialPlatformSchema,
  content: z.string().trim().min(1, "İçerik boş olamaz").max(2200, "Instagram metin sınırı 2200 karakterdir"),
  mediaUrls: z.array(z.string().url("Geçerli bir medya URL'si gerekli")).default([]),
  hashtags: z.array(z.string().trim()).default([]),
  status: socialPostStatusSchema.default("draft"),
  scheduledAt: z.string().datetime().optional().nullable(),
});

export type SocialPostInput = z.infer<typeof socialPostInputSchema>;

export type SocialPostRecord = {
  id: string;
  workspace_id: string;
  platform: SocialPlatform;
  content: string;
  media_urls: string[];
  hashtags: string[];
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

export function buildMockSocialPost(input: SocialPostInput): SocialPostRecord {
  const now = new Date().toISOString();
  return {
    id: `post_${Math.random().toString(36).slice(2, 10)}`,
    workspace_id: input.workspaceId,
    platform: input.platform,
    content: input.content,
    media_urls: input.mediaUrls || [],
    hashtags: input.hashtags || [],
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
