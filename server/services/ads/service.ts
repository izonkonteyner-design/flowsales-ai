import "server-only";

import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import {
  adCampaignInputSchema,
  type AdCampaignInput,
  type AdCampaignRecord,
  type AdPlatform,
  type AdsDiagnosticResult,
} from "./domain";
import { logger } from "@/lib/logger";

/**
 * Diagnostic probe for Google Ads and Meta Ads platform connections.
 * Verifies credentials and account state read-only without executing live spend.
 */
export async function checkAdsPlatformDiagnostics(
  organizationId: string,
  platform: AdPlatform,
): Promise<AdsDiagnosticResult> {
  const admin = createSupabaseAdminClient();
  const missingRequirements: string[] = [];

  if (platform === "google_ads") {
    const hasClientId = Boolean(
      process.env.GOOGLE_CLIENT_ID?.trim() || process.env.GOOGLE_ADS_CLIENT_ID?.trim(),
    );
    const hasClientSecret = Boolean(
      process.env.GOOGLE_CLIENT_SECRET?.trim() || process.env.GOOGLE_ADS_CLIENT_SECRET?.trim(),
    );
    const isConfigured = hasClientId && hasClientSecret;

    if (!isConfigured) {
      missingRequirements.push("Google Ads / Cloud OAuth kimlik bilgileri Vercel ortamında eksik.");
    }

    const { data: connection } = await admin
      .from("channel_connections")
      .select("id, status, display_name, external_account_id, scopes")
      .eq("organization_id", organizationId)
      .eq("provider", "google")
      .maybeSingle();

    const isConnected = connection?.status === "connected";
    if (!isConnected) {
      missingRequirements.push("Google işletme hesabı entegrasyonlar sayfasından bağlanmalıdır.");
    }

    return {
      platform,
      isConfigured,
      isConnected,
      accountId: connection?.external_account_id ?? null,
      accountName: connection?.display_name ?? null,
      statusText: isConnected
        ? "Google hesabı bağlı. Reklam taslağı oluşturulabilir."
        : isConfigured
          ? "Google OAuth hazır. Hesap bağlantısı bekleniyor."
          : "Google kimlik bilgileri yapılandırılmalıdır.",
      canPublishLive: false, // Invariant: Live publication always gated by approval
      missingRequirements,
    };
  }

  // Meta Ads (Facebook & Instagram Ads)
  const hasAppId = Boolean(process.env.META_CLIENT_ID?.trim() || process.env.META_APP_ID?.trim());
  const hasAppSecret = Boolean(
    process.env.META_CLIENT_SECRET?.trim() || process.env.META_APP_SECRET?.trim(),
  );
  const isConfigured = hasAppId && hasAppSecret;

  if (!isConfigured) {
    missingRequirements.push("Meta Developer App kimlik bilgileri Vercel ortamında eksik.");
  }

  const { data: fbConn } = await admin
    .from("channel_connections")
    .select("id, status, display_name, external_account_id, scopes")
    .eq("organization_id", organizationId)
    .in("provider", ["facebook", "instagram"])
    .eq("status", "connected")
    .maybeSingle();

  const isConnected = Boolean(fbConn);
  if (!isConnected) {
    missingRequirements.push("Facebook Sayfası veya Instagram Profesyonel hesabı bağlanmalıdır.");
  }

  return {
    platform,
    isConfigured,
    isConnected,
    accountId: fbConn?.external_account_id ?? null,
    accountName: fbConn?.display_name ?? null,
    statusText: isConnected
      ? "Meta hesabı bağlı. Reklam seti ve taslak hazırlanabilir."
      : isConfigured
        ? "Meta OAuth hazır. Facebook/Instagram bağlantısı bekleniyor."
        : "Meta kimlik bilgileri yapılandırılmalıdır.",
    canPublishLive: false,
    missingRequirements,
  };
}

/**
 * Creates an ad campaign draft in the organization.
 */
