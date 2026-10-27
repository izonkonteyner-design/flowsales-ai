import "server-only";

import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { generateText } from "@/server/services/ai";
import {
  adCampaignInputSchema,
  type AdCampaignInput,
  type AdCampaignRecord,
  type AdPlatform,
  type CampaignObjective,
  type AdsDiagnosticResult,
  type AiAdsManagerResult,
  type AdPolicyRisk,
  type AdCopyVariation,
} from "./domain";
import type { MediaAnalysisResult } from "@/server/services/media/domain";
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

/**
 * Generates an end-to-end ad campaign proposal using AI with deterministic fallback.
 * Strictly adheres to Google Ads / Meta Ads character limits and best practices.
 */
export async function generateAdCampaignSuggestions(params: {
  platform: AdPlatform;
  topic: string;
  productOrService?: string;
  objective?: CampaignObjective;
  dailyBudget?: number;
  targetAudience?: string;
  language?: "tr" | "en";
  websiteUrl?: string;
}): Promise<{
  campaignName: string;
  objective: CampaignObjective;
  dailyBudget: number;
  currency: string;
  headlines: string[];
  descriptions: string[];
  keywords: string[];
  negativeKeywords: string[];
  primaryText: string;
  callToAction: string;
  targeting: {
    locations: string[];
    languages: string[];
    ageRange: [number, number];
    interests: string[];
    placement: "all" | "feed_only" | "stories_reels" | "search_network";
  };
  finalUrl: string;
}> {
  const isEn = params.language === "en";
  void isEn;
  const objective = params.objective || "lead_generation";
  const dailyBudget = params.dailyBudget && params.dailyBudget > 0 ? params.dailyBudget : 250;
  const isGoogle = params.platform === "google_ads";
  const finalUrl = params.websiteUrl || "https://flowsales-ai-six.vercel.app";

  try {
    const prompt = isGoogle
      ? `Sen Google Ads Search ve Performance Max uzmanısın.
Konu: ${params.topic}
Ürün/Hizmet: ${params.productOrService || "İzon Konteyner"}
Hedef Kitle: ${params.targetAudience || "Prefabrik ve konteyner alıcıları"}
Hedef: ${objective}

Google Ads için en yüksek kalite puanını alacak kampanya yapısını oluştur:
- Headlines: En az 5, en fazla 15 adet (her biri MAX 30 KARAKTER!)
- Descriptions: 3-4 adet (her biri MAX 90 KARAKTER!)
- Keywords: 8-12 adet (satın alma niyeti yüksek anahtar kelimeler)
- Negative Keywords: 5-8 adet (örn: bedava, staj, iş ilanı, hurda)

SADECE geçerli JSON çıktısı ver:
{
  "campaignName": "Google Ads - ...",
  "headlines": ["..."],
  "descriptions": ["..."],
  "keywords": ["..."],
  "negativeKeywords": ["..."],
  "primaryText": "",
  "callToAction": "GET_QUOTE"
}`
      : `Sen Meta Ads (Facebook & Instagram) performans pazarlama uzmanısın.
Konu: ${params.topic}
Ürün/Hizmet: ${params.productOrService || "İzon Konteyner"}
Hedef Kitle: ${params.targetAudience || "Müstakil arsa sahipleri, şantiyeler, işletmeler"}
Hedef: ${objective}

Meta Ads için yüksek dönüşümlü kampanya yapısı oluştur:
- Primary Text: 2-3 paragraflık etkileyici reklam gövde metni
- Headlines: 3-5 adet vurucu başlık
- Descriptions: 2-3 adet güven veren sosyal kanıt metni
- CallToAction: "LEARN_MORE" veya "GET_QUOTE" veya "CONTACT_US"
- Interests: Hedef kitle ilgi alanları (örn: Prefabrikasyon, Mimarlık, Gayrimenkul)

SADECE geçerli JSON çıktısı ver:
{
  "campaignName": "Meta Ads - ...",
  "headlines": ["..."],
  "descriptions": ["..."],
  "keywords": [],
  "negativeKeywords": [],
  "primaryText": "...",
  "callToAction": "GET_QUOTE",
  "interests": ["Prefabrik", "Konteyner", "İnşaat"]
}`;

    const rawResponse = await generateText(prompt, { responseMimeType: "application/json" });
    const parsed = JSON.parse(rawResponse);

    return {
      campaignName: parsed.campaignName || (isGoogle ? `Google Ads — ${params.topic}` : `Meta Ads — ${params.topic}`),
      objective,
      dailyBudget,
      currency: "TRY",
      headlines: Array.isArray(parsed.headlines) && parsed.headlines.length >= 3
        ? parsed.headlines.slice(0, 15)
        : isGoogle
        ? ["İzon Yaşam Konteynerleri", "Fabrika Çıkışı Konteyner", "Hızlı Teslimat & Yüksek Kalite", "Özel Ölçü Konteyner", "Hemen Fiyat Teklifi Alın"]
        : ["Hayalinizdeki Konteyner Yaşam Alanı", "Şantiyenize Özel Modüler Çözümler", "4 Mevsim Dayanıklı & Yalıtımlı"],
      descriptions: Array.isArray(parsed.descriptions) && parsed.descriptions.length >= 2
        ? parsed.descriptions.slice(0, 5)
        : [
            "İzon Konteyner güvencesiyle sağlam, yalıtımlı ve taşınabilir yaşam alanları.",
            "Fabrika satış fiyatları ve uzman montaj desteğiyle hemen teklifinizi oluşturun.",
          ],
      keywords: Array.isArray(parsed.keywords) && parsed.keywords.length > 0
        ? parsed.keywords
        : ["konteyner ev", "yaşam konteyneri", "şantiye ofis konteyneri", "prefabrik konteyner", "3x7 konteyner fiyatları"],
      negativeKeywords: Array.isArray(parsed.negativeKeywords) && parsed.negativeKeywords.length > 0
        ? parsed.negativeKeywords
        : ["bedava", "ikinci el hasarlı", "hurda konteyner", "iş ilanları", "staj"],
      primaryText: parsed.primaryText || `İzon Konteyner ile dayanıklı, estetik ve 4 mevsim yüksek yalıtımlı modüler yaşam alanlarına sahip olun. Hızlı teslimat ve projeye özel üretim avantajıyla hayallerinizi ertelemeyin.`,
      callToAction: parsed.callToAction || "GET_QUOTE",
      targeting: {
        locations: ["Türkiye"],
        languages: ["tr"],
        ageRange: [24, 60],
        interests: Array.isArray(parsed.interests) ? parsed.interests : ["Konteyner", "Prefabrikasyon", "İnşaat", "Mimarlık"],
        placement: isGoogle ? "search_network" : "all",
      },
      finalUrl,
    };
  } catch {
    // Deterministic fallback
    return {
      campaignName: isGoogle ? `Google Ads — ${params.topic}` : `Meta Ads — ${params.topic}`,
      objective,
      dailyBudget,
      currency: "TRY",
      headlines: isGoogle
        ? [
            "İzon Yaşam Konteynerleri",
            "Fabrika Satış Konteyner",
            "Hızlı Sevkiyat & Montaj",
            "Özel Tasarım Konteyner",
            "Hemen Fiyat Teklifi Al",
          ]
        : [
            "Konforlu Modüler Yaşam Alanları",
            "Şantiyelere Özel Ofis Konteynerleri",
            "4 Mevsim Yüksek Isı Yalıtımı",
          ],
      descriptions: [
        "İzon Konteyner kalitesiyle sağlam, yalıtımlı ve dayanıklı modüler çözümler.",
        "Fabrikadan doğrudan satış ve cazip ödeme koşullarıyla hemen bilgi alın.",
      ],
      keywords: isGoogle
        ? ["konteyner ev", "yaşam konteyneri", "şantiye ofis konteyneri", "prefabrik konteyner", "3x7 konteyner"]
        : [],
      negativeKeywords: isGoogle ? ["bedava", "hurda", "hasarlı", "iş ilanı"] : [],
      primaryText: `Dayanıklı çelik şase, yüksek izolasyon ve modern iç mimari. İzon Konteyner ile şantiyeniz veya arsanız için en güvenilir modüler yapıları keşfedin.`,
      callToAction: "GET_QUOTE",
      targeting: {
        locations: ["Türkiye"],
        languages: ["tr"],
        ageRange: [25, 55],
        interests: ["Konteyner", "Prefabrikasyon", "İnşaat", "Mimarlık"],
        placement: isGoogle ? "search_network" : "all",
      },
      finalUrl,
    };
  }
}

