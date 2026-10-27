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
  generateAdCampaignSuggestions,
  executeCampaignDeployment,
} from "@/server/services/ads/service";
import type { AdPlatform, AdCampaignInput, CampaignObjective } from "@/server/services/ads/domain";
import {
  generateCreativeProductionBrief,
  saveCreativeBrief,
  type CreativeFormat,
  type ShotListItem,
} from "@/server/services/creative/pipeline";
import {
  uploadMarketingMediaAsset,
  reanalyzeMarketingMediaAsset,
} from "@/server/services/media/service";
import type { MediaAnalysisResult, ManualMediaInput } from "@/server/services/media/domain";
import {
  generateMultiplatformSocialDrafts,
} from "@/server/services/social/engine";
import {
  getMarketingPerformanceData,
  generateMarketingOptimizationAdvice,
} from "@/server/services/analytics/service";

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

/**
 * Uploads media, runs honest AI analysis, and saves to marketing assets.
 */
export async function uploadMarketingMediaAction(formData: FormData) {
  const ctx = await loadWorkspaceContext();
  if (!canManageSocialPosts(ctx)) {
    return { success: false, error: "Yetkisiz işlem veya demo ortamında medya yüklenemez." };
  }

  const file = formData.get("file") as File | null;
  if (!file || !(file instanceof File)) {
    return { success: false, error: "Geçerli bir medya dosyası seçilmedi." };
  }

  // Parse optional manual product information
  const manualProductOrService = formData.get("manualProductOrService")?.toString()?.trim();
  const manualCategory = formData.get("manualCategory")?.toString()?.trim();
  const manualFeaturesRaw = formData.get("manualFeatures")?.toString()?.trim();
  const manualTargetCity = formData.get("manualTargetCity")?.toString()?.trim();
  const manualTargetAudience = formData.get("manualTargetAudience")?.toString()?.trim();

  const manualInput: ManualMediaInput | undefined =
    manualProductOrService || manualCategory || manualFeaturesRaw
      ? {
          productOrService: manualProductOrService,
          productCategory: manualCategory,
          features: manualFeaturesRaw
            ? manualFeaturesRaw.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)
            : undefined,
          targetCity: manualTargetCity,
          targetAudience: manualTargetAudience,
        }
      : undefined;

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const asset = await uploadMarketingMediaAsset({
      organizationId: ctx.organization.id,
      userId: ctx.userId,
      fileBuffer: buffer,
      fileName: file.name,
      fileType: file.type,
      fileSizeBytes: file.size,
      manualInput,
    });

    revalidatePath("/social");
    return { success: true, asset };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Medya yükleme işlemi başarısız oldu.",
    };
  }
}

/**
 * Re-analyzes an existing marketing media asset with optional manual inputs.
 */
export async function reanalyzeMarketingMediaAction(params: {
  assetId: string;
  manualInput?: ManualMediaInput;
}) {
  const ctx = await loadWorkspaceContext();
  if (!canManageSocialPosts(ctx)) {
    return { success: false, error: "Yetkisiz işlem veya demo ortamında analiz tekrarlanamaz." };
  }

  try {
    const asset = await reanalyzeMarketingMediaAsset({
      assetId: params.assetId,
      organizationId: ctx.organization.id,
      manualInput: params.manualInput,
    });

    if (!asset) {
      return { success: false, error: "Medya kaydı bulunamadı." };
    }

    revalidatePath("/social");
    return { success: true, asset };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Görsel analizi tekrarlanamadı.",
    };
  }
}

/**
 * Generates tailored drafts for all platforms based on media analysis.
 */
export async function generateMultiplatformSocialDraftsAction(params: {
  analysis: MediaAnalysisResult;
  mediaUrl?: string;
  companyName?: string;
  websiteUrl?: string;
  language?: "tr" | "en";
  targetCity?: string;
}) {
  const ctx = await loadWorkspaceContext();
  if (!ctx?.organization?.id) {
    return { success: false, error: "Oturum gerekli." };
  }

  // Fetch verified products for context
  const admin = createSupabaseAdminClient();
  let verifiedCatalog: string[] = [];
  try {
    const { data: prods } = await admin
      .from("products")
      .select("name")
      .eq("organization_id", ctx.organization.id)
      .limit(10);
    if (prods && prods.length > 0) {
      verifiedCatalog = prods.map((p) => p.name).filter(Boolean);
    }
  } catch {
    verifiedCatalog = [];
  }

  const targetCity = params.targetCity || ctx.organization.city || "Marmara Bölgesi";

  try {
    const campaignDraft = await generateMultiplatformSocialDrafts({
      analysis: params.analysis,
      mediaUrl: params.mediaUrl,
      companyName: params.companyName || ctx.organization.name,
      websiteUrl: params.websiteUrl || ctx.organization.website || "https://flowsales-ai-six.vercel.app",
      language: params.language,
      targetCity,
      verifiedCatalog,
    });
    return { success: true, campaignDraft };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Sosyal medya taslakları üretilemedi.",
    };
  }
}

