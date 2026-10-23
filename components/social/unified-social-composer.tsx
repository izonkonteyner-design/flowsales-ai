"use client";

import React, { useState, useTransition } from "react";
import {
  Sparkles,
  Send,
  Image as ImageIcon,
  Video,
  FileText,
  Layers,
  Wand2,
} from "lucide-react";
import { createSocialPostAction, generateCaptionSuggestionsAction } from "@/app/(app)/social/actions";
import {
  type SocialPlatform,
  type SocialContentType,
  type PlatformCustomizations,
} from "@/server/services/integrations/social-domain";
import { cn } from "@/lib/utils";

type UnifiedSocialComposerProps = {
  canMutate: boolean;
  connectedProviders: string[];
};

export function UnifiedSocialComposer({ canMutate, connectedProviders }: UnifiedSocialComposerProps) {
  const [selectedPlatforms, setSelectedPlatforms] = useState<SocialPlatform[]>(["instagram", "facebook"]);
  const [contentType, setContentType] = useState<SocialContentType>("post");
  const [activeTab, setActiveTab] = useState<SocialPlatform>("instagram");
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [aiDisclosure, setAiDisclosure] = useState(false);
  const [customizations, setCustomizations] = useState<PlatformCustomizations>({});

  // AI Assistant states
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiTopic, setAiTopic] = useState("");
  const [aiCta, setAiCta] = useState("");
  const [aiTone, setAiTone] = useState("Etkileyici & Profesyonel");
  const [aiLanguage, setAiLanguage] = useState<"tr" | "en" | "auto">("auto");
  const [aiResult, setAiResult] = useState<{
    caption: string;
    hashtags: string[];
    headlines: string[];
    hooks: string[];
    callToAction: string;
  } | null>(null);

  const [isAiPending, startAiTransition] = useTransition();
  const [isSubmitPending, startSubmitTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const togglePlatform = (p: SocialPlatform) => {
    if (selectedPlatforms.includes(p)) {
      if (selectedPlatforms.length > 1) {
        setSelectedPlatforms(selectedPlatforms.filter((item) => item !== p));
        if (activeTab === p) {
          const remaining = selectedPlatforms.filter((item) => item !== p);
          setActiveTab(remaining[0]);
        }
      }
    } else {
      setSelectedPlatforms([...selectedPlatforms, p]);
    }
  };

  const handleCustomizationChange = (platform: SocialPlatform, field: "title" | "caption", value: string) => {
    setCustomizations((prev) => ({
      ...prev,
      [platform]: {
        ...prev[platform],
        [field]: value,
      },
    }));
  };

  const handleGenerateAi = () => {
    if (!aiTopic.trim()) return;
    setErrorMsg(null);
    startAiTransition(async () => {
      const res = await generateCaptionSuggestionsAction({
        topic: aiTopic,
        callToAction: aiCta,
        platform: selectedPlatforms[0],
        contentType,
        tone: aiTone,
        language: aiLanguage,
      });

      if (res.success && res.suggestions) {
        setAiResult(res.suggestions);
      } else {
        setErrorMsg(res.error || "AI önerisi üretilemedi.");
      }
    });
  };

  const applyAiSuggestion = (field: "caption" | "headline" | "hook" | "hashtags", val: string) => {
    if (field === "caption") {
      setCaption(val);
    } else if (field === "headline") {
      setTitle(val);
    } else if (field === "hook") {
      setCaption((prev) => `${val}\n\n${prev}`);
    } else if (field === "hashtags") {
      setCaption((prev) => `${prev}\n\n${val}`);
    }
  };

  const handleSubmit = (status: "draft" | "scheduled") => {
    if (!caption.trim()) {
      setErrorMsg("Gönderi metni (caption) boş olamaz.");
      return;
    }
    setErrorMsg(null);

    const formData = new FormData();
    formData.append("title", title);
    formData.append("caption", caption);
    formData.append("contentType", contentType);
    formData.append("status", status);
    formData.append("mediaUrl", mediaUrl);
    if (scheduledAt) {
      formData.append("scheduledAt", scheduledAt);
    }
    if (aiDisclosure) {
      formData.append("aiGeneratedDisclosure", "true");
    }
    selectedPlatforms.forEach((p) => formData.append("platforms", p));
    formData.append("platformCustomizations", JSON.stringify(customizations));

    startSubmitTransition(async () => {
      try {
        await createSocialPostAction(formData);
        // Reset form
        setTitle("");
        setCaption("");
        setMediaUrl("");
        setScheduledAt("");
        setCustomizations({});
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Gönderi kaydedilirken hata oluştu.");
      }
    });
  };

  return (
    <div className="space-y-5 rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white dark:bg-slate-900 p-5 shadow-sm">
      {/* Header & AI trigger */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 dark:border-white/5 pb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Yeni Sosyal Medya Gönderisi</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Instagram, Facebook, TikTok ve YouTube için tek noktadan çoklu platform yayını hazırlayın.
          </p>
        </div>
        <button
          type="button"
          disabled={!canMutate}
          onClick={() => setShowAiModal(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" />
          <span>YZ Metin Asistanı</span>
        </button>
      </div>

      {errorMsg ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 dark:border-rose-500/20 dark:bg-rose-500/10 p-3 text-xs text-rose-800 dark:text-rose-200">
          {errorMsg}
        </div>
      ) : null}

      {/* Target Platforms */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
          Hedef Platformlar (Çoklu Seçim)
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {(["instagram", "facebook", "tiktok", "youtube"] as SocialPlatform[]).map((p) => {
            const isSelected = selectedPlatforms.includes(p);
            const isConnected = connectedProviders.includes(p);
            return (
              <button
                key={p}
                type="button"
                onClick={() => togglePlatform(p)}
                disabled={!canMutate}
                className={cn(
                  "flex items-center justify-between p-3 rounded-xl border text-xs font-medium transition cursor-pointer text-left",
                  isSelected
                    ? "border-violet-500 bg-violet-50/50 dark:bg-violet-950/20 text-slate-900 dark:text-white ring-1 ring-violet-500/30"
                    : "border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10",
                )}
              >
                <div>
                  <p className="font-semibold capitalize">{p}</p>
                  <p className="text-[10px] text-slate-400">
                    {isConnected ? "✓ Bağlı" : "Hesap Gerekli"}
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={isSelected}
                  readOnly
                  className="rounded border-slate-300 text-violet-600"
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Format Selector */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
          İçerik Formatı (Content Format)
        </label>
        <div className="flex flex-wrap gap-2">
          {[
            { id: "post" as SocialContentType, label: "Standart Gönderi", icon: ImageIcon },
            { id: "reel_short" as SocialContentType, label: "Reels / Shorts (9:16)", icon: Video },
            { id: "story" as SocialContentType, label: "Hikaye (Story)", icon: Layers },
            { id: "video" as SocialContentType, label: "Uzun Video", icon: Video },
            { id: "text" as SocialContentType, label: "Metin Gönderisi", icon: FileText },
          ].map((fmt) => {
            const Icon = fmt.icon;
            const isChosen = contentType === fmt.id;
            return (
              <button
                key={fmt.id}
                type="button"
                onClick={() => setContentType(fmt.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition",
                  isChosen
                    ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white"
                    : "border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{fmt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Shared Inputs */}
      <div className="space-y-3.5">
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Genel Başlık (Title)
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={!canMutate}
            placeholder="Örn: Sonbahar İndirimi Başladı | FlowSales AI"
            className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3.5 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Ana Açıklama / Gönderi Metni (Caption) *
          </label>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            required
            rows={4}
            disabled={!canMutate}
            placeholder="Gönderi metninizi buraya yazın veya YZ Asistanı ile otomatik oluşturun..."
            className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3.5 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Medya URL (Görsel veya Video)
          </label>
          <input
            type="url"
            value={mediaUrl}
            onChange={(e) => setMediaUrl(e.target.value)}
            disabled={!canMutate}
            placeholder="https://.../video.mp4 veya https://.../image.jpg"
            className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3.5 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          />
          <p className="text-[11px] text-slate-400 mt-1">
            Instagram için görsel veya video; TikTok ve YouTube için .mp4 / .mov video zorunludur.
          </p>
        </div>
      </div>

      {/* Platform Customization Tabs */}
      {selectedPlatforms.length > 1 ? (
        <div className="rounded-xl border border-slate-200/80 dark:border-white/10 p-3 bg-slate-50/50 dark:bg-white/[0.02]">
          <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-2">
            Platforma Özel İnce Ayarlar (İsteğe Bağlı)
          </p>
          <div className="flex gap-2 border-b border-slate-200 dark:border-white/10 pb-2 mb-3">
            {selectedPlatforms.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setActiveTab(p)}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-medium capitalize transition",
                  activeTab === p
                    ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900",
                )}
              >
                {p}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <input
              type="text"
              value={customizations[activeTab]?.title || ""}
              onChange={(e) => handleCustomizationChange(activeTab, "title", e.target.value)}
              placeholder={`${activeTab.toUpperCase()} için özel başlık...`}
              className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-white"
            />
            <textarea
              value={customizations[activeTab]?.caption || ""}
              onChange={(e) => handleCustomizationChange(activeTab, "caption", e.target.value)}
              rows={2}
              placeholder={`${activeTab.toUpperCase()} için özel açıklama metni...`}
              className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-white"
            />
          </div>
        </div>
      ) : null}

      {/* Footer Controls & Scheduling */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-white/5">
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Zamanlama (Boş bırakılırsa taslak kalır)
          </label>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            disabled={!canMutate}
            className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white"
          />
        </div>

        <div className="flex flex-col justify-end">
          <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer mb-3">
            <input
              type="checkbox"
              checked={aiDisclosure}
              onChange={(e) => setAiDisclosure(e.target.checked)}
              className="rounded border-slate-300 text-violet-600"
            />
            <span>YZ ile üretildiğini belirt (AI Generated Content Disclosure)</span>
          </label>

          <div className="flex justify-end gap-2.5">
            <button
              type="button"
              disabled={!canMutate || isSubmitPending}
              onClick={() => handleSubmit("draft")}
              className="rounded-xl border border-slate-200 dark:border-white/10 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-50"
            >
              Taslak Kaydet
            </button>
            <button
              type="button"
              disabled={!canMutate || isSubmitPending}
              onClick={() => handleSubmit(scheduledAt ? "scheduled" : "draft")}
              className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              <span>{scheduledAt ? "Zamanla & Kuyruğa Al" : "Yayın / Taslak Onayla"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* AI Modal Drawer */}
      {showAiModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg space-y-4 rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-3">
              <div className="flex items-center gap-2">
                <Wand2 className="h-5 w-5 text-violet-500" />
                <h3 className="text-base font-semibold text-slate-950 dark:text-white">
                  YZ Sosyal Medya Metin Asistanı
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAiModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  İçerik Konusu / Fırsat *
                </label>
                <input
                  type="text"
                  value={aiTopic}
                  onChange={(e) => setAiTopic(e.target.value)}
                  placeholder="Örn: 2026 Konteyner ve Prefabrik Evlerde %20 İndirim"
                  className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Çıktı Dili
                  </label>
                  <select
                    value={aiLanguage}
                    onChange={(e) => setAiLanguage(e.target.value as "tr" | "en" | "auto")}
                    className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
                  >
                    <option value="auto">Otomatik (TR/EN)</option>
                    <option value="tr">Türkçe (TR)</option>
                    <option value="en">English (EN)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Ton
                  </label>
                  <select
                    value={aiTone}
                    onChange={(e) => setAiTone(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
                  >
                    <option value="Etkileyici & Profesyonel">Etkileyici & Profesyonel</option>
                    <option value="Samimi & Dinamik">Samimi & Dinamik</option>
                    <option value="Doğrudan Satış Odaklı">Doğrudan Satış Odaklı</option>
                    <option value="Merak Uyandırıcı">Merak Uyandırıcı (Viral Hook)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Eylem Çağrısı (CTA - İsteğe Bağlı)
                </label>
                <input
                  type="text"
                  value={aiCta}
                  onChange={(e) => setAiCta(e.target.value)}
                  placeholder="Örn: DM atın veya profildeki linke tıklayın!"
                  className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <button
                type="button"
                disabled={isAiPending || !aiTopic.trim()}
                onClick={handleGenerateAi}
                className="w-full rounded-xl bg-violet-600 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50"
              >
                {isAiPending ? "Üretiliyor..." : "Önerileri Oluştur"}
              </button>
            </div>

            {aiResult ? (
              <div className="space-y-3 border-t border-slate-100 dark:border-white/5 pt-3 max-h-60 overflow-y-auto">
                <div className="rounded-xl border border-slate-200 dark:border-white/10 p-3 bg-slate-50 dark:bg-white/5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Önerilen Başlık</span>
                    <button
                      type="button"
                      onClick={() => applyAiSuggestion("headline", aiResult.headlines[0])}
                      className="text-[11px] text-violet-600 dark:text-violet-400 hover:underline"
                    >
                      Forma Ekle
                    </button>
                  </div>
                  <p className="text-xs text-slate-900 dark:text-white font-medium">{aiResult.headlines[0]}</p>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-white/10 p-3 bg-slate-50 dark:bg-white/5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Önerilen Açıklama</span>
                    <button
                      type="button"
                      onClick={() => applyAiSuggestion("caption", aiResult.caption)}
                      className="text-[11px] text-violet-600 dark:text-violet-400 hover:underline"
                    >
                      Forma Ekle
                    </button>
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{aiResult.caption}</p>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (aiResult.headlines[0]) setTitle(aiResult.headlines[0]);
                      setCaption(aiResult.caption);
                      setShowAiModal(false);
                    }}
                    className="rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-4 py-2 text-xs font-semibold"
                  >
                    Tümünü Uygula ve Kapat
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