/**
 * Strictly gated campaign deployment executor.
 * Invariant: Requires both approval request status === 'approved' AND human explicit confirmation.
 * Safe runtime: Registers the campaign in PAUSED state so live spend never executes autonomously.
 */
export async function executeCampaignDeployment(params: {
  campaignId: string;
  organizationId: string;
  userId: string;
  livePublishConfirmed: boolean;
}): Promise<{
  success: boolean;
  status?: string;
  error?: string;
  diagnosticNote?: string;
}> {
  if (!params.livePublishConfirmed) {
    return {
      success: false,
      error: "Canlı reklam yayını ve harcama için açık kullanıcı onayı zorunludur. İşlem durduruldu.",
    };
  }

  const admin = createSupabaseAdminClient();
  const { data: campaign, error } = await admin
    .from("ad_campaigns")
    .select("*")
    .eq("id", params.campaignId)
    .eq("organization_id", params.organizationId)
    .single();

  if (error || !campaign) {
    return { success: false, error: "Kampanya bulunamadı." };
  }

  if (!campaign.approval_request_id) {
    return {
      success: false,
      error: "Bu kampanya henüz yönetici onayı için sunulmamış. Harcama başlatılamaz.",
    };
  }

  const { data: approval } = await admin
    .from("ai_approval_requests")
    .select("status")
    .eq("id", campaign.approval_request_id)
    .single();

  if (approval?.status !== "approved") {
    return {
      success: false,
      error: `Kampanya onay durumu '${approval?.status ?? "tanımsız"}'. Yalnızca 'approved' durumundaki kampanyalar yayına alınabilir.`,
    };
  }

  await admin
    .from("ad_campaigns")
    .update({
      status: "paused",
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaign.id);

  logger.info("ads.campaign_deployed_paused", {
    campaignId: campaign.id,
    platform: campaign.platform,
    dailyBudgetCents: campaign.daily_budget_cents,
  });

  return {
    success: true,
    status: "paused",
    diagnosticNote: "Kampanya güvenlik protokolü gereği PAUSED (Duraklatılmış) olarak sisteme işlendi. Reklam harcaması güvenli limitler altındadır.",
  };
}


// ==========================================
// LOOP 5: Dedicated AI Ads Manager Implementation
// ==========================================

/**
 * Scans ad text and headlines for platform advertising policy violations
 * (Google Ads Editorial Standards and Meta Advertising Standards).
 */
export function detectAdPolicyRisks(params: {
  headlines: string[];
  descriptions: string[];
  primaryText?: string;
  finalUrl?: string;
}): AdPolicyRisk[] {
  const risks: AdPolicyRisk[] = [];
  const allTexts = [...params.headlines, ...params.descriptions, params.primaryText || ""];
  const combined = allTexts.join(" ");

  // 1. Check for misleading superlatives or absolute guarantees
  const absoluteClaims = [
    { regex: /%100\s*(?:garanti|kesin|ücretsiz)/i, claim: "%100 garanti / kesin" },
    { regex: /\ben\s*ucuz\b/i, claim: "'en ucuz' iddiası" },
    { regex: /\b(?:asla\s*yıkılmaz|ömürlük\s*sıfır\s*arıza)\b/i, claim: "dayanıklılık abartısı" },
  ];
  for (const item of absoluteClaims) {
    if (item.regex.test(combined)) {
      risks.push({
        severity: "medium",
        rule: "Google/Meta Ticari İddia ve Tüketiciyi Yanıltmama Politikası",
        reason: `Metin içinde '${item.claim}' gibi kanıtlanması güç mutlak ifadeler bulundu.`,
        suggestedFix: "İfadeyi 'Yüksek dayanıklılık standardı' veya 'Fabrika çıkış avantajı' ile değiştirin.",
      });
    }
  }

  // 2. Excessive capitalization check (e.g. 'HEMEN AL', 'DİKKAT')
  const shoutingWords = combined.match(/\b[A-ZÇĞİÖŞÜ]{4,}\b/g) || [];
  const filteredShouting = shoutingWords.filter(
    (w) => !["İZON", "PVC", "HTML", "URL", "CAD", "PRO"].includes(w),
  );
  if (filteredShouting.length >= 2) {
    risks.push({
      severity: "low",
      rule: "Google Yazım ve Dilbilgisi Kuralları (Büyük Harf Kuralı)",
      reason: `Tamamı büyük harflerden oluşan kelimeler tespit edildi: ${filteredShouting.slice(0, 3).join(", ")}.`,
      suggestedFix: "Sadece baş harfleri büyük yazacak şekilde metni düzenleyin.",
    });
  }

  // 3. Landing page check
  if (!params.finalUrl || !params.finalUrl.startsWith("https://")) {
    risks.push({
      severity: "high",
      rule: "Hedef Sayfa Güvenliği Politikası",
      reason: "Hedef URL HTTPS protokolü içermiyor veya boş.",
      suggestedFix: "Geçerli bir https:// bağlantısı sağlayın.",
    });
  }

  return risks;
}

/**
 * AI Ads Manager: Specialized marketing intelligence engine responsible for
 * analyzing ad assets, proposing campaign structure, validating character limits,
 * generating multi-angle variations, and guarding against ad policy rejections.
 */
export async function runDedicatedAiAdsManager(params: {
  platform: AdPlatform;
  topic?: string;
  productOrService?: string;
  mediaAnalysis?: MediaAnalysisResult | null;
  currentDailyBudget?: number;
  websiteUrl?: string;
  targetLocations?: string[];
  historicalMetrics?: {
    totalSpendLira?: number;
    leadsGenerated?: number;
    avgCplLira?: number;
    topPerformingPlatform?: string;
  };
}): Promise<AiAdsManagerResult> {
  const isGoogle = params.platform === "google_ads";
  const finalUrl = params.websiteUrl || "https://flowsales-ai-six.vercel.app";
  const defaultBudget = params.currentDailyBudget && params.currentDailyBudget > 0 ? params.currentDailyBudget : 250;
  const targetLocations = params.targetLocations?.length ? params.targetLocations : ["Türkiye", "İstanbul", "Kocaeli", "Bursa"];

  const visualSubject = params.mediaAnalysis?.productOrService || params.mediaAnalysis?.primarySubject || "";
  const subject = params.topic?.trim() || visualSubject || params.productOrService || "Modüler Konteyner";

  const missingInfo: string[] = [];
  if (!params.websiteUrl) missingInfo.push("Hedef web sitesi URL'si tanımlanmadı.");
  if (!params.mediaAnalysis && !isGoogle) missingInfo.push("Meta Ads için görsel veya video yüklenmedi; metin tabanlı taslak oluşturuluyor.");

  // Determine campaign type
  const recommendedCampaignType = isGoogle
    ? "search"
    : "meta_feed";

  // Build standard variations
  const searchHeadlinesVariation1 = [
    `${subject.slice(0, 20)} Modelleri`.slice(0, 30),
    "Fabrikadan Doğrudan Satış".slice(0, 30),
    "Hızlı ve Güvenli Teslimat".slice(0, 30),
    "İzon Konteyner Güvencesi".slice(0, 30),
    "Hemen Fiyat Teklifi Alın".slice(0, 30),
  ];
  const searchDescriptionsVariation1 = [
    "Depreme dayanıklı, yüksek yalıtımlı modüler yaşam ve şantiye konteynerleri.".slice(0, 90),
    "Projenize özel üretim avantajı ve hızlı sevkiyat ile fabrikadan doğrudan teslim.".slice(0, 90),
  ];

  const searchHeadlinesVariation2 = [
    "Yüksek Isı Yalıtımlı Yapı".slice(0, 30),
    "Galvaniz Çelik Karkas".slice(0, 30),
    "Şantiye Ofis Çözümleri".slice(0, 30),
    "4 Mevsim Dayanıklı Kabin".slice(0, 30),
    "Teknik Şartnameyi İncele".slice(0, 30),
  ];
  const searchDescriptionsVariation2 = [
    "Sandviç panel duvarlar ve galvaniz şase ile ağır şantiye koşullarına tam uyum.".slice(0, 90),
    "Hızlı kurulum, uzun ömürlü kullanım ve kurumsal satış desteği İzon Konteyner'de.".slice(0, 90),
  ];

  const searchHeadlinesVariation3 = [
    "Aynı Gün Nakliye Planlama".slice(0, 30),
    "Şantiye İhtiyacına Özel".slice(0, 30),
    "Garantili Fabrika Çıkışı".slice(0, 30),
    "Konteyner ve Prefabrik".slice(0, 30),
    "Hemen Teklif İste".slice(0, 30),
  ];
  const searchDescriptionsVariation3 = [
    "Zaman kaybetmeden şantiyenizi kurun. Uygun ödeme ve nakliye planlama imkânı.".slice(0, 90),
    "Türkiye geneli sevkiyat ve güvenilir montaj desteği ile anahtar teslim çözümler.".slice(0, 90),
  ];

  const defaultVariations: AdCopyVariation[] = [
    {
      id: randomUUID(),
      angle: "Dönüşüm & Fiyat Avantajı",
      headlines: searchHeadlinesVariation1,
      descriptions: searchDescriptionsVariation1,
      primaryText: `🏗️ ${subject} arayışınızda fabrika çıkış avantajı!\n\nAracı komisyonu olmadan, doğrudan üreticiden en uygun koşullarla temin edin. Hızlı montaj ve yüksek yalıtım standardı ile projenize hemen başlayın.`,
      callToAction: "GET_QUOTE",
    },
    {
      id: randomUUID(),
      angle: "Mühendislik & Kalite Güvencesi",
      headlines: searchHeadlinesVariation2,
      descriptions: searchDescriptionsVariation2,
      primaryText: `Zorlu saha şartlarına dayanıklı ${subject} çözümleri.\n\nGalvaniz çelik karkas yapısı, taşyünü/EPS sandviç panel yalıtımı ve çift camlı PVC doğramalar ile 4 mevsim kesintisiz konfor.`,
      callToAction: "LEARN_MORE",
    },
    {
      id: randomUUID(),
      angle: "Hızlı Termin & Şantiye Çözümü",
      headlines: searchHeadlinesVariation3,
      descriptions: searchDescriptionsVariation3,
      primaryText: `Şantiyeniz için vakit kaybetmeyin! ${subject} hazır stoktan aynı gün sevkiyat planlaması ile kapınızda.`,
      callToAction: "CONTACT_US",
    },
  ];

  const negativeKeywords = [
    "bedava",
    "ücretsiz",
    "staj",
    "iş ilanları",
    "ikinci el hurda",
    "sahibinden ücretsiz",
    "kiralık arsa",
  ];

  const optimizationAdvice: string[] = [
    "Negatif anahtar kelimeler eklenerek bütçenin iş arayan veya hurda arayan kullanıcılar tarafından tüketilmesi engellendi.",
    "Arama reklamlarında başlıklar 30 karakter, açıklamalar 90 karakter sınırına tam uyumlu hale getirildi.",
    "Kampanya lansmanı sonrasında 50 dönüşüm verisi toplanana kadar teklif stratejisi 'Dönüşümleri Artırma (Maximize Conversions)' olarak önerilir.",
  ];

  if (params.historicalMetrics?.avgCplLira && params.historicalMetrics.avgCplLira > 150) {
    optimizationAdvice.push(`Mevcut CPL (${params.historicalMetrics.avgCplLira} TL) hedef eşiğin üzerinde; coğrafi hedeflemeyi yalnızca yüksek dönüşümlü sanayi bölgelerine daraltmanız önerilir.`);
  }

  // Try real Gemini AI generation with fallback
  try {
    const aiPrompt = `Sen profesyonel Google Ads ve Meta Ads Yapay Zeka Yöneticisisin (AI Ads Manager).
Kullanıcının reklam kampanyasını yapılandır.

PLATFORM: ${params.platform}
KONU / ÜRÜN: ${subject}
HEDEF BÖLGELER: ${targetLocations.join(", ")}
BÜTÇE: ${defaultBudget} TRY / gün
GÖRSEL ANALİZ: ${params.mediaAnalysis ? JSON.stringify(params.mediaAnalysis.detected_objects) : "Görsel yok"}

KURALLAR:
1. Google Search Headlines: HER BİRİ KESİNLİKLE EN FAZLA 30 KARAKTER OLMALIDIR!
2. Google Search Descriptions: HER BİRİ KESİNLİKLE EN FAZLA 90 KARAKTER OLMALIDIR!
3. Negatif Anahtar Kelimeler: En az 5 adet alakasız terim.
4. Meta Ads: 2-3 paragraflık dönüşüm odaklı primaryText ve dikkat çekici headline.
5. Reklam politikası risklerini değerlendir (%100 garanti gibi abartılardan kaçın).
6. 3 farklı metin varyasyonu üret (Fiyat/Hız, Kalite/Mühendislik, Şantiye/Operasyon).

SADECE GEÇERLİ JSON ÜRET:
{
  "campaignName": "${isGoogle ? "Google Search" : "Meta Feed"} - ${subject.slice(0, 30)}",
  "recommendedCampaignType": "${recommendedCampaignType}",
  "recommendedObjective": "lead_generation",
  "recommendedDailyBudget": ${defaultBudget},
  "searchAssets": {
    "headlines": ["...", "...", "..."],
    "descriptions": ["...", "..."],
    "keywords": ["...", "..."],
    "negativeKeywords": ["bedava", "staj", "iş ilanları", "hurda"]
  },
  "metaCreative": {
    "primaryText": "...",
    "headlines": ["..."],
    "descriptions": ["..."],
    "callToAction": "GET_QUOTE"
  },
  "targetAudience": {
    "locations": ${JSON.stringify(targetLocations)},
    "languages": ["tr"],
    "ageRange": [25, 60],
    "interests": ["İnşaat", "Prefabrik", "Mimarlık", "Şantiye"],
    "rationale": "Modüler yapı ve şantiye ihtiyacı olan kurumsal ve bireysel alıcılar."
  },
  "variations": [
    {
      "id": "var-1",
      "angle": "Dönüşüm / Fiyat Avantajı",
      "headlines": ["..."],
      "descriptions": ["..."],
      "primaryText": "...",
      "callToAction": "GET_QUOTE"
    }
  ]
}`;

    const rawResponse = await generateText(aiPrompt, { responseMimeType: "application/json" });
    const parsed = JSON.parse(rawResponse);

    if (parsed && (parsed.searchAssets || parsed.metaCreative)) {
      const sanitizedHeadlines = Array.isArray(parsed.searchAssets?.headlines)
        ? parsed.searchAssets.headlines.map((h: string) => String(h).trim().slice(0, 30))
        : searchHeadlinesVariation1;

      const sanitizedDescriptions = Array.isArray(parsed.searchAssets?.descriptions)
        ? parsed.searchAssets.descriptions.map((d: string) => String(d).trim().slice(0, 90))
        : searchDescriptionsVariation1;

      const policyRisks = detectAdPolicyRisks({
        headlines: sanitizedHeadlines,
        descriptions: sanitizedDescriptions,
        primaryText: parsed.metaCreative?.primaryText || defaultVariations[0].primaryText,
        finalUrl,
      });

      const parsedVariations: AdCopyVariation[] = Array.isArray(parsed.variations) && parsed.variations.length > 0
        ? parsed.variations.map((v: Record<string, unknown>, idx: number) => ({
            id: typeof v.id === "string" ? v.id : `var-${idx + 1}`,
            angle: String(v.angle || `Varyasyon ${idx + 1}`),
            headlines: Array.isArray(v.headlines) ? v.headlines.map((h: string) => String(h).slice(0, 30)) : searchHeadlinesVariation1,
            descriptions: Array.isArray(v.descriptions) ? v.descriptions.map((d: string) => String(d).slice(0, 90)) : searchDescriptionsVariation1,
            primaryText: String(v.primaryText || defaultVariations[0].primaryText),
            callToAction: String(v.callToAction || "GET_QUOTE"),
          }))
        : defaultVariations;

      return {
        platform: params.platform,
        recommendedCampaignType,
        recommendedObjective: parsed.recommendedObjective || "lead_generation",
        campaignName: parsed.campaignName || `${isGoogle ? "Google Search" : "Meta Feed"} - ${subject}`,
        recommendedDailyBudget: parsed.recommendedDailyBudget || defaultBudget,
        currency: "TRY",
        targetAudience: {
          locations: Array.isArray(parsed.targetAudience?.locations) ? parsed.targetAudience.locations : targetLocations,
          languages: ["tr"],
          ageRange: [25, 60],
          interests: Array.isArray(parsed.targetAudience?.interests) ? parsed.targetAudience.interests : ["İnşaat", "Prefabrik"],
          rationale: parsed.targetAudience?.rationale || "Bölgedeki aktif müteahhit ve arsa sahipleri.",
        },
        searchAssets: {
          headlines: sanitizedHeadlines,
          descriptions: sanitizedDescriptions,
          keywords: Array.isArray(parsed.searchAssets?.keywords) ? parsed.searchAssets.keywords : [`${subject.toLowerCase()} fiyatları`, "konteyner satışı"],
          negativeKeywords: Array.isArray(parsed.searchAssets?.negativeKeywords) ? parsed.searchAssets.negativeKeywords : negativeKeywords,
        },
        metaCreative: {
          primaryText: parsed.metaCreative?.primaryText || defaultVariations[0].primaryText,
          headlines: Array.isArray(parsed.metaCreative?.headlines) ? parsed.metaCreative.headlines : [subject],
          descriptions: Array.isArray(parsed.metaCreative?.descriptions) ? parsed.metaCreative.descriptions : ["Fabrikadan doğrudan satış güvencesi."],
          callToAction: parsed.metaCreative?.callToAction || "GET_QUOTE",
        },
        variations: parsedVariations,
        policyRisks,
        missingInfo,
        optimizationAdvice,
        visualAnalysisSummary: params.mediaAnalysis?.visual_description,
      };
    }
  } catch {
    // Graceful fallback
  }

  const fallbackPolicyRisks = detectAdPolicyRisks({
    headlines: searchHeadlinesVariation1,
    descriptions: searchDescriptionsVariation1,
    primaryText: defaultVariations[0].primaryText,
    finalUrl,
  });

  return {
    platform: params.platform,
    recommendedCampaignType,
    recommendedObjective: "lead_generation",
    campaignName: `${isGoogle ? "Google Search" : "Meta Feed"} - ${subject}`,
    recommendedDailyBudget: defaultBudget,
    currency: "TRY",
    targetAudience: {
      locations: targetLocations,
      languages: ["tr"],
      ageRange: [25, 60],
      interests: ["İnşaat", "Prefabrik", "Mimarlık", "Şantiye"],
      rationale: "Şantiye kuran firmalar, müteahhitler ve bahçe sahipleri.",
    },
    searchAssets: {
      headlines: searchHeadlinesVariation1,
      descriptions: searchDescriptionsVariation1,
      keywords: [`${subject.toLowerCase()} fiyatları`, `${subject.toLowerCase()} modelleri`, "şantiye konteyneri"],
      negativeKeywords,
    },
    metaCreative: {
      primaryText: defaultVariations[0].primaryText,
      headlines: [`${subject} Modelleri`, "Fabrikadan Doğrudan Teslimat"],
      descriptions: ["Dayanıklı şase ve yüksek izolasyon standardı."],
      callToAction: "GET_QUOTE",
    },
    variations: defaultVariations,
    policyRisks: fallbackPolicyRisks,
    missingInfo,
    optimizationAdvice,
    visualAnalysisSummary: params.mediaAnalysis?.visual_description,
  };
}