/**
 * Generates Google Ads or Meta Ads campaign proposals using AI.
 */
export async function generateAdCampaignAiAction(params: {
  platform: AdPlatform;
  topic: string;
  productOrService?: string;
  objective?: CampaignObjective;
  dailyBudget?: number;
  targetAudience?: string;
  language?: "tr" | "en";
  websiteUrl?: string;
}) {
  const ctx = await loadWorkspaceContext();
  if (!ctx?.organization?.id) {
    return { success: false, error: "Oturum gerekli." };
  }

  try {
    const suggestions = await generateAdCampaignSuggestions(params);
    return { success: true, suggestions };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Reklam önerisi üretilemedi.",
    };
  }
}

/**
 * Executes campaign deployment in PAUSED state after human approval confirmation.
 */
export async function executeCampaignDeploymentAction(params: {
  campaignId: string;
  livePublishConfirmed: boolean;
}) {
  const ctx = await loadWorkspaceContext();
  if (!canManageSocialPosts(ctx)) {
    return { success: false, error: "Bu işlem için yetkiniz bulunmamaktadır." };
  }

  const result = await executeCampaignDeployment({
    campaignId: params.campaignId,
    organizationId: ctx.organization.id,
    userId: ctx.userId ?? "system",
    livePublishConfirmed: params.livePublishConfirmed,
  });

  if (result.success) {
    revalidatePath("/social");
  }
  return result;
}

/**
 * Cancels a scheduled social post and clears queue items.
 */
export async function cancelScheduledSocialPostAction(postId: string) {
  const ctx = await loadWorkspaceContext();
  if (!canManageSocialPosts(ctx)) {
    return { success: false, error: "Bu işlem için yetkiniz bulunmamaktadır." };
  }

  const admin = createSupabaseAdminClient();
  await admin
    .from("social_posts")
    .update({ status: "draft", scheduled_at: null, updated_at: new Date().toISOString() })
    .eq("id", postId)
    .eq("organization_id", ctx.organization.id);

  await admin
    .from("social_publishing_queue")
    .delete()
    .eq("post_id", postId)
    .eq("organization_id", ctx.organization.id);

  revalidatePath("/social");
  return { success: true };
}

/**
 * Submits a social media post for enterprise approval.
 */
export async function submitSocialPostForApprovalAction(postId: string) {
  const ctx = await loadWorkspaceContext();
  if (!canManageSocialPosts(ctx)) {
    return { success: false, error: "Bu işlem için yetkiniz bulunmamaktadır." };
  }

  const admin = createSupabaseAdminClient();
  const { data: post, error } = await admin
    .from("social_posts")
    .select("*")
    .eq("id", postId)
    .eq("organization_id", ctx.organization.id)
    .single();

  if (error || !post) {
    return { success: false, error: "Gönderi bulunamadı." };
  }

  const approvalId = crypto.randomUUID();
  const { error: approvalErr } = await admin.from("ai_approval_requests").insert({
    id: approvalId,
    organization_id: ctx.organization.id,
    run_id: `social-${post.id}`,
    requested_by: ctx.userId,
    lead_id: post.id,
    capability: "commercial",
    status: "pending",
    summary: `Sosyal Medya Yayın Onayı: "${post.title || post.caption.slice(0, 40)}" (${Array.isArray(post.platforms) ? post.platforms.join(", ") : "Multi"})`,
    actions: [
      {
        type: "draft_quote",
        targetId: post.id,
        description: "Sosyal medya kanallarında yayınlama izni.",
        parameters: { postId: post.id, platforms: post.platforms },
      },
    ],
    evidence: [
      { source: "user_input", fact: `Kullanıcı ${post.title || "gönderi"} için yayın onayı istedi.` },
    ],
    money: [],
    reasons: ["Sosyal medya yayını kurumsal onay akışına tabidir."],
    provider: "flowsales-social",
    model: "social-review-v1",
    expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    version: 1,
  });

  if (approvalErr) {
    return { success: false, error: approvalErr.message };
  }

  await admin
    .from("social_posts")
    .update({ status: "review_pending", updated_at: new Date().toISOString() })
    .eq("id", post.id);

  revalidatePath("/social");
  return { success: true, approvalId };
}

/**
 * Retrieves marketing performance analytics and AI optimization advice.
 */
export async function getMarketingOptimizationAdviceAction() {
  const ctx = await loadWorkspaceContext();
  if (!ctx?.organization?.id) {
    return { success: false, error: "Oturum gerekli." };
  }

  try {
    const metrics = await getMarketingPerformanceData(ctx.organization.id);
    const advice = await generateMarketingOptimizationAdvice({
      social: metrics.social,
      ads: metrics.ads,
      companyName: ctx.organization.name,
    });

    return { success: true, metrics, advice };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Optimizasyon analizi oluşturulamadı.",
    };
  }
}

