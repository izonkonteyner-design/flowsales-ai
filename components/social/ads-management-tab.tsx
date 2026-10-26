"use client";

import React, { useState, useEffect, useTransition } from "react";
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
} from "lucide-react";
import {
  checkAdsDiagnosticsAction,
  saveCampaignDraftAction,
  submitCampaignForApprovalAction,
} from "@/app/(app)/social/actions";
import type {
  AdPlatform,
  AdObjective,
  AdsDiagnosticResult,
  AdCampaignRecord,
} from "@/server/services/ads/domain";
import { StatusBadge } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";

type AdsManagementTabProps = {
  canMutate: boolean;
  initialCampaigns: AdCampaignRecord[];
};

export function AdsManagementTab({ canMutate, initialCampaigns }: AdsManagementTabProps) {
  const [platform, setPlatform] = useState<AdPlatform>("google_ads");
  const [campaigns, setCampaigns] = useState<AdCampaignRecord[]>(initialCampaigns);
  const [diagnostics, setDiagnostics] = useState<AdsDiagnosticResult | null>(null);
  const [isDiagPending, startDiagTransition] = useTransition();
  const [isSubmitPending, startSubmitTransition] = useTransition();

  // Campaign Form State
  const [campaignName, setCampaignName] = useState("");
  const [objective, setObjective] = useState<AdObjective>("lead_generation");
  const [dailyBudget, setDailyBudget] = useState(150);
  const currency = "TRY";
  const [adGroupName, setAdGroupName] = useState("");
  const [finalUrl, setFinalUrl] = useState("");
  const [headlinesText, setHeadlinesText] = useState("");
  const [descriptionsText, setDescriptionsText] = useState("");
  const [keywordsText, setKeywordsText] = useState("");
  const locations = "Türkiye, İstanbul, Ankara, İzmir";

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

  const handleSaveDraft = () => {
    if (!campaignName.trim()) {
      setStatusMessage({ type: "error", text: "Lütfen kampanya adı giriniz." });
      return;
    }

    const headlines = headlinesText
      .split("\n")
      .map((h) => h.trim())
      .filter(Boolean);
    const descriptions = descriptionsText
      .split("\n")
      .map((d) => d.trim())
      .filter(Boolean);
    const keywords = keywordsText
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
        adGroupName: adGroupName.trim() || undefined,
        finalUrl: finalUrl.trim() || undefined,
        headlines,
        descriptions,
        keywords,
        targeting: {
          locations: locations.split(",").map((l) => l.trim()),
          languages: ["tr"],
          ageRange: [24, 55],
          interests: [],
          placement: "all",
        },
      });

      if (res.success && res.campaign) {
        setCampaigns((prev) => [res.campaign!, ...prev]);
        setStatusMessage({
          type: "success",
          text: `"${res.campaign.campaignName}" taslak olarak güvenle kaydedildi.`,
        });
        // Clear fields
        setCampaignName("");
        setHeadlinesText("");
        setDescriptionsText("");
        setKeywordsText("");
      } else {
        setStatusMessage({
          type: "error",
          text: res.error || "Kampanya taslağı kaydedilemedi.",
        });
      }
    });
  };

  const handleSubmitForApproval = (campaignId: string) => {
    startSubmitTransition(async () => {
      setStatusMessage(null);
      const res = await submitCampaignForApprovalAction(campaignId);
      if (res.success) {
        setCampaigns((prev) =>
          prev.map((c) =>
            c.id === campaignId ? { ...c, status: "review_pending" } : c,
          ),
        );
        setStatusMessage({
          type: "success",
          text: "Kampanya onay kuyruğuna iletildi. Onay verilmeden harcama başlamayacaktır.",
        });
      } else {
        setStatusMessage({
          type: "error",
          text: res.error || "Onay talebi oluşturulamadı.",
        });
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Safety Invariant Notice */}
      <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-xs text-emerald-950 dark:text-emerald-200">
        <div className="flex items-center gap-2 font-semibold">
          <ShieldAlert className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <span>FlowSales AI Reklam Güvenlik ve Harcama Garantisi</span>
        </div>
        <p className="mt-1 leading-relaxed text-emerald-800 dark:text-emerald-300">
          Sistem hiçbir koşulda kullanıcı ve çalışma alanı yöneticisi onayı olmadan reklam harcaması (ad spend) yapmaz veya doğrudan canlıya almaz. Tüm kampanyalar taslak olarak hazırlanır ve kurumsal onay mekanizmasından geçer.
        </p>
      </div>

      {statusMessage ? (
        <div
          className={cn(
            "rounded-xl border p-3 text-xs flex items-center gap-2",
            statusMessage.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
              : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300",
          )}
        >
          {statusMessage.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      ) : null}

      {/* Platform Switcher & Diagnostics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Google Ads Card */}
        <div
          onClick={() => setPlatform("google_ads")}
          className={cn(
            "p-4 rounded-2xl border cursor-pointer transition text-left space-y-2",
            platform === "google_ads"
              ? "border-violet-500 bg-violet-50/50 dark:bg-violet-950/20 ring-1 ring-violet-500/30"
              : "border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 hover:border-slate-300",
          )}
        >
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              Google Ads
            </span>
            <span
              className={cn(
                "text-[10px] px-2 py-0.5 rounded-full font-medium",
                platform === "google_ads"
                  ? "bg-violet-600 text-white"
                  : "bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-400",
              )}
            >
              {platform === "google_ads" ? "Seçili Platform" : "Seç"}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Arama ağı (Search), anahtar kelime hedefli dönüşüm reklamları ve yerel işletme kampanyaları.
          </p>
        </div>

        {/* Meta Ads Card */}
        <div
          onClick={() => setPlatform("meta_ads")}
          className={cn(
            "p-4 rounded-2xl border cursor-pointer transition text-left space-y-2",
            platform === "meta_ads"
              ? "border-violet-500 bg-violet-50/50 dark:bg-violet-950/20 ring-1 ring-violet-500/30"
              : "border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 hover:border-slate-300",
          )}
        >
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <Target className="h-4 w-4 text-indigo-500" />
              Meta Ads (Instagram & Facebook)
            </span>
            <span
              className={cn(
                "text-[10px] px-2 py-0.5 rounded-full font-medium",
                platform === "meta_ads"
                  ? "bg-violet-600 text-white"
                  : "bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-400",
              )}
            >
              {platform === "meta_ads" ? "Seçili Platform" : "Seç"}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Instagram Feed, Reels, Facebook Akışı ve Messenger odaklı potansiyel müşteri (Lead) toplama reklamları.
          </p>
        </div>
      </div>

      {/* Diagnostics Panel */}
      <div className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50/80 dark:bg-white/[0.02] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2 font-medium text-slate-900 dark:text-white">
            <RefreshCw className={cn("h-3.5 w-3.5 text-violet-500", isDiagPending && "animate-spin")} />
            <span>Platform Teşhisi: {platform === "google_ads" ? "Google Ads" : "Meta Ads"}</span>
          </div>
          <p className="text-slate-500 dark:text-slate-400">
            {diagnostics?.statusText || "Platform durumu taranıyor..."}
          </p>
          {diagnostics?.missingRequirements && diagnostics.missingRequirements.length > 0 ? (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              Gereksinim: {diagnostics.missingRequirements.join(" • ")}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge tone={diagnostics?.isConnected ? "success" : "neutral"}>
            {diagnostics?.isConnected ? "Hesap Bağlı" : "Hesap Bağlantısı Bekleniyor"}
          </StatusBadge>
          <button
            type="button"
            onClick={() => fetchDiagnostics(platform)}
            className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 transition"
          >
            Yenile
          </button>
        </div>
      </div>

      {/* Campaign Creation Form */}
      <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="border-b border-slate-100 dark:border-white/5 pb-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Yeni Reklam Kampanyası Taslağı ({platform === "google_ads" ? "Google" : "Meta"})
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Kampanya hedeflerinizi belirleyin ve onay öncesi reklam setini hazırlayın.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Kampanya Adı *
            </label>
            <input
              type="text"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              disabled={!canMutate}
              placeholder="Örn: 2026 Prefabrik Ev Dönüşüm Kampanyası"
              className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Kampanya Hedefi
            </label>
            <select
              value={objective}
              onChange={(e) => setObjective(e.target.value as AdObjective)}
              disabled={!canMutate}
              className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
            >
              <option value="lead_generation">Potansiyel Müşteri (Lead Generation)</option>
              <option value="traffic">Web Sitesi Trafiği (Traffic)</option>
              <option value="conversions">Dönüşüm & Teklif Talebi (Conversions)</option>
              <option value="brand_awareness">Marka Bilinirliği (Brand Awareness)</option>
              <option value="sales">Doğrudan Satış (Sales)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Günlük Bütçe (TRY) *
            </label>
            <div className="relative">
              <DollarSign className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="number"
                min="50"
                step="25"
                value={dailyBudget}
                onChange={(e) => setDailyBudget(Number(e.target.value))}
                disabled={!canMutate}
                className="w-full pl-8 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Reklam Seti Adı
            </label>
            <input
              type="text"
              value={adGroupName}
              onChange={(e) => setAdGroupName(e.target.value)}
              disabled={!canMutate}
              placeholder="Örn: Konteyner Arayanlar - Hedefli"
              className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Hedef Sayfa (Landing URL)
            </label>
            <input
              type="url"
              value={finalUrl}
              onChange={(e) => setFinalUrl(e.target.value)}
              disabled={!canMutate}
              placeholder="https://flowsales-ai-six.vercel.app/..."
              className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
            />
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Reklam Başlıkları (Headlines - Her satıra bir adet)
            </label>
            <textarea
              rows={3}
              value={headlinesText}
              onChange={(e) => setHeadlinesText(e.target.value)}
              disabled={!canMutate}
              placeholder="İzon Konteyner — Fabrikadan Doğrudan Teslimat&#10;Yüksek İzolasyonlu Yaşam Konteynerleri&#10;Hemen İnceleyin ve Fiyat Teklifi Alın"
              className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Reklam Açıklamaları (Descriptions - Her satıra bir adet)
            </label>
            <textarea
              rows={2}
              value={descriptionsText}
              onChange={(e) => setDescriptionsText(e.target.value)}
              disabled={!canMutate}
              placeholder="Depreme dayanıklı, sandviç panel yalıtımlı modern konteyner modelleri uygun ödeme koşullarıyla.&#10;Hızlı montaj ve Türkiye geneli nakliye avantajı ile İZON kalitesi."
              className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
            />
          </div>

          {platform === "google_ads" ? (
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Anahtar Kelimeler (Keywords - Virgülle ayırın)
              </label>
              <input
                type="text"
                value={keywordsText}
                onChange={(e) => setKeywordsText(e.target.value)}
                disabled={!canMutate}
                placeholder="konteyner ev, yaşam konteyneri, prefabrik ofis, şantiye konteyneri"
                className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
              />
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-white/5">
          <button
            type="button"
            disabled={!canMutate || isSubmitPending}
            onClick={handleSaveDraft}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-white/10 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            <span>Taslağı Kaydet</span>
          </button>
        </div>
      </div>

      {/* Campaigns List */}
      <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
          Kayıtlı Reklam Kampanyaları ({campaigns.length})
        </h3>

        {campaigns.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10">
            Henüz kaydedilmiş reklam kampanyası bulunmamaktadır.
          </div>
        ) : (
          <div className="space-y-3">
            {campaigns.map((camp) => (
              <div
                key={camp.id}
                className="p-4 rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs text-slate-900 dark:text-white">
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
                      {camp.status === "draft"
                        ? "Taslak"
                        : camp.status === "review_pending"
                          ? "Onay Bekliyor"
                          : camp.status === "approved"
                            ? "Onaylandı"
                            : camp.status}
                    </StatusBadge>
                    <span className="text-[10px] text-slate-400 uppercase font-mono">
                      {camp.platform}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Bütçe: {camp.dailyBudgetCents / 100} {camp.currency} / gün • Hedef: {camp.objective}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {camp.status === "draft" ? (
                    <button
                      type="button"
                      disabled={!canMutate || isSubmitPending}
                      onClick={() => handleSubmitForApproval(camp.id)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                    >
                      <Send className="h-3 w-3" />
                      <span>Onaya Gönder</span>
                    </button>
                  ) : camp.status === "review_pending" ? (
                    <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                      Yönetici Onayında
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
