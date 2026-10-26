"use client";

import React, { useState, useTransition, useEffect } from "react";
import {
  BarChart3,
  TrendingUp,
  Clock,
  Sparkles,
  Share2,
  DollarSign,
  AlertCircle,
  Lightbulb,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getMarketingOptimizationAdviceAction } from "@/app/(app)/social/actions";
import type {
  SocialPerformanceMetrics,
  AdsPerformanceMetrics,
  MarketingOptimizationAdvice,
} from "@/server/services/analytics/service";

export function MarketingAnalyticsTab() {
  const [isPending, startTransition] = useTransition();
  const [metrics, setMetrics] = useState<{
    social: SocialPerformanceMetrics;
    ads: AdsPerformanceMetrics;
  } | null>(null);
  const [advice, setAdvice] = useState<MarketingOptimizationAdvice | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadData = () => {
    startTransition(async () => {
      setErrorMsg(null);
      const res = await getMarketingOptimizationAdviceAction();
      if (!res.success) {
        setErrorMsg(res.error || "Metrikler yüklenemedi.");
        return;
      }
      if (res.metrics) setMetrics(res.metrics);
      if (res.advice) setAdvice(res.advice);
    });
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-white/10 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-violet-500" />
            Pazarlama Analitiği & Yapay Zeka Optimizasyon Merkezi
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Sosyal medya ve reklam kanallarının gerçek verileri üzerinden büyüme, zamanlama ve kitle analizi.
          </p>
        </div>

        <button
          type="button"
          onClick={loadData}
          disabled={isPending}
          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 flex items-center gap-1.5 transition cursor-pointer self-start md:self-auto"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isPending && "animate-spin")} />
          <span>Analizi Yenile</span>
        </button>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Metrics Summary Grid */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/40 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1">
              <span>Toplam Gönderi</span>
              <Share2 className="h-4 w-4 text-violet-500" />
            </div>
            <div className="text-xl font-bold text-slate-900 dark:text-white">{metrics.social.totalPosts}</div>
            <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 font-medium">
              {metrics.social.publishedCount} Yayınlandı &bull; {metrics.social.scheduledCount} Planlandı
            </div>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/40 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1">
              <span>Reklam Kampanyaları</span>
              <TrendingUp className="h-4 w-4 text-indigo-500" />
            </div>
            <div className="text-xl font-bold text-slate-900 dark:text-white">{metrics.ads.totalCampaigns}</div>
            <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 font-medium">
              {metrics.ads.liveCount} Canlı &bull; {metrics.ads.pausedCount} Duraklatılmış &bull; {metrics.ads.draftCount} Taslak
            </div>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/40 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1">
              <span>Planlanan Günlük Bütçe</span>
              <DollarSign className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="text-xl font-bold text-slate-900 dark:text-white">
              ₺{metrics.ads.totalDailyBudgetTry.toLocaleString("tr-TR")}
            </div>
            <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 font-medium">
              Onaylı & Güvenli Limit
            </div>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/40 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1">
              <span>Harcama Güvenliği</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-1">
              %100 Yönetici Korumalı
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Otonom harcama kesinlikle engellidir
            </div>
          </div>
        </div>
      )}

      {/* AI Performance Advice & Growth Recommendations */}
      {advice && (
        <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/40 p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-violet-500" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Yapay Zeka Stratejik Optimizasyon Raporu
              </h3>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Gerçek veriler temel alınarak oluşturuldu
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Optimal Posting Times */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.01] space-y-3">
              <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Clock className="h-4 w-4 text-violet-500" />
                Önerilen En Verimli Paylaşım Zamanları
              </h4>
              <div className="space-y-2">
                {advice.optimalPostingTimes.map((item, idx) => (
                  <div key={idx} className="p-2.5 rounded-lg bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/10 text-xs">
                    <div className="flex items-center justify-between font-bold text-slate-800 dark:text-slate-200">
                      <span className="uppercase text-[11px] text-violet-600 dark:text-violet-400">{item.platform}</span>
                      <span>{item.dayOfWeek} &bull; {item.recommendedTimeWindow}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{item.rationale}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* High Converting Headlines & CTAs */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.01] space-y-3">
              <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-amber-500" />
                Önerilen Yüksek Dönüşümlü Başlıklar & CTA&apos;lar
              </h4>
              <div className="space-y-2">
                <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/10 text-xs">
                  <span className="font-semibold text-slate-500 dark:text-slate-400 block mb-1">Önerilen Başlıklar:</span>
                  <ul className="list-disc list-inside space-y-1 text-slate-800 dark:text-slate-200">
                    {advice.headlineSuggestions.map((h, i) => (
                      <li key={i}>{h}</li>
                    ))}
                  </ul>
                </div>
                <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/10 text-xs">
                  <span className="font-semibold text-slate-500 dark:text-slate-400 block mb-1">Yeni Eyleme Çağrılar (CTA):</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {advice.freshCallToActions.map((cta, i) => (
                      <span key={i} className="px-2 py-0.5 rounded bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800 text-[11px] font-medium">
                        {cta}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Audience Targeting Tips */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.01] space-y-3">
              <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                Hedef Kitle İyileştirme İpuçları
              </h4>
              <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                {advice.audienceTargetingTips.map((tip, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-emerald-500 font-bold">&bull;</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Budget Shift Recommendations */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.01] space-y-3">
              <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-indigo-500" />
                Bütçe Dağılım Önerileri (Kullanıcı Onayına Tabidir)
              </h4>
              <div className="space-y-2">
                {advice.budgetShiftRecommendations.map((b, idx) => (
                  <div key={idx} className="p-2.5 rounded-lg bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/10 text-xs">
                    <div className="flex items-center justify-between font-bold text-slate-800 dark:text-slate-200">
                      <span>{b.fromPlatform} &rarr; {b.toPlatform}</span>
                      <span className="text-emerald-600 dark:text-emerald-400">%{b.suggestedShiftPercent} Kaydırma Önerisi</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{b.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 text-xs text-slate-600 dark:text-slate-400">
            <span className="font-semibold text-slate-800 dark:text-slate-200">Not: </span>
            {advice.summaryNote}
          </div>
        </div>
      )}
    </div>
  );
}
