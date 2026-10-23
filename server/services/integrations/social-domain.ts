export type SocialPlatform = "instagram" | "facebook" | "tiktok" | "youtube";

export type SocialContentType = "post" | "reel_short" | "story" | "video" | "text";

export type SocialPostStatus = "draft" | "scheduled" | "publishing" | "published" | "failed" | "cancelled";

export type PlatformCustomization = {
  title?: string;
  caption?: string;
  hashtags?: string[];
  mediaUrl?: string;
};

export type PlatformCustomizations = Partial<Record<SocialPlatform, PlatformCustomization>>;

export type SocialPostInput = {
  title?: string;
  caption: string;
  contentType?: SocialContentType;
  mediaUrls?: string[];
  platforms: SocialPlatform[];
  platformCustomizations?: PlatformCustomizations;
  aiGeneratedDisclosure?: boolean;
  scheduledAt?: string | Date | null;
};

export type SocialPostRecord = {
  id: string;
  organizationId: string;
  title: string | null;
  caption: string;
  contentType: SocialContentType;
  mediaUrls: string[];
  platforms: SocialPlatform[];
  platformCustomizations: PlatformCustomizations;
  aiGeneratedDisclosure: boolean;
  status: SocialPostStatus;
  scheduledAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PublishingQueueItem = {
  id: string;
  organizationId: string;
  postId: string;
  platform: SocialPlatform;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  scheduledFor: string;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  publishedExternalId: string | null;
};

export type PlatformCapability = {
  name: string;
  allowedContentTypes: SocialContentType[];
  maxCaptionLength: number;
  maxTitleLength?: number;
  maxHashtags: number;
  requiresMedia: boolean;
  supportedMediaTypes: ("image" | "video")[];
  aspectRatios: string[];
};

export const PLATFORM_CAPABILITY_MATRIX: Record<SocialPlatform, PlatformCapability> = {
  instagram: {
    name: "Instagram Business",
    allowedContentTypes: ["post", "reel_short", "story"],
    maxCaptionLength: 2200,
    maxHashtags: 30,
    requiresMedia: true,
    supportedMediaTypes: ["image", "video"],
    aspectRatios: ["1:1", "4:5", "9:16"],
  },
  facebook: {
    name: "Facebook Page",
    allowedContentTypes: ["post", "reel_short", "story", "video", "text"],
    maxCaptionLength: 63206,
    maxHashtags: 50,
    requiresMedia: false,
    supportedMediaTypes: ["image", "video"],
    aspectRatios: ["1:1", "16:9", "9:16"],
  },
  tiktok: {
    name: "TikTok for Business",
    allowedContentTypes: ["reel_short", "video"],
    maxCaptionLength: 2200,
    maxTitleLength: 150,
    maxHashtags: 30,
    requiresMedia: true,
    supportedMediaTypes: ["video"],
    aspectRatios: ["9:16"],
  },
  youtube: {
    name: "YouTube Channel",
    allowedContentTypes: ["reel_short", "video"],
    maxCaptionLength: 5000,
    maxTitleLength: 100,
    maxHashtags: 15,
    requiresMedia: true,
    supportedMediaTypes: ["video"],
    aspectRatios: ["16:9", "9:16"],
  },
};

export function adaptCaptionForPlatform(
  caption: string,
  platform: SocialPlatform,
  customizations?: PlatformCustomizations,
): string {
  const custom = customizations?.[platform];
  if (custom?.caption && custom.caption.trim()) {
    return custom.caption.trim();
  }
  const trimmed = caption.trim();
  const cap = PLATFORM_CAPABILITY_MATRIX[platform];
  if (trimmed.length > cap.maxCaptionLength) {
    return trimmed.slice(0, cap.maxCaptionLength);
  }
  return trimmed;
}

export function validatePlatformCapabilities(params: {
  platform: SocialPlatform;
  contentType: SocialContentType;
  mediaUrls?: string[];
  caption?: string;
  title?: string;
}): { ok: boolean; error?: string } {
  const { platform, contentType, mediaUrls = [], caption = "", title = "" } = params;
  const cap = PLATFORM_CAPABILITY_MATRIX[platform];
  if (!cap) {
    return { ok: false, error: `Bilinmeyen sosyal medya platformu: ${platform}` };
  }

  if (!cap.allowedContentTypes.includes(contentType)) {
    return {
      ok: false,
      error: `${cap.name} platformu "${contentType}" formatını desteklememektedir. Desteklenen formatlar: ${cap.allowedContentTypes.join(", ")}`,
    };
  }

  if (cap.requiresMedia && mediaUrls.length === 0) {
    return {
      ok: false,
      error: `${cap.name} için en az bir medya (görsel veya video) gereklidir.`,
    };
  }

  if ((platform === "tiktok" || platform === "youtube") && mediaUrls.length > 0) {
    const hasVideo = mediaUrls.some((url) => {
      const lower = url.toLowerCase().split("?")[0];
      return lower.endsWith(".mp4") || lower.endsWith(".mov") || lower.endsWith(".webm") || url.includes("video");
    });
    // In strict video platforms, warn or validate video extension
    if (!hasVideo && mediaUrls[0].match(/\.(jpg|jpeg|png|webp)$/i)) {
      return {
        ok: false,
        error: `${cap.name} yalnızca video içeriklerini (${cap.supportedMediaTypes.join(", ")}) kabul eder. Görsel (.jpg/.png) desteklenmez.`,
      };
    }
  }

  if (platform === "youtube" && (!title || !title.trim())) {
    return {
      ok: false,
      error: "YouTube Shorts ve Videoları için başlık (title) zorunludur.",
    };
  }

  if (cap.maxTitleLength && title && title.length > cap.maxTitleLength) {
    return {
      ok: false,
      error: `${cap.name} başlık sınırı ${cap.maxTitleLength} karakterdir (girilen: ${title.length}).`,
    };
  }

  if (caption && caption.length > cap.maxCaptionLength) {
    return {
      ok: false,
      error: `${cap.name} metin sınırı ${cap.maxCaptionLength} karakterdir (girilen: ${caption.length}).`,
    };
  }

  return { ok: true };
}

export function validateSocialPostInput(input: SocialPostInput): { ok: true; data: SocialPostInput } | { ok: false; error: string } {
  if (!input.caption || !input.caption.trim()) {
    return { ok: false, error: "Gönderi metni (caption) boş olamaz." };
  }
  if (!input.platforms || input.platforms.length === 0) {
    return { ok: false, error: "En az bir paylaşım platformu seçilmelidir." };
  }

  const validPlatforms: SocialPlatform[] = ["instagram", "facebook", "tiktok", "youtube"];
  for (const p of input.platforms) {
    if (!validPlatforms.includes(p)) {
      return { ok: false, error: `Desteklenmeyen platform: ${p}` };
    }
  }

  const contentType = input.contentType || "post";
  for (const p of input.platforms) {
    const capValidation = validatePlatformCapabilities({
      platform: p,
      contentType,
      mediaUrls: input.mediaUrls,
      caption: input.platformCustomizations?.[p]?.caption || input.caption,
      title: input.platformCustomizations?.[p]?.title || input.title,
    });
    if (!capValidation.ok) {
      return { ok: false, error: capValidation.error! };
    }
  }

  if (input.scheduledAt) {
    const scheduledDate = new Date(input.scheduledAt);
    if (isNaN(scheduledDate.getTime())) {
      return { ok: false, error: "Geçersiz planlanan tarih." };
    }
  }
  return { ok: true, data: input };
}
