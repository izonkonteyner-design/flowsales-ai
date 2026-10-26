"use server";

import { revalidatePath } from "next/cache";
import { canWriteSalesRecords } from "@/lib/workspace-roles";
import { loadWorkspaceContext, type WorkspaceContext } from "@/server/services/workspace-context";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import {
  validateSocialPostInput,
  generateSocialCaptionSuggestions,
  type SocialPlatform,
  type SocialContentType,
  type PlatformCustomizations,
} from "@/server/services/integrations/social-publisher";
import {
  checkAdsPlatformDiagnostics,
  saveCampaignDraft,
  submitCampaignForApproval,
} from "@/server/services/ads/service";
import type { AdPlatform, AdCampaignInput } from "@/server/services/ads/domain";
import {
  generateCreativeProductionBrief,
  saveCreativeBrief,
  type CreativeFormat,
  type ShotListItem,
} from "@/server/services/creative/pipeline";

const DEMO_ORGANIZATION_ID = "d3e00000-0000-0000-0000-000000000000";

function canManageSocialPosts(ctx: WorkspaceContext | null): ctx is WorkspaceContext {
  if (!ctx?.organization?.id || !ctx.userId) {
    return false;
  }
  if (ctx.mode !== "live" || ctx.organization.id === DEMO_ORGANIZATION_ID) {
    return false;
  }
  return canWriteSalesRecords(ctx.role);
}

export async function createSocialPostAction(formData: FormData): Promise<void> {
  const ctx = await loadWorkspaceContext();
  if (!canManageSocialPosts(ctx)) return;

  const caption = formData.get("caption")?.toString() ?? "";
  const title = formData.get("title")?.toString() ?? "";
  const contentType = (formData.get("contentType")?.toString() || "post") as SocialContentType;
  const rawPlatforms = formData.getAll("platforms").map((p) => p.toString());
  const scheduledAt = formData.get("scheduledAt")?.toString() || null;
  const statusInput = formData.get("status")?.toString() || "draft";
  const mediaUrl = formData.get("mediaUrl")?.toString()?.trim() || "";
  const mediaUrls = mediaUrl ? [mediaUrl] : [];
  const aiGeneratedDisclosure = formData.get("aiGeneratedDisclosure") === "true" || formData.get("aiGeneratedDisclosure") === "on";

  // Platform-specific customizations from form
  const rawCustomizations = formData.get("platformCustomizations")?.toString();
  let platformCustomizations: PlatformCustomizations = {};
  if (rawCustomizations) {
    try {
      platformCustomizations = JSON.parse(rawCustomizations);
    } catch {
      platformCustomizations = {};
    }
  }

  const validPlatforms: SocialPlatform[] = ["instagram", "facebook", "tiktok", "youtube", "google"];
  const platforms = rawPlatforms.filter((p): p is SocialPlatform => validPlatforms.includes(p as SocialPlatform));

  if (platforms.length === 0) return;

  const validation = validateSocialPostInput({
    caption,
    title,
    contentType,
    mediaUrls,
    platforms,
    platformCustomizations,
    aiGeneratedDisclosure,
    scheduledAt,
  });

  if (!validation.ok) return;

  const admin = createSupabaseAdminClient();
  const status = statusInput === "scheduled" && scheduledAt ? "scheduled" : "draft";

  const { data: post, error } = await admin.from("social_posts").insert({
    organization_id: ctx.organization.id,
    workspace_id: ctx.organization.id,
    title: title.trim() || null,
    caption: caption.trim(),
    content: caption.trim(),
    content_type: contentType,
    platforms,
    platform: platforms.length === 1 ? platforms[0] : (platforms.length === 2 && platforms.includes("instagram") && platforms.includes("facebook")) ? "both" : "all",
    media_urls: mediaUrls,
    platform_customizations: platformCustomizations,
    ai_generated_disclosure: aiGeneratedDisclosure,
    status,
    scheduled_at: status === "scheduled" ? new Date(scheduledAt!).toISOString() : null,
    created_by: ctx.userId,
  }).select("id").single();

  if (error || !post) return;

  if (status === "scheduled" && scheduledAt) {
    for (const platform of platforms) {
      await admin.from("social_publishing_queue").insert({
        organization_id: ctx.organization.id,
        post_id: post.id,
        platform,
        status: "pending",
        scheduled_for: new Date(scheduledAt).toISOString(),
      });
    }
  }

  revalidatePath("/social");
}

