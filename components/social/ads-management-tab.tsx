"use client";

import React, { useState, useEffect, useTransition, useRef } from "react";
import {
  ShieldAlert,
  Send,
  Save,
  CheckCircle2,
  AlertCircle,
  DollarSign,
  TrendingUp,
  Target,
  RefreshCw,
  Sparkles,
  Upload,
  Globe,
  Share2,
  AlertTriangle,
  Eye,
  Check,
  Wand2,
  Clock,
} from "lucide-react";
import {
  checkAdsDiagnosticsAction,
  saveCampaignDraftAction,
  submitCampaignForApprovalAction,
  uploadMarketingMediaAction,
  runAiAdsManagerAction,
} from "@/app/(app)/social/actions";
import type {
  AdPlatform,
  CampaignObjective,
  AdsDiagnosticResult,
  AdCampaignRecord,
  AiAdsManagerResult,
  AdCopyVariation,
} from "@/server/services/ads/domain";
import type { MarketingMediaAsset } from "@/server/services/media/domain";
import { StatusBadge } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";

type AdsManagementTabProps = {
  canMutate: boolean;
  initialCampaigns: AdCampaignRecord[];
};

export function AdsManagementTab({ canMutate, initialCampaigns }: AdsManagementTabProps) {
  // Main Workspace Switcher (LOOP 4): Google Ads vs Meta Ads
  const [platform, setPlatform] = useState<AdPlatform>("google_ads");
  const [googleAdType, setGoogleAdType] = useState<"search" | "pmax" | "display">("search");
  const [metaAdFormat, setMetaAdFormat] = useState<"image" | "video" | "carousel">("image");

  const [campaigns, setCampaigns] = useState<AdCampaignRecord[]>(initialCampaigns);
  const [diagnostics, setDiagnostics] = useState<AdsDiagnosticResult | null>(null);
  const [, startDiagTransition] = useTransition();
  const [isSubmitPending, startSubmitTransition] = useTransition();

  // Campaign Form State
  const [campaignName, setCampaignName] = useState("");
  const [objective, setObjective] = useState<CampaignObjective>("lead_generation");
  const [dailyBudget, setDailyBudget] = useState(250);
  const currency = "TRY";
  const [adGroupName, setAdGroupName] = useState("Genel Arama Grubu");
  const [finalUrl, setFinalUrl] = useState("https://flowsales-ai-six.vercel.app/quotes");
  const [headlinesText, setHeadlinesText] = useState("");
  const [descriptionsText, setDescriptionsText] = useState("");
  const [keywordsText, setKeywordsText] = useState("");
  const [negativeKeywordsText, setNegativeKeywordsText] = useState("bedava, staj, iş ilanları, hurda, arsa");
  const [primaryText, setPrimaryText] = useState("");
  const [callToAction, setCallToAction] = useState("GET_QUOTE");
  const [locationsText, setLocationsText] = useState("Türkiye, İstanbul, Kocaeli, Bursa");
  const [placement, setPlacement] = useState<"all" | "feed_only" | "stories_reels" | "search_network">("all");

  // In-Form Media Upload (LOOP 4)
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);
  const [uploadedAsset, setUploadedAsset] = useState<MarketingMediaAsset | null>(null);
  const [isMediaUploading, setIsMediaUploading] = useState(false);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  // Dedicated AI Ads Manager State (LOOP 5)
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AiAdsManagerResult | null>(null);
  const [activeVariationId, setActiveVariationId] = useState<string | null>(null);

  // Feedback State
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  const fetchDiagnostics = (plat: AdPlatform) => {
    startDiagTransition(async () => {
      try {
        const result = await checkAdsDiagnosticsAction(plat);
        setDiagnostics(result);
      } catch {
        setDiagnostics(null);
      }
    });
  };

  useEffect(() => {
    fetchDiagnostics(platform);
  }, [platform]);

  // Handle switching platform
  const handlePlatformSwitch = (newPlat: AdPlatform) => {
    setPlatform(newPlat);
    setStatusMessage(null);
    setAiResult(null);
    if (newPlat === "google_ads") {
      setCampaignName("Google Search — Konteyner & Prefabrik");
      setPlacement("search_network");
      setAdGroupName("Arama Reklam Grubu");
    } else {
      setCampaignName("Meta Feed — Lüks & Şantiye Modelleri");
      setPlacement("feed_only");
      setAdGroupName("Meta Dönüşüm Grubu");
    }
  };

  // Direct In-Form Media Handling
  const handleMediaSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatusMessage(null);
    setMediaFile(file);
    setMediaPreviewUrl(URL.createObjectURL(file));

    setIsMediaUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const res = await uploadMarketingMediaAction(formData);
      if (res.success && res.asset) {
        setUploadedAsset(res.asset);
        setStatusMessage({
          type: "success",
          text: "Reklam medyası başarıyla yüklendi ve piksel analizi tamamlandı.",
        });
      } else {
        setStatusMessage({
          type: "error",
          text: res.error || "Reklam medyası yüklenemedi.",
        });
      }
    } catch {
      setStatusMessage({
        type: "error",
        text: "Medya yükleme servisinde bir hata oluştu.",
      });
    } finally {
      setIsMediaUploading(false);
    }
  };

  // Run AI Ads Manager (LOOP 5)
  const handleRunAiAdsManager = async () => {
    setIsAiLoading(true);
    setStatusMessage(null);

    try {
      const res = await runAiAdsManagerAction({
        platform,
        topic: campaignName || undefined,
        mediaAnalysis: uploadedAsset?.analysisResult,
        currentDailyBudget: dailyBudget,
        websiteUrl: finalUrl,
        targetLocations: locationsText.split(",").map((s) => s.trim()).filter(Boolean),
      });

      if (res.success && res.result) {
        const data = res.result;
        setAiResult(data);

        // Apply recommended fields
        if (data.campaignName) setCampaignName(data.campaignName);
        if (data.recommendedObjective) setObjective(data.recommendedObjective);
        if (data.recommendedDailyBudget) setDailyBudget(data.recommendedDailyBudget);

        if (platform === "google_ads" && data.searchAssets) {
          setHeadlinesText(data.searchAssets.headlines.join("\n"));
          setDescriptionsText(data.searchAssets.descriptions.join("\n"));
          setKeywordsText(data.searchAssets.keywords.join(", "));
          if (data.searchAssets.negativeKeywords?.length) {
            setNegativeKeywordsText(data.searchAssets.negativeKeywords.join(", "));
          }
        } else if (platform === "meta_ads" && data.metaCreative) {
          setPrimaryText(data.metaCreative.primaryText || "");
          setHeadlinesText(data.metaCreative.headlines.join("\n"));
          setDescriptionsText(data.metaCreative.descriptions.join("\n"));
          if (data.metaCreative.callToAction) setCallToAction(data.metaCreative.callToAction);
        }

        if (data.variations.length > 0) {
          setActiveVariationId(data.variations[0].id);
        }

        setStatusMessage({
          type: "success",
          text: "AI Ads Manager kampanya yapısını, anahtar kelimeleri ve metin varyasyonlarını başarıyla hazırladı!",
        });
      } else {
        setStatusMessage({
          type: "error",
          text: res.error || "AI Ads Manager analizi yapılamadı.",
        });
      }
    } catch {
      setStatusMessage({
        type: "error",
        text: "AI Ads Manager çağrılırken sunucu hatası oluştu.",
      });
    } finally {
      setIsAiLoading(false);
    }
  };

  // Apply Variation from AI Ads Manager
  const applyVariation = (variation: AdCopyVariation) => {
    setActiveVariationId(variation.id);
    if (variation.headlines?.length) setHeadlinesText(variation.headlines.join("\n"));
    if (variation.descriptions?.length) setDescriptionsText(variation.descriptions.join("\n"));
    if (variation.primaryText) setPrimaryText(variation.primaryText);
    if (variation.callToAction) setCallToAction(variation.callToAction);

    setStatusMessage({
      type: "info",
      text: `'${variation.angle}' varyasyonu kampanya formuna uygulandı.`,
    });
  };

  // Save Campaign Draft
  const handleSaveDraft = () => {
    if (!campaignName.trim()) {
      setStatusMessage({ type: "error", text: "Lütfen kampanya adı giriniz." });
      return;
    }

    const headlines = headlinesText
      .split("\n")
      .map((h) => h.trim().slice(0, 30))
      .filter(Boolean);
    const descriptions = descriptionsText
      .split("\n")
      .map((d) => d.trim().slice(0, 90))
      .filter(Boolean);
    const keywords = keywordsText
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    const negativeKeywords = negativeKeywordsText
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);

    startSubmitTransition(async () => {
      setStatusMessage(null);
      const res = await saveCampaignDraftAction({
        platform,
        campaignName,
        objective,
        dailyBudget,
        currency,
        adGroupName,
        headlines,
        descriptions,
        keywords,
        negativeKeywords,
        primaryText,
        callToAction,
        finalUrl,
        mediaUrl: uploadedAsset?.publicUrl || mediaPreviewUrl || "",
        targeting: {
          locations: locationsText.split(",").map((l) => l.trim()).filter(Boolean),
          languages: ["tr"],
          ageRange: [25, 60],
          interests: aiResult?.targetAudience?.interests || ["İnşaat", "Prefabrik"],
          placement,
        },
      });

      if (res.success && res.campaign) {
        setCampaigns((prev) => [res.campaign!, ...prev]);
        setStatusMessage({
          type: "success",
          text: `Kampanya taslağı başarıyla kaydedildi: ${res.campaign.campaignName}`,
        });
      } else {
        setStatusMessage({
          type: "error",
          text: res.error || "Taslak kaydedilirken hata oluştu.",
        });
      }
    });
  };

  // Submit for Approval (Human-in-the-loop Guardrail)
  const handleSubmitApproval = (campaignId: string) => {
    startSubmitTransition(async () => {
      setStatusMessage(null);
      const res = await submitCampaignForApprovalAction(campaignId);
      if (res.success) {
        setCampaigns((prev) =>
          prev.map((c) => (c.id === campaignId ? { ...c, status: "review_pending" } : c)),
        );
        setStatusMessage({
          type: "success",
          text: "Kampanya yönetici onay kuyruğuna gönderildi. Harcama başlamadan önce yetkili onayı beklenmektedir.",
        });
      } else {
        setStatusMessage({
          type: "error",
          text: res.error || "Onay talebi oluşturulamadı.",
        });
      }
    });
  };

  const parsedHeadlines = headlinesText.split("\n").map((h) => h.trim()).filter(Boolean);
  const parsedDescriptions = descriptionsText.split("\n").map((d) => d.trim()).filter(Boolean);

  return (
    <div className="space-y-6">
      {/* Workspace Header & Platform Selector (LOOP 4) */}
      <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              <span>Reklam Yönetim Stüdyosu (Ads Studio)</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Google Ads ve Meta Ads için ayrı çalışma alanları, dahili medya yükleme ve AI Ads Manager.
            </p>
          </div>

          {/* Platform Workspaces Switcher */}
          <div className="inline-flex rounded-xl bg-slate-100 dark:bg-white/5 p-1 text-xs font-medium">
            <button
              type="button"
              onClick={() => handlePlatformSwitch("google_ads")}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg transition cursor-pointer font-semibold",
                platform === "google_ads"
                  ? "bg-white dark:bg-violet-600 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900",
              )}
            >
              <Globe className="h-4 w-4 text-blue-500" />
              <span>Google Ads</span>
            </button>

            <button
              type="button"
              onClick={() => handlePlatformSwitch("meta_ads")}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg transition cursor-pointer font-semibold",
                platform === "meta_ads"
                  ? "bg-white dark:bg-violet-600 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900",
              )}
            >
              <Share2 className="h-4 w-4 text-violet-500" />
              <span>Meta Ads (Facebook & IG)</span>
            </button>
          </div>
        </div>

        {/* Diagnostic Status Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] p-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              {platform === "google_ads" ? "Google Ads Bağlantısı:" : "Meta Ads Bağlantısı:"}
            </span>
            <StatusBadge tone={diagnostics?.isConnected ? "success" : "neutral"}>
              {diagnostics?.isConnected ? "OAuth Aktif" : "Önizleme & Taslak Modu"}
            </StatusBadge>
            <span className="text-slate-500 text-[11px]">{diagnostics?.statusText}</span>
          </div>

          <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
            <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
            <span>Güvenlik: Canlı harcama için onay talebi zorunludur.</span>
          </div>
        </div>
      </div>

      {/* Status Messages */}
      {statusMessage ? (
        <div
          className={cn(
            "flex items-center gap-2.5 rounded-xl border p-3.5 text-xs",
            statusMessage.type === "success" && "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
            statusMessage.type === "error" && "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-400",
            statusMessage.type === "info" && "border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-400",
          )}
        >
          {statusMessage.type === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          <span>{statusMessage.text}</span>
        </div>
      ) : null}

      {/* Main Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Form & In-Form Media Upload (7 cols) */}
        <div className="lg:col-span-7 space-y-5 rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white dark:bg-slate-900 p-5 shadow-sm">
          {/* Sub-Format Selector */}
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-3">
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              {platform === "google_ads" ? "Google Kampanya Türü" : "Meta Reklam Formatı"}
            </span>

            {platform === "google_ads" ? (
              <div className="flex gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => setGoogleAdType("search")}
                  className={cn(
                    "px-2.5 py-1 rounded-lg transition font-medium cursor-pointer",
                    googleAdType === "search" ? "bg-violet-600 text-white" : "bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400",
                  )}
                >
                  Arama (Search - Metin)
                </button>
                <button
                  type="button"
                  onClick={() => setGoogleAdType("pmax")}
                  className={cn(
                    "px-2.5 py-1 rounded-lg transition font-medium cursor-pointer",
                    googleAdType === "pmax" ? "bg-violet-600 text-white" : "bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400",
                  )}
                >
                  Performance Max
                </button>
                <button
                  type="button"
                  onClick={() => setGoogleAdType("display")}
                  className={cn(
                    "px-2.5 py-1 rounded-lg transition font-medium cursor-pointer",
                    googleAdType === "display" ? "bg-violet-600 text-white" : "bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400",
                  )}
                >
                  Görüntülü (Display)
                </button>
              </div>
            ) : (
              <div className="flex gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => setMetaAdFormat("image")}
                  className={cn(
                    "px-2.5 py-1 rounded-lg transition font-medium cursor-pointer",
                    metaAdFormat === "image" ? "bg-violet-600 text-white" : "bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400",
                  )}
                >
                  Tek Görsel
                </button>
                <button
                  type="button"
                  onClick={() => setMetaAdFormat("video")}
                  className={cn(
                    "px-2.5 py-1 rounded-lg transition font-medium cursor-pointer",
                    metaAdFormat === "video" ? "bg-violet-600 text-white" : "bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400",
                  )}
                >
                  Video Reklam
                </button>
                <button
                  type="button"
                  onClick={() => setMetaAdFormat("carousel")}
                  className={cn(
                    "px-2.5 py-1 rounded-lg transition font-medium cursor-pointer",
                    metaAdFormat === "carousel" ? "bg-violet-600 text-white" : "bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400",
                  )}
                >
                  Carousel
                </button>
              </div>
            )}
          </div>

          {/* In-Form Media Upload (No jumping tabs!) (LOOP 4) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {platform === "google_ads"
                  ? "Kampanya Medyası (Görüntülü / PMax için Görsel veya Logo)"
                  : "Meta Reklam Görseli / Videosu"}
              </label>
              {platform === "google_ads" && googleAdType === "search" ? (
                <span className="text-[11px] text-slate-400">Arama reklamlarında isteğe bağlı</span>
              ) : (
                <span className="text-[11px] text-emerald-500 font-medium">Zorunlu Kreatif</span>
              )}
            </div>

            <div
              onClick={() => mediaInputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-xl p-3 text-center cursor-pointer transition relative group",
                mediaPreviewUrl
                  ? "border-emerald-500/40 bg-emerald-50/20 dark:bg-emerald-500/5"
                  : "border-slate-300 dark:border-white/10 hover:border-violet-500/50 bg-slate-50 dark:bg-white/[0.02]",
              )}
            >
              <input
                ref={mediaInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,video/mp4"
                onChange={handleMediaSelect}
                className="hidden"
              />

              {mediaPreviewUrl ? (
                <div className="flex items-center gap-3 text-left">
                  <div className="w-16 h-16 rounded-lg overflow-hidden border border-slate-200 dark:border-white/10 shrink-0">
                    {mediaFile?.type.startsWith("video") ? (
                      <video src={mediaPreviewUrl} className="w-full h-full object-cover" />
                    ) : (
                      <img src={mediaPreviewUrl} alt="Preview" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                      {mediaFile?.name}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Değiştirmek için tıklayın. {uploadedAsset ? "• Piksel analizi hazır" : ""}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="py-2.5">
                  <Upload className="h-5 w-5 text-slate-400 mx-auto mb-1 group-hover:text-violet-500 transition" />
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Reklam görseli veya videosu yüklemek için tıklayın
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Sosyal medya sekmesine gitmenize gerek yoktur; doğrudan buraya yükleyebilirsiniz.
                  </p>
                </div>
              )}
            </div>

            {isMediaUploading ? (
              <div className="flex items-center gap-2 text-xs text-violet-600 dark:text-violet-400">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>Medya yükleniyor ve yapay zeka analizine hazırlanıyor...</span>
              </div>
            ) : null}
          </div>

          {/* Campaign Details Form */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Kampanya Adı</label>
              <input
                type="text"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="Örn: Google Ads - Konteyner Satış"
                className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Hedef (Objective)</label>
              <select
                value={objective}
                onChange={(e) => setObjective(e.target.value as CampaignObjective)}
                className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
              >
                <option value="lead_generation">Potansiyel Müşteri (Lead Generation)</option>
                <option value="traffic">Web Sitesi Trafiği (Traffic)</option>
                <option value="conversions">Dönüşümler (Conversions)</option>
                <option value="sales">Satış & Teklif (Sales)</option>
                <option value="brand_awareness">Marka Bilinirliği (Awareness)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center justify-between">
                <span>Günlük Bütçe (TRY)</span>
                <span className="text-[11px] text-slate-400">Önerilen: 250 - 500 TL</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  min={50}
                  step={50}
                  value={dailyBudget}
                  onChange={(e) => setDailyBudget(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 pl-8 pr-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
                <DollarSign className="h-4 w-4 text-slate-400 absolute left-2.5 top-2.5" />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Açılış Sayfası (Landing Page URL)</label>
              <input
                type="url"
                value={finalUrl}
                onChange={(e) => setFinalUrl(e.target.value)}
                placeholder="https://flowsales-ai-six.vercel.app/quotes"
                className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Hedef Konumlar (Virgülle ayırın)</label>
              <input
                type="text"
                value={locationsText}
                onChange={(e) => setLocationsText(e.target.value)}
                placeholder="Türkiye, İstanbul, Kocaeli, Bursa, Ankara"
                className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>
          </div>

          {/* Meta Ads Primary Text or Google Search Headlines */}
          {platform === "meta_ads" ? (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Ana Reklam Metni (Primary Text)
              </label>
              <textarea
                rows={4}
                value={primaryText}
                onChange={(e) => setPrimaryText(e.target.value)}
                placeholder="Meta akışında görünecek ana reklam metni..."
                className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 p-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-violet-500 leading-relaxed"
              />
            </div>
          ) : null}

          {/* Headlines (Max 30 chars for Google Ads) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {platform === "google_ads" ? "Başlıklar (Her satıra bir adet — MAKS 30 KARAKTER!)" : "Kreatif Başlıkları"}
              </label>
              <span className="text-[11px] text-slate-400">{parsedHeadlines.length} başlık</span>
            </div>
            <textarea
              rows={4}
              value={headlinesText}
              onChange={(e) => setHeadlinesText(e.target.value)}
              placeholder="İzon Konteyner Modelleri&#10;Fabrikadan Hızlı Sevkiyat&#10;Hemen Fiyat Teklifi Alın"
              className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 p-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-violet-500 leading-relaxed"
            />
            {platform === "google_ads" && parsedHeadlines.some((h) => h.length > 30) ? (
              <p className="text-[11px] text-red-500 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                <span>Dikkat: Bazı başlıklar 30 karakter sınırını aşıyor; kaydedilirken otomatik kırpılacaktır.</span>
              </p>
            ) : null}
          </div>

          {/* Descriptions (Max 90 chars for Google Ads) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {platform === "google_ads" ? "Açıklamalar (Her satıra bir adet — MAKS 90 KARAKTER!)" : "Açıklamalar / Alt Metin"}
              </label>
              <span className="text-[11px] text-slate-400">{parsedDescriptions.length} açıklama</span>
            </div>
            <textarea
              rows={3}
              value={descriptionsText}
              onChange={(e) => setDescriptionsText(e.target.value)}
              placeholder="Depreme dayanıklı ve yüksek yalıtımlı modüler yaşam konteynerleri İzon'da.&#10;Fabrikadan doğrudan satış ve Türkiye geneli hızlı sevkiyat imkânı ile hemen tanışın."
              className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 p-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-violet-500 leading-relaxed"
            />
          </div>

          {/* Google Ads Keywords & Negatives */}
          {platform === "google_ads" ? (
            <div className="space-y-3 pt-1">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Arama Anahtar Kelimeleri (Virgülle ayırın)
                </label>
                <input
                  type="text"
                  value={keywordsText}
                  onChange={(e) => setKeywordsText(e.target.value)}
                  placeholder="konteyner ev, şantiye konteyneri, ofis konteyneri fiyatları"
                  className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>Negatif Anahtar Kelimeler (Bütçe Koruma)</span>
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">Bütçe Tasarrufu Sağlar</span>
                </label>
                <input
                  type="text"
                  value={negativeKeywordsText}
                  onChange={(e) => setNegativeKeywordsText(e.target.value)}
                  placeholder="bedava, ücretsiz, staj, iş ilanları, hurda"
                  className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>
            </div>
          ) : null}

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-white/5">
            <button
              type="button"
              disabled={isSubmitPending || !canMutate}
              onClick={handleSaveDraft}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 transition cursor-pointer"
            >
              <Save className="h-3.5 w-3.5 text-slate-400" />
              <span>Taslak Olarak Kaydet</span>
            </button>
          </div>
        </div>

        {/* Right Column: Dedicated AI Ads Manager & Live Ad Preview (5 cols) (LOOP 5) */}
        <div className="lg:col-span-5 space-y-5">
          {/* AI Ads Manager Box */}
          <div className="rounded-2xl border border-blue-500/20 bg-gradient-to-b from-blue-500/5 via-violet-500/5 to-transparent p-4 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-blue-500" />
                <span className="text-xs font-semibold text-slate-900 dark:text-white">
                  Yapay Zeka Reklam Yöneticisi (AI Ads Manager)
                </span>
              </div>
              <StatusBadge tone="info">Ayrı Reklam Motoru</StatusBadge>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              Sosyal medya içerik AI&apos;sından bağımsız çalışır. Yüklenen medyayı ve hedef pazarınızı inceleyerek 30/90 karakter uyumlu metinler, negatif anahtar kelimeler ve politika denetimi üretir.
            </p>

            <button
              type="button"
              disabled={isAiLoading}
              onClick={handleRunAiAdsManager}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition cursor-pointer shadow-sm disabled:opacity-50"
            >
              {isAiLoading ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>AI Reklamları Yapılandırıyor...</span>
                </>
              ) : (
                <>
                  <Wand2 className="h-3.5 w-3.5" />
                  <span>✨ AI Ads Manager ile Kampanyayı Hazırla</span>
                </>
              )}
            </button>

            {/* Variations Pill Bar */}
            {aiResult?.variations && aiResult.variations.length > 0 ? (
              <div className="space-y-2 pt-1 border-t border-slate-200/80 dark:border-white/10">
                <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  Kreatif Metin Varyasyonları (Tıklayarak Uygulayın):
                </span>
                <div className="flex flex-col gap-1.5">
                  {aiResult.variations.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => applyVariation(v)}
                      className={cn(
                        "w-full text-left p-2 rounded-lg border text-[11px] transition cursor-pointer flex items-center justify-between",
                        activeVariationId === v.id
                          ? "border-blue-500 bg-blue-50/50 dark:bg-blue-500/10 text-blue-900 dark:text-blue-300 font-semibold"
                          : "border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300",
                      )}
                    >
                      <span>{v.angle}</span>
                      {activeVariationId === v.id ? <Check className="h-3 w-3 text-blue-500" /> : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Policy Risks Alert */}
            {aiResult?.policyRisks && aiResult.policyRisks.length > 0 ? (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 space-y-1.5 text-xs text-amber-800 dark:text-amber-200">
                <div className="flex items-center gap-1.5 font-semibold text-[11px]">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  <span>Reklam Politikası Uyarıları ({aiResult.policyRisks.length}):</span>
                </div>
                {aiResult.policyRisks.map((risk, i) => (
                  <p key={i} className="text-[11px] leading-relaxed">
                    • {risk.reason} <span className="underline">{risk.suggestedFix}</span>
                  </p>
                ))}
              </div>
            ) : null}

            {/* Optimization Advice */}
            {aiResult?.optimizationAdvice && aiResult.optimizationAdvice.length > 0 ? (
              <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800/60 p-3 space-y-1 text-[11px] text-slate-600 dark:text-slate-400">
                <span className="font-semibold text-slate-800 dark:text-slate-200">AI Optimizasyon Tavsiyesi:</span>
                <p className="leading-relaxed">{aiResult.optimizationAdvice[0]}</p>
              </div>
            ) : null}
          </div>

          {/* Live Ad Mockup Preview Card */}
          <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-800/40 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Eye className="h-3.5 w-3.5 text-slate-400" />
                <span>Önizleme: {platform === "google_ads" ? "Google Arama Sonucu" : "Meta Akış Reklamı"}</span>
              </span>
              <StatusBadge tone="neutral">Mockup</StatusBadge>
            </div>

            {platform === "google_ads" ? (
              /* Google Search SERP Mockup */
              <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-4 space-y-1 shadow-sm font-sans">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400">
                  <span className="font-bold text-slate-900 dark:text-white">Sponsorlu</span>
                  <span>•</span>
                  <span className="truncate">{finalUrl}</span>
                </div>
                <h3 className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer line-clamp-1">
                  {parsedHeadlines.slice(0, 3).join(" | ") || "İzon Konteyner Modelleri | Fabrikadan Doğrudan Teslim"}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-2">
                  {parsedDescriptions[0] || "Depreme dayanıklı lüks konteyner ve prefabrik ofis çözümleri İzon Konteyner güvencesiyle üretilmektedir."}
                </p>
              </div>
            ) : (
              /* Meta Feed Mockup */
              <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
                <div className="p-3 border-b border-slate-100 dark:border-white/5 flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-violet-600 text-white flex items-center justify-center text-xs font-bold">
                    İZ
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                      İZON KONTEYNER
                    </p>
                    <p className="text-[10px] text-slate-500">Sponsorlu</p>
                  </div>
                </div>

                {primaryText ? (
                  <p className="p-3 text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap line-clamp-3">
                    {primaryText}
                  </p>
                ) : null}

                {mediaPreviewUrl ? (
                  <div className="relative aspect-video bg-black flex items-center justify-center">
                    {mediaFile?.type.startsWith("video") ? (
                      <video src={mediaPreviewUrl} className="w-full h-full object-contain" />
                    ) : (
                      <img src={mediaPreviewUrl} alt="Ad Visual" className="w-full h-full object-contain" />
                    )}
                  </div>
                ) : (
                  <div className="aspect-video bg-slate-100 dark:bg-white/5 flex flex-col items-center justify-center text-slate-400 text-xs">
                    <span>Görsel veya video seçildiğinde burada görünecektir</span>
                  </div>
                )}

                <div className="p-3 bg-slate-50 dark:bg-white/[0.02] flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">flowsales-ai-six.vercel.app</p>
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {parsedHeadlines[0] || "Fabrikadan Doğrudan Modüler Konteyner"}
                    </p>
                  </div>
                  <span className="shrink-0 px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-white/10 text-slate-800 dark:text-white text-xs font-semibold">
                    {callToAction === "GET_QUOTE" ? "Teklif Al" : callToAction === "LEARN_MORE" ? "Daha Fazla Bilgi" : "İletişime Geç"}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Campaign List and Human-Approval Controls */}
      <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Target className="h-4 w-4 text-violet-500" />
            <span>Kayıtlı Reklam Kampanyaları ve Onay Durumu</span>
          </h3>
          <span className="text-xs text-slate-500">{campaigns.length} kampanya</span>
        </div>

        {campaigns.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">
            Henüz kaydedilmiş reklam kampanyası bulunmamaktadır. Yukarıdaki formu ve AI Ads Manager&apos;ı kullanarak ilk kampanyanızı oluşturabilirsiniz.
          </div>
        ) : (
          <div className="space-y-3">
            {campaigns.map((camp) => (
              <div
                key={camp.id}
                className="p-4 rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      {camp.campaignName}
                    </span>
                    <StatusBadge
                      tone={
                        camp.status === "live"
                          ? "success"
                          : camp.status === "review_pending"
                          ? "warning"
                          : camp.status === "approved"
                          ? "info"
                          : "neutral"
                      }
                    >
                      {camp.status === "review_pending"
                        ? "Yönetici Onayı Bekliyor"
                        : camp.status === "approved"
                        ? "Onaylandı (Yayına Hazır)"
                        : camp.status === "live"
                        ? "Canlı"
                        : "Taslak"}
                    </StatusBadge>
                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-200 dark:bg-white/10 font-medium">
                      {camp.platform === "google_ads" ? "Google Ads" : "Meta Ads"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Günlük Bütçe: {camp.dailyBudgetCents ? Math.round(camp.dailyBudgetCents / 100) : 0} {camp.currency} • Hedef: {camp.objective}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {camp.status === "draft" && canMutate ? (
                    <button
                      type="button"
                      disabled={isSubmitPending}
                      onClick={() => handleSubmitApproval(camp.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold transition cursor-pointer shadow-sm disabled:opacity-50"
                    >
                      <Send className="h-3 w-3" />
                      <span>Onaya Gönder</span>
                    </button>
                  ) : null}

                  {camp.status === "review_pending" ? (
                    <span className="text-xs text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      <span>İncelemede</span>
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
