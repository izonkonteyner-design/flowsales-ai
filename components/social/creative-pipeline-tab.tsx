"use client";

import React, { useState, useTransition } from "react";
import {
  Sparkles,
  Clapperboard,
  Layers,
  Image as ImageIcon,
  CheckCircle2,
  Copy,
  Save,
  Volume2,
  Tv,
  Film,
} from "lucide-react";
import {
  generateCreativeBriefAction,
  saveCreativeBriefAction,
} from "@/app/(app)/social/actions";
import type {
  CreativeFormat,
  ShotListItem,
} from "@/server/services/creative/pipeline";
import { cn } from "@/lib/utils";

type CreativePipelineTabProps = {
  canMutate: boolean;
  initialBriefs?: Array<{
    id: string;
    title: string;
    format: string;
    dimensions: string;
    visual_prompt: string;
    created_at: string;
  }>;
};

export function CreativePipelineTab({
  canMutate,
  initialBriefs = [],
}: CreativePipelineTabProps) {
  const [format, setFormat] = useState<CreativeFormat>("feed_image");
  const [topic, setTopic] = useState("");
  const [productOrService, setProductOrService] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [language, setLanguage] = useState<"tr" | "en">("tr");

  // Output State
  const [currentBrief, setCurrentBrief] = useState<{
    title: string;
    concept: string;
    format: CreativeFormat;
    dimensions: string;
    visualPrompt: string;
    shotList: ShotListItem[];
    voiceoverScript: string | null;
    overlayTexts: string[];
    thumbnailConcept: string | null;
  } | null>(null);

  const [briefsList, setBriefsList] = useState(initialBriefs);
  const [isGenerating, startGenerateTransition] = useTransition();
  const [isSaving, startSaveTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleGenerate = () => {
    if (!topic.trim()) {
      setStatusMessage("Lütfen içerik konusunu veya ana fikri belirtin.");
      return;
    }
    setStatusMessage(null);

    startGenerateTransition(async () => {
      try {
        const brief = await generateCreativeBriefAction({
          topic,
          productOrService: productOrService.trim() || undefined,
          targetAudience: targetAudience.trim() || undefined,
          format,
          language,
        });
        setCurrentBrief(brief);
      } catch {
        setStatusMessage("Brief üretilirken bir hata oluştu.");
      }
    });
  };

  const handleSave = () => {
    if (!currentBrief) return;
    setStatusMessage(null);

    startSaveTransition(async () => {
      const res = await saveCreativeBriefAction(currentBrief);
      if (res.success && res.id) {
        setBriefsList((prev) => [
          {
            id: res.id!,
            title: currentBrief.title,
            format: currentBrief.format,
            dimensions: currentBrief.dimensions,
            visual_prompt: currentBrief.visualPrompt,
            created_at: new Date().toISOString(),
          },
          ...prev,
        ]);
        setStatusMessage("Kreatif prodüksiyon briefi başarıyla kaydedildi.");
      } else {
        setStatusMessage(res.error || "Brief kaydedilemedi.");
      }
    });
  };

  const copyPrompt = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Format Selection Bar */}
      <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Kreatif Formatı ve En-Boy Oranı Seçimi
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Hedef mecra için standart dijital pazarlama boyutunu belirleyin.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {[
            {
              id: "feed_image" as CreativeFormat,
              label: "Kare Görsel",
              ratio: "1:1 (1080x1080)",
              icon: ImageIcon,
            },
            {
              id: "story_reel" as CreativeFormat,
              label: "Dikey Video / Reel",
              ratio: "9:16 (1080x1920)",
              icon: Film,
            },
            {
              id: "carousel" as CreativeFormat,
              label: "Kaydırmalı Seri",
              ratio: "1:1 Çoklu",
              icon: Layers,
            },
            {
              id: "video_storyboard" as CreativeFormat,
              label: "Video Storyboard",
              ratio: "9:16 Çekim Listesi",
              icon: Clapperboard,
            },
            {
              id: "landscape_ad" as CreativeFormat,
              label: "Yatay Reklam",
              ratio: "1.91:1 (1200x628)",
              icon: Tv,
            },
          ].map((fmt) => {
            const Icon = fmt.icon;
            const isSelected = format === fmt.id;
            return (
              <button
                key={fmt.id}
                type="button"
                onClick={() => setFormat(fmt.id)}
                className={cn(
                  "p-3 rounded-xl border text-xs font-medium transition text-left cursor-pointer space-y-1",
                  isSelected
                    ? "border-violet-500 bg-violet-50/50 dark:bg-violet-950/20 text-slate-900 dark:text-white ring-1 ring-violet-500/30"
                    : "border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10",
                )}
              >
                <Icon className={cn("h-4 w-4", isSelected ? "text-violet-600" : "text-slate-400")} />
                <p className="font-semibold truncate">{fmt.label}</p>
                <p className="text-[10px] text-slate-400">{fmt.ratio}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Generator Inputs */}
      <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              İçerik Konusu / Kampanya Fikri *
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Örn: 2026 Konteyner ve Prefabrik Yaşam Alanı Tanıtımı"
              className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Ürün veya Hizmet Adı
            </label>
            <input
              type="text"
              value={productOrService}
              onChange={(e) => setProductOrService(e.target.value)}
              placeholder="Örn: İzon Konteyner — 3x7 Lüks Yaşam Ünitesi"
              className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Hedef Kitle (Opsiyonel)
            </label>
            <input
              type="text"
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
              placeholder="Örn: Bahçe/arsa sahipleri, inşaat firmaları, şantiye şefleri"
              className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Çıktı Dili
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as "tr" | "en")}
              className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
            >
              <option value="tr">Türkçe (TR)</option>
              <option value="en">English (EN)</option>
            </select>
          </div>
        </div>

        {statusMessage ? (
          <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
            {statusMessage}
          </p>
        ) : null}

        <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-white/5">
          <button
            type="button"
            disabled={!canMutate || isGenerating || !topic.trim()}
            onClick={handleGenerate}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            <span>{isGenerating ? "Brief Oluşturuluyor..." : "Kreatif Üretim Briefi Oluştur"}</span>
          </button>
        </div>
      </div>

      {/* Generated Creative Brief Output */}
      {currentBrief ? (
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 dark:border-white/5 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300">
                  {currentBrief.dimensions}
                </span>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {currentBrief.title}
                </h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {currentBrief.concept}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!canMutate || isSaving}
                onClick={handleSave}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" />
                <span>Briefi Kaydet</span>
              </button>
            </div>
          </div>

          {/* Visual Prompt Section */}
          <div className="rounded-xl border border-slate-200/80 dark:border-white/10 p-4 bg-slate-50/50 dark:bg-white/[0.02] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <ImageIcon className="h-3.5 w-3.5 text-violet-500" />
                YZ Görsel Üretim İstemi (Image Generation Prompt)
              </span>
              <button
                type="button"
                onClick={() => copyPrompt(currentBrief.visualPrompt)}
                className="inline-flex items-center gap-1 text-[11px] text-violet-600 dark:text-violet-400 hover:underline"
              >
                {copied ? <CheckCircle2 className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                <span>{copied ? "Kopyalandı" : "Kopyala"}</span>
              </button>
            </div>
            <p className="text-xs text-slate-800 dark:text-slate-200 font-mono bg-white dark:bg-slate-950 p-3 rounded-lg border border-slate-200 dark:border-white/10">
              {currentBrief.visualPrompt}
            </p>
          </div>

          {/* Storyboard / Shot List */}
          {currentBrief.shotList && currentBrief.shotList.length > 0 ? (
            <div className="space-y-2.5">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Clapperboard className="h-3.5 w-3.5 text-violet-500" />
                Çekim Listesi & Storyboard (Shot List)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {currentBrief.shotList.map((shot) => (
                  <div
                    key={shot.sceneNumber}
                    className="p-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] space-y-1.5 text-xs"
                  >
                    <div className="flex items-center justify-between font-semibold text-slate-900 dark:text-white">
                      <span>Sahne {shot.sceneNumber}</span>
                      <span className="text-[10px] text-slate-400">{shot.durationSeconds} sn</span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 text-[11px]">
                      {shot.visualDescription}
                    </p>
                    <p className="text-violet-600 dark:text-violet-400 text-[10px] italic">
                      &ldquo;{shot.audioNarration}&rdquo;
                    </p>
                    <div className="text-[10px] bg-white dark:bg-slate-950 px-2 py-0.5 rounded border border-slate-200 dark:border-white/10 text-slate-500">
                      Ekran Metni: {shot.overlayText}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Voiceover Script */}
          {currentBrief.voiceoverScript ? (
            <div className="rounded-xl border border-slate-200/80 dark:border-white/10 p-4 bg-slate-50/50 dark:bg-white/[0.02] space-y-1.5">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Volume2 className="h-3.5 w-3.5 text-violet-500" />
                Seslendirme Metni (Voiceover Script)
              </span>
              <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed">
                {currentBrief.voiceoverScript}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Saved Briefs History */}
      <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
          Kayıtlı Kreatif Prodüksiyon Briefleri ({briefsList.length})
        </h3>

        {briefsList.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10">
            Henüz kaydedilmiş kreatif brief bulunmamaktadır.
          </div>
        ) : (
          <div className="space-y-2.5">
            {briefsList.map((item) => (
              <div
                key={item.id}
                className="p-3.5 rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] flex items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-0.5">
                  <p className="font-semibold text-slate-900 dark:text-white">{item.title}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Boyut: {item.dimensions} • Format: {item.format}
                  </p>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">
                  {new Date(item.created_at).toLocaleDateString("tr-TR")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
