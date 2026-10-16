import { z } from "zod";

export const socialPlatformSchema = z.enum([
  "instagram",
  "facebook",
  "tiktok",
  "youtube",
  "google_business",
  "linkedin",
  "pinterest",
  "threads",
  "x",
  "bluesky",
  "mastodon",
]);

export const socialPostStatusSchema = z.enum([
  "draft",
  "scheduled",
  "published",
  "failed",
  "archived",
]);

export const createSocialMediaPostSchema = z.object({
  account_id: z.string().uuid().optional().nullable(),
  platform: socialPlatformSchema,
  status: socialPostStatusSchema.default("draft"),
  content: z.string().min(1, "İçerik boş olamaz.").max(2200, "İçerik 2200 karakteri geçemez."),
  media_urls: z.array(z.string().url()).default([]),
  scheduled_at: z.string().datetime().optional().nullable(),
});

export type CreateSocialMediaPostInput = z.infer<typeof createSocialMediaPostSchema>;

export const updateSocialMediaPostSchema = z.object({
  status: socialPostStatusSchema.optional(),
  content: z.string().min(1).max(2200).optional(),
  media_urls: z.array(z.string().url()).optional(),
  scheduled_at: z.string().datetime().optional().nullable(),
});

export type UpdateSocialMediaPostInput = z.infer<typeof updateSocialMediaPostSchema>;

export const connectSocialAccountSchema = z.object({
  platform: socialPlatformSchema,
  code: z.string().min(1),
  redirect_uri: z.string().url(),
});

export type ConnectSocialAccountInput = z.infer<typeof connectSocialAccountSchema>;