export async function saveCampaignDraft(
  input: AdCampaignInput,
  userId: string,
): Promise<{ success: boolean; campaign?: AdCampaignRecord; error?: string }> {
  const parsed = adCampaignInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Geçersiz reklam verisi." };
  }

  const admin = createSupabaseAdminClient();
  const data = parsed.data;

  try {
    const { data: record, error } = await admin
      .from("ad_campaigns")
      .insert({
        organization_id: data.organizationId,
        platform: data.platform,
        campaign_name: data.campaignName,
        objective: data.objective,
        daily_budget_cents: Math.round(data.dailyBudget * 100),
        currency: data.currency,
        targeting: data.targeting,
        ad_group_name: data.adGroupName,
        keywords: data.keywords,
        headlines: data.headlines,
        descriptions: data.descriptions,
        final_url: data.finalUrl,
        status: "draft",
        created_by: userId,
      })
      .select()
      .single();

    if (error || !record) {
      logger.error("ads.save_draft_failed", { error: error?.message });
      return { success: false, error: error?.message ?? "Taslak kaydedilemedi." };
    }

    return {
      success: true,
      campaign: {
        id: record.id,
        organizationId: record.organization_id,
        platform: record.platform,
        campaignName: record.campaign_name,
        objective: record.objective,
        status: record.status,
        dailyBudgetCents: record.daily_budget_cents,
        currency: record.currency,
        targeting: record.targeting,
        adGroupName: record.ad_group_name,
        keywords: record.keywords ?? [],
        headlines: record.headlines ?? [],
        descriptions: record.descriptions ?? [],
        finalUrl: record.final_url,
        approvalRequestId: record.approval_request_id,
        approvedBy: record.approved_by,
        approvedAt: record.approved_at,
        createdBy: record.created_by,
        createdAt: record.created_at,
        updatedAt: record.updated_at,
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Beklenmeyen hata." };
  }
}

/**
 * Submits an ad campaign draft to the enterprise approval queue.
 * Strict safety invariant: No ad campaign is ever published or funded without explicit approval.
 */
export async function submitCampaignForApproval(params: {
  campaignId: string;
  organizationId: string;
  userId: string;
}): Promise<{ success: boolean; approvalId?: string; error?: string }> {
  const admin = createSupabaseAdminClient();

  const { data: campaign, error: fetchErr } = await admin
    .from("ad_campaigns")
    .select("*")
    .eq("id", params.campaignId)
    .eq("organization_id", params.organizationId)
    .maybeSingle();

  if (fetchErr || !campaign) {
    return { success: false, error: "Reklam kampanyası bulunamadı." };
  }

  if (campaign.status !== "draft" && campaign.status !== "rejected") {
    return { success: false, error: `Kampanya mevcut durumu (${campaign.status}) nedeniyle onaya gönderilemez.` };
  }

  const dailyBudgetLira = campaign.daily_budget_cents / 100;
  const platformLabel = campaign.platform === "google_ads" ? "Google Ads" : "Meta Ads";

  try {
    const approvalId = randomUUID();
    const { data: approval, error: approvalErr } = await admin
      .from("ai_approval_requests")
      .insert({
        id: approvalId,
        organization_id: params.organizationId,
        run_id: `ads-${campaign.id}`,
        requested_by: params.userId,
        lead_id: campaign.id,
        capability: "commercial",
        status: "pending",
        summary: `${platformLabel} Kampanyası Harcama Onayı: "${campaign.campaign_name}" (Günlük Bütçe: ${dailyBudgetLira} ${campaign.currency})`,
        actions: [
          {
            type: "draft_quote",
            targetId: campaign.id,
            description: `${platformLabel} üzerinde günlük ${dailyBudgetLira} ${campaign.currency} bütçeli reklam yayınlama yetkisi.`,
            parameters: {
              platform: campaign.platform,
              campaignId: campaign.id,
              dailyBudget: dailyBudgetLira,
              currency: campaign.currency,
            },
          },
        ],
        evidence: [
          {
            source: "user_input",
            fact: `Kullanıcı ${campaign.campaign_name} kampanyası için onay talebi oluşturdu.`,
          },
        ],
        money: [
          {
            amount: dailyBudgetLira,
            currency: campaign.currency,
            confidence: 1,
          },
        ],
        reasons: [
          "Ad spend harcaması gerektiren tüm işlemler kurumsal güvenlik kuralları gereği yönetici onayı gerektirir.",
          "Onay verilmeden önce hedefleme ve günlük bütçe incelenmelidir.",
        ],
        provider: "flowsales-ads",
        model: "ads-safety-v1",
        expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        version: 1,
      })
      .select("id")
      .single();

    if (approvalErr || !approval) {
      logger.error("ads.submit_approval_insert_failed", { error: approvalErr?.message });
      return { success: false, error: approvalErr?.message ?? "Onay talebi oluşturulamadı." };
    }

    await admin
      .from("ad_campaigns")
      .update({
        status: "review_pending",
        approval_request_id: approval.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", campaign.id);

    return { success: true, approvalId: approval.id };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Onay talebi oluşturulamadı.",
    };
  }
}

/**
 * Fetches ad campaigns for an organization.
 */
export async function getAdCampaigns(organizationId: string): Promise<AdCampaignRecord[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("ad_campaigns")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !data) return [];
  return data.map((record) => ({
    id: record.id,
    organizationId: record.organization_id,
    platform: record.platform,
    campaignName: record.campaign_name,
    objective: record.objective,
    status: record.status,
    dailyBudgetCents: record.daily_budget_cents,
    currency: record.currency,
    targeting: record.targeting,
    adGroupName: record.ad_group_name,
    keywords: record.keywords ?? [],
    headlines: record.headlines ?? [],
    descriptions: record.descriptions ?? [],
    finalUrl: record.final_url,
    approvalRequestId: record.approval_request_id,
    approvedBy: record.approved_by,
    approvedAt: record.approved_at,
    createdBy: record.created_by,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  }));
}
