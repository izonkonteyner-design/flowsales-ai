export type SocialPlatform = "instagram" | "facebook";

export type SocialPostStatus = "draft" | "scheduled" | "published" | "failed" | "cancelled";

export type SocialPostInput = {
  title?: string;
  caption: string;
  mediaUrls?: string[];
  platforms: SocialPlatform[];
  scheduledAt?: string | Date | null;
};

export type SocialPostRecord = {
  id: string;
  organizationId: string;
  title: string | null;
  caption: string;
  mediaUrls: string[];
  platforms: SocialPlatform[];
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

export function adaptCaptionForPlatform(caption: string, platform: SocialPlatform): string {
  const trimmed = caption.trim();
  if (platform === "instagram") {
    return trimmed;
  }
  if (platform === "facebook") {
    return trimmed;
  }
  return trimmed;
}

export function validateSocialPostInput(input: SocialPostInput): { ok: true; data: SocialPostInput } | { ok: false; error: string } {
  if (!input.caption || !input.caption.trim()) {
    return { ok: false, error: "Gönderi metni (caption) boş olamaz." };
  }
  if (!input.platforms || input.platforms.length === 0) {
    return { ok: false, error: "En az bir paylaşım platformu seçilmelidir." };
  }
  for (const p of input.platforms) {
    if (p !== "instagram" && p !== "facebook") {
      return { ok: false, error: `Desteklenmeyen platform: ${p}` };
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