export async function generateCaptionSuggestionsAction(params: {
  topic: string;
  callToAction?: string;
  platform?: SocialPlatform;
  contentType?: string;
  tone?: string;
  language?: "tr" | "en" | "auto";
}) {
  const ctx = await loadWorkspaceContext();
  if (!ctx?.organization?.id) {
    return { success: false, error: "Oturum gerekli." };
  }
  if (!canManageSocialPosts(ctx)) {
    return { success: false, error: "Bu işlem için yazma yetkisi olan canlı bir çalışma alanı gereklidir." };
  }

  const topic = params.topic?.trim();
  if (!topic) {
    return { success: false, error: "İçerik konusu girilmelidir." };
  }

  try {
    const suggestions = await generateSocialCaptionSuggestions({
      topic,
      callToAction: params.callToAction?.trim(),
      platform: params.platform,
      contentType: params.contentType,
      tone: params.tone,
      language: params.language,
    });
    return { success: true, suggestions };
  } catch {
    return { success: false, error: "AI metin önerisi üretilemedi." };
  }
}

export async function deleteSocialPostAction(postId: string): Promise<void> {
  const ctx = await loadWorkspaceContext();
  if (!canManageSocialPosts(ctx)) return;

  const admin = createSupabaseAdminClient();
  await admin.from("social_posts")
    .delete()
    .eq("id", postId)
    .eq("organization_id", ctx.organization.id);

  revalidatePath("/social");
}

export async function checkAdsDiagnosticsAction(platform: AdPlatform) {
  const ctx = await loadWorkspaceContext();
  if (!ctx?.organization?.id) {
    throw new Error("Çalışma alanı oturumu bulunamadı.");
  }
  return checkAdsPlatformDiagnostics(ctx.organization.id, platform);
}

export async function saveCampaignDraftAction(input: Omit<AdCampaignInput, "organizationId">) {
  const ctx = await loadWorkspaceContext();
  if (!canManageSocialPosts(ctx)) {
    return { success: false, error: "Bu işlem için yetkiniz bulunmamaktadır." };
  }

  const result = await saveCampaignDraft(
    {
      ...input,
      organizationId: ctx.organization.id,
    },
    ctx.userId ?? "system",
  );

  if (result.success) {
    revalidatePath("/social");
  }
  return result;
}

export async function submitCampaignForApprovalAction(campaignId: string) {
  const ctx = await loadWorkspaceContext();
  if (!canManageSocialPosts(ctx)) {
    return { success: false, error: "Bu işlem için yetkiniz bulunmamaktadır." };
  }

  const result = await submitCampaignForApproval({
    campaignId,
    organizationId: ctx.organization.id,
    userId: ctx.userId ?? "system",
  });

  if (result.success) {
    revalidatePath("/social");
  }
  return result;
}

export async function generateCreativeBriefAction(params: {
  topic: string;
  productOrService?: string;
  targetAudience?: string;
  format?: CreativeFormat;
  language?: "tr" | "en";
}) {
  return generateCreativeProductionBrief(params);
}

export async function saveCreativeBriefAction(params: {
  title: string;
  concept: string;
  format: CreativeFormat;
  dimensions: string;
  visualPrompt: string;
  shotList: ShotListItem[];
  voiceoverScript?: string | null;
  overlayTexts?: string[];
  thumbnailConcept?: string | null;
  mappedCampaignId?: string | null;
  mappedSocialPostId?: string | null;
}) {
  const ctx = await loadWorkspaceContext();
  if (!canManageSocialPosts(ctx)) {
    return { success: false, error: "Bu işlem için yetkiniz bulunmamaktadır." };
  }

  const result = await saveCreativeBrief({
    organizationId: ctx.organization.id,
    userId: ctx.userId ?? "system",
    brief: params,
  });

  if (result.success) {
    revalidatePath("/social");
  }
  return result;
}

