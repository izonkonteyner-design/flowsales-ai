"use client";

import React, { useState, useTransition, useRef } from "react";
import {
  Sparkles,
  Send,
  Image as ImageIcon,
  Wand2,
  Upload,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Eye,
  Film,
  Smartphone,
  RefreshCw,
} from "lucide-react";
import {
  createSocialPostAction,
  uploadMarketingMediaAction,
  generateCategorySocialDraftAction,
} from "@/app/(app)/social/actions";
import {
  type SocialPlatform,
  type PlatformCustomizations,
} from "@/server/services/integrations/social-domain";
import type { MarketingMediaAsset } from "@/server/services/media/domain";
import type { SocialPlatformDraft, SocialStudioCategory } from "@/server/services/social/engine";
import { StatusBadge } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";

type UnifiedSocialComposerProps = {
  canMutate: boolean;
  connectedProviders: string[];
};

export function UnifiedSocialComposer({ canMutate, connectedProviders }: UnifiedSocialComposerProps) {
  // Category state (LOOP 1)
  const [category, setCategory] = useState<SocialStudioCategory>("post");

  // Media state (integrated upload per category)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [uploadedAsset, setUploadedAsset] = useState<MarketingMediaAsset | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Platform & Targeting state
  const [selectedPlatforms, setSelectedPlatforms] = useState<SocialPlatform[]>(["instagram", "facebook"]);
  const [activePlatformTab, setActivePlatformTab] = useState<SocialPlatform>("instagram");

  // Post Content state
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [aiDisclosure, setAiDisclosure] = useState(false);
  const [customizations, setCustomizations] = useState<PlatformCustomizations>({});

  // Category AI Assistant state (LOOP 2)
  const [aiTopic, setAiTopic] = useState("");
  const [aiTranscript, setAiTranscript] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [, setIsUploadLoading] = useState(false);
  const [aiResultDrafts, setAiResultDrafts] = useState<SocialPlatformDraft[]>([]);
  const [aiKeywords, setAiKeywords] = useState<string[]>([]);
  const [aiGeoRegions, setAiGeoRegions] = useState<string[]>([]);
  const [aiNotes, setAiNotes] = useState<string[]>([]);

  // Feedback state
  const [isSubmitPending, startSubmitTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Switch category and update defaults
  const handleCategoryChange = (newCat: SocialStudioCategory) => {
    setCategory(newCat);
    setErrorMsg(null);
    setSuccessMsg(null);
    setSelectedFiles([]);
    setPreviewUrls([]);
    setUploadedAsset(null);
    setAiResultDrafts([]);

    if (newCat === "post") {
      setSelectedPlatforms(["instagram", "facebook"]);
      setActivePlatformTab("instagram");
    } else if (newCat === "reel") {
      setSelectedPlatforms(["instagram", "youtube"]);
      setActivePlatformTab("instagram");
    } else if (newCat === "story") {
      setSelectedPlatforms(["instagram", "facebook"]);
      setActivePlatformTab("instagram");
    } else if (newCat === "video") {
      setSelectedPlatforms(["facebook", "youtube"]);
      setActivePlatformTab("youtube");
    }
  };

  // Supported platforms for current category
  const getCategoryPlatforms = (): { platform: SocialPlatform; label: string }[] => {
    if (category === "post") {
      return [
        { platform: "instagram", label: "Instagram" },
        { platform: "facebook", label: "Facebook" },
        { platform: "google", label: "Google Business" },
      ];
    }
    if (category === "reel") {
      return [
        { platform: "instagram", label: "Instagram Reels" },
        { platform: "youtube", label: "YouTube Shorts" },
        { platform: "tiktok", label: "TikTok" },
      ];
    }
    if (category === "story") {
      return [
        { platform: "instagram", label: "Instagram Story" },
        { platform: "facebook", label: "Facebook Story" },
      ];
    }
    return [
      { platform: "youtube", label: "YouTube Video" },
      { platform: "facebook", label: "Facebook Video" },
    ];
  };

  const togglePlatform = (p: SocialPlatform) => {
    if (selectedPlatforms.includes(p)) {
      if (selectedPlatforms.length > 1) {
        const next = selectedPlatforms.filter((item) => item !== p);
        setSelectedPlatforms(next);
        if (activePlatformTab === p) setActivePlatformTab(next[0]);
      }
    } else {
      setSelectedPlatforms([...selectedPlatforms, p]);
    }
  };

  // Direct In-Form File Handling
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    // Validation per category
    if (category === "post") {
      // Allows multiple images (up to 5 for carousel)
      const validImages = files.filter((f) => ["image/jpeg", "image/png", "image/webp"].includes(f.type));
      if (validImages.length === 0) {
        setErrorMsg("Lütfen geçerli görsel dosyaları (JPG, PNG, WebP) seçin.");
        return;
      }
      if (validImages.some((f) => f.size > 10 * 1024 * 1024)) {
        setErrorMsg("Görsellerden biri 10 MB sınırını aşıyor.");
        return;
      }
      setSelectedFiles(validImages);
      setPreviewUrls(validImages.map((f) => URL.createObjectURL(f)));
    } else {
      // Video formats for Reel, Story, Video
      const file = files[0];
      const isVideo = ["video/mp4", "video/quicktime"].includes(file.type);
      const isImage = ["image/jpeg", "image/png", "image/webp"].includes(file.type);

      if (category === "story" && !isImage && !isVideo) {
        setErrorMsg("Hikâye için JPG, PNG görseli veya MP4/MOV videosu seçiniz.");
        return;
      }
      if ((category === "reel" || category === "video") && !isVideo) {
        setErrorMsg("Lütfen MP4 veya MOV video dosyası seçiniz.");
        return;
      }
      if (file.size > 100 * 1024 * 1024) {
        setErrorMsg("Video dosyası 100 MB sınırını aşıyor.");
        return;
      }

      setSelectedFiles([file]);
      setPreviewUrls([URL.createObjectURL(file)]);
    }

    // Auto-trigger upload and vision analysis in background
    uploadAndAnalyzeMedia(files[0]);
  };

  const uploadAndAnalyzeMedia = async (file: File) => {
    setIsUploadLoading(true);
    setUploadProgress("Dosya yükleniyor ve görsel analizi yapılıyor...");
    try {
      const formData = new FormData();
      formData.set("file", file);
      const res = await uploadMarketingMediaAction(formData);
      if (res.success && res.asset) {
        setUploadedAsset(res.asset);
        setUploadProgress(null);
        setSuccessMsg("Medya başarıyla yüklendi ve incelendi.");
      } else {
        setUploadProgress(null);
        setErrorMsg(res.error || "Medya yüklenemedi.");
      }
    } catch {
      setUploadProgress(null);
      setErrorMsg("Medya yüklenirken sunucu hatası oluştu.");
    } finally {
      setIsUploadLoading(false);
    }
  };

  // Run Category AI Assistant (LOOP 2)
  const handleGenerateCategoryAi = async () => {
    setIsAiLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await generateCategorySocialDraftAction({
        category,
        analysis: uploadedAsset?.analysisResult,
        manualTopic: aiTopic.trim() || undefined,
        transcriptOrDescription: aiTranscript.trim() || undefined,
        mediaUrls: uploadedAsset?.publicUrl ? [uploadedAsset.publicUrl] : previewUrls,
        platforms: selectedPlatforms,
      });

      if (res.success && res.result) {
        const { drafts, subjectTitle, seoKeywords, geoRegions, notes } = res.result;
        setAiResultDrafts(drafts);
        setAiKeywords(seoKeywords || []);
        setAiGeoRegions(geoRegions || []);
        setAiNotes(notes || []);

        if (subjectTitle && !title) setTitle(subjectTitle);

        // Populate customizations for each platform
        const newCustomizations: PlatformCustomizations = { ...customizations };
        drafts.forEach((d) => {
          newCustomizations[d.platform as SocialPlatform] = {
            title: d.headline,
            caption: `${d.caption}\n\n${d.hashtags.join(" ")}`.trim(),
            cta: d.cta,
            mediaUrl: d.mediaUrl,
          };
        });
        setCustomizations(newCustomizations);

        // Set default caption from primary active platform draft
        const primaryDraft = drafts.find((d) => d.platform === activePlatformTab) || drafts[0];
        if (primaryDraft) {
          setCaption(`${primaryDraft.caption}\n\n${primaryDraft.hashtags.join(" ")}`.trim());
          if (primaryDraft.headline) setTitle(primaryDraft.headline);
        }

        setSuccessMsg(`${category.toUpperCase()} için kategoriye özel AI taslakları başarıyla üretildi!`);
      } else {
        setErrorMsg(res.error || "AI içerik üretimi başarısız oldu.");
      }
    } catch {
      setErrorMsg("Yapay zeka asistanı çağrılırken bir hata oluştu.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleCustomizationChange = (
    platform: SocialPlatform,
    field: "title" | "caption" | "cta" | "mediaUrl",
    value: string,
  ) => {
    setCustomizations((prev) => ({
      ...prev,
      [platform]: {
        ...prev[platform],
        [field]: value,
      },
    }));
  };

  // Submit / Schedule Handler (LOOP 3)
  const handleSubmit = (status: "draft" | "scheduled") => {
    // Media validation: Posts, Reels, Stories, Videos require media
    const resolvedMediaUrl = uploadedAsset?.publicUrl || previewUrls[0] || "";
    if (!resolvedMediaUrl && (category === "post" || category === "reel" || category === "story" || category === "video")) {
      setErrorMsg("Bu içerik kategorisi için görsel veya video yüklenmesi zorunludur.");
      return;
    }

    if (!caption.trim()) {
      setErrorMsg("Lütfen içerik metni (açıklama) giriniz.");
      return;
    }

    if (status === "scheduled" && !scheduledAt) {
      setErrorMsg("Zamanlanmış yayın için lütfen geçerli bir tarih ve saat seçin.");
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);

    const formData = new FormData();
    formData.append("title", title);
    formData.append("caption", caption);
    formData.append("contentType", category === "post" ? "post" : category === "reel" ? "reel" : category === "story" ? "story" : "video");
    formData.append("status", status);
    formData.append("mediaUrl", resolvedMediaUrl);
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
        setSuccessMsg(
          status === "scheduled"
            ? "Gönderi başarıyla planlandı ve yayın kuyruğuna eklendi!"
            : "Gönderi taslak olarak kaydedildi.",
        );
        // Reset form
        setTitle("");
        setCaption("");
        setSelectedFiles([]);
        setPreviewUrls([]);
        setUploadedAsset(null);
        setScheduledAt("");
        setCustomizations({});
        setAiResultDrafts([]);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Gönderi kaydedilirken hata oluştu.");
      }
    });
  };

  const activeDraft = aiResultDrafts.find((d) => d.platform === activePlatformTab);
  const currentPlatformCaption = customizations[activePlatformTab]?.caption || caption;
  const currentPlatformTitle = customizations[activePlatformTab]?.title || title;

  return (
    <div className="space-y-6 rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white dark:bg-slate-900 p-5 shadow-sm">
      {/* Category Navigation Pills (LOOP 1) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 dark:border-white/5 pb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Sosyal Medya Yayın Stüdyosu</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Kategoriye özel medya yükleme, yapay zeka içerik üretimi ve platform bazlı planlama.
          </p>
        </div>

        {/* Category Selector Tabs */}
        <div className="inline-flex rounded-xl bg-slate-100 dark:bg-white/5 p-1 text-xs font-medium">
          <button
            type="button"
            onClick={() => handleCategoryChange("post")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer",
              category === "post"
                ? "bg-white dark:bg-violet-600 text-slate-900 dark:text-white shadow-sm font-semibold"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900",
            )}
          >
            <ImageIcon className="h-3.5 w-3.5 text-violet-500" />
            <span>Gönderi (Post)</span>
          </button>

          <button
            type="button"
            onClick={() => handleCategoryChange("reel")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer",
              category === "reel"
                ? "bg-white dark:bg-violet-600 text-slate-900 dark:text-white shadow-sm font-semibold"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900",
            )}
          >
            <Smartphone className="h-3.5 w-3.5 text-fuchsia-500" />
            <span>Reels / Shorts</span>
          </button>

          <button
            type="button"
            onClick={() => handleCategoryChange("story")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer",
              category === "story"
                ? "bg-white dark:bg-violet-600 text-slate-900 dark:text-white shadow-sm font-semibold"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900",
            )}
          >
            <Clock className="h-3.5 w-3.5 text-amber-500" />
            <span>Hikâye (Story)</span>
          </button>

          <button
            type="button"
            onClick={() => handleCategoryChange("video")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer",
              category === "video"
                ? "bg-white dark:bg-violet-600 text-slate-900 dark:text-white shadow-sm font-semibold"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900",
            )}
          >
            <Film className="h-3.5 w-3.5 text-rose-500" />
            <span>Video</span>
          </button>
        </div>
      </div>

      {/* Status Messages */}
      {errorMsg ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      ) : null}

      {successMsg ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      ) : null}

      {/* Main Grid: Form & Media on Left, AI Assistant & Preview on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Form & In-Form Media Upload (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Platform Selector with Connection Badges */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Yayınlanacak Kanallar ({category.toUpperCase()})
            </label>
            <div className="flex flex-wrap gap-2">
              {getCategoryPlatforms().map(({ platform, label }) => {
                const isSelected = selectedPlatforms.includes(platform);
                const isConnected = connectedProviders.includes(platform);
                return (
                  <button
                    key={platform}
                    type="button"
                    onClick={() => togglePlatform(platform)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition cursor-pointer",
                      isSelected
                        ? "border-violet-600 bg-violet-50/50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300 font-semibold"
                        : "border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:border-slate-300",
                    )}
                  >
                    <span className="capitalize">{label}</span>
                    <span
                      className={cn(
                        "w-2 h-2 rounded-full",
                        isConnected ? "bg-emerald-500" : "bg-amber-400",
                      )}
                      title={isConnected ? "OAuth Bağlı" : "OAuth Bağlantısı Gerekli (Önizleme Modu)"}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Direct In-Form Media Upload Area (LOOP 1) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {category === "post"
                  ? "Fotoğraf / Çoklu Görsel (Carousel)"
                  : category === "reel"
                  ? "Dikey Video (MP4/MOV, Maks 90s)"
                  : category === "story"
                  ? "Hikâye Medyası (9:16 Görsel veya Video)"
                  : "Video Medyası (Yatay MP4/MOV)"}
              </label>
              {category === "story" ? (
                <span className="text-[11px] text-slate-400">9:16 Format Önerilir</span>
              ) : null}
            </div>

            <div
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition relative group",
                selectedFiles.length > 0
                  ? "border-emerald-500/40 bg-emerald-50/20 dark:bg-emerald-500/5"
                  : "border-slate-300 dark:border-white/10 hover:border-violet-500/50 bg-slate-50 dark:bg-white/[0.02]",
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple={category === "post"}
                accept={
                  category === "post"
                    ? "image/jpeg,image/png,image/webp"
                    : category === "story"
                    ? "image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
                    : "video/mp4,video/quicktime"
                }
                onChange={handleFileSelect}
                className="hidden"
              />

              {previewUrls.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    {previewUrls.slice(0, 4).map((url, i) => (
                      <div key={i} className="relative w-24 h-24 rounded-lg overflow-hidden border border-slate-200 dark:border-white/10">
                        {selectedFiles[i]?.type.startsWith("video") ? (
                          <video src={url} className="w-full h-full object-cover" />
                        ) : (
                          <img src={url} alt={`Preview ${i}`} className="w-full h-full object-cover" />
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                    {selectedFiles.length} dosya seçildi ({selectedFiles[0]?.name}). Değiştirmek için tıklayın.
                  </p>
                </div>
              ) : (
                <div className="py-4">
                  <Upload className="h-7 w-7 text-slate-400 mx-auto mb-2 group-hover:text-violet-500 transition" />
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Dosya seçmek için tıklayın veya sürükleyip bırakın
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {category === "post"
                      ? "Tek veya çoklu görsel (JPG, PNG, WebP — Maks 10 MB)"
                      : category === "reel"
                      ? "Maksimum 100 MB MP4 veya MOV video dosyası"
                      : category === "story"
                      ? "9:16 oranında görsel veya 15 saniyeye kadar kısa video"
                      : "Uzun format video dosyası (MP4/MOV)"}
                  </p>
                </div>
              )}
            </div>

            {uploadProgress ? (
              <div className="flex items-center gap-2 text-xs text-violet-600 dark:text-violet-400">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>{uploadProgress}</span>
              </div>
            ) : null}

            {uploadedAsset ? (
              <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] p-3 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">Görsel / Video Analiz Durumu:</span>
                  <StatusBadge
                    tone={
                      uploadedAsset.analysisResult?.analysis_status === "ANALYZED"
                        ? "success"
                        : uploadedAsset.analysisResult?.analysis_status === "RATE_LIMITED"
                        ? "warning"
                        : "neutral"
                    }
                  >
                    {uploadedAsset.analysisResult?.analysis_status || "Yüklendi"}
                  </StatusBadge>
                </div>
                {uploadedAsset.analysisResult?.visual_description ? (
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                    {uploadedAsset.analysisResult.visual_description}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Independent Platform Tabs for Captions (LOOP 1) */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-2">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Platforma Özel Metin ve Başlıklar
              </span>
              <div className="flex gap-1">
                {selectedPlatforms.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setActivePlatformTab(p)}
                    className={cn(
                      "px-2.5 py-1 text-xs rounded-lg font-medium transition cursor-pointer capitalize",
                      activePlatformTab === p
                        ? "bg-violet-600 text-white"
                        : "bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:text-slate-900",
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Title / Headline (for YouTube, Google Business, Facebook) */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Başlık ({activePlatformTab.toUpperCase()})
              </label>
              <input
                type="text"
                value={currentPlatformTitle}
                onChange={(e) => {
                  setTitle(e.target.value);
                  handleCustomizationChange(activePlatformTab, "title", e.target.value);
                }}
                placeholder="Örn: 3x7 Metre Sandviç Panel Ofis Konteyneri"
                className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>

            {/* Main Caption / Description */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Açıklama / Metin ({activePlatformTab.toUpperCase()})
                </label>
                <span className="text-[11px] text-slate-400">
                  {currentPlatformCaption.length} karakter
                </span>
              </div>
              <textarea
                rows={5}
                value={currentPlatformCaption}
                onChange={(e) => {
                  setCaption(e.target.value);
                  handleCustomizationChange(activePlatformTab, "caption", e.target.value);
                }}
                placeholder="Gönderi metnini buraya yazın veya yandaki Yapay Zeka Asistanı ile üretin..."
                className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 p-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-violet-500 leading-relaxed"
              />
            </div>
          </div>

          {/* Scheduling & Save Controls (LOOP 3) */}
          <div className="pt-2 space-y-4 border-t border-slate-100 dark:border-white/5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  <span>Zamanlama (İsteğe Bağlı)</span>
                </label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-5">
                <input
                  type="checkbox"
                  id="aiDisclosure"
                  checked={aiDisclosure}
                  onChange={(e) => setAiDisclosure(e.target.checked)}
                  className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                />
                <label htmlFor="aiDisclosure" className="text-xs text-slate-600 dark:text-slate-400">
                  Yapay zeka ile üretildi etiketi ekle (Meta AI Disclosure)
                </label>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isSubmitPending || !canMutate}
                onClick={() => handleSubmit("draft")}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer"
              >
                Taslak Olarak Kaydet
              </button>

              <button
                type="button"
                disabled={isSubmitPending || !canMutate}
                onClick={() => handleSubmit("scheduled")}
                className="flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-xl bg-violet-600 hover:bg-violet-700 text-white transition cursor-pointer shadow-sm disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                <span>{scheduledAt ? "Zamanla & Yayına Al" : "Hemen Yayınla / Planla"}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Dedicated Category AI Assistant & Preview (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Category-Specific AI Box (LOOP 2) */}
          <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-b from-violet-500/5 to-transparent p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wand2 className="h-4 w-4 text-violet-500" />
                <span className="text-xs font-semibold text-slate-900 dark:text-white">
                  {category === "post"
                    ? "Gönderi AI Asistanı"
                    : category === "reel"
                    ? "Reels & Shorts AI Asistanı"
                    : category === "story"
                    ? "Hikâye AI Asistanı"
                    : "Video AI Asistanı"}
                </span>
              </div>
              <StatusBadge tone="info">Özel Kategori Motoru</StatusBadge>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              {category === "post"
                ? "Görsel içeriğini, SEO ve GEO anahtar kelimelerini analiz ederek en fazla 5 etiketli ve platforma özel kancalar üretir."
                : category === "reel"
                ? "İlk 3 saniyede izleyiciyi durduran hook ve YouTube Shorts için SEO uyumlu başlık hazırlar."
                : category === "story"
                ? "Dikey 9:16 formata uygun samimi, net ve harekete geçirici kısa metinler yazar."
                : "Ayrıntılı video açıklaması, zaman damgalı bölümler (0:00 Giriş vb.) ve meta etiketler üretir."}
            </p>

            <div className="space-y-2 pt-1">
              <input
                type="text"
                value={aiTopic}
                onChange={(e) => setAiTopic(e.target.value)}
                placeholder={
                  category === "post"
                    ? "Ekstra ürün detayı / odak (isteğe bağlı)..."
                    : category === "reel"
                    ? "Video konusu veya öne çıkan özellik..."
                    : category === "story"
                    ? "Hikâyenin mesajı (örn: Yeni kampanya, bugün teslimat)..."
                    : "Videonun ana teması veya eğitim başlığı..."
                }
                className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
              />

              {category === "reel" || category === "video" ? (
                <textarea
                  rows={2}
                  value={aiTranscript}
                  onChange={(e) => setAiTranscript(e.target.value)}
                  placeholder="Doğrulanmış video özeti / konuşma transkripti (isteğe bağlı)..."
                  className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 p-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-violet-500 leading-relaxed"
                />
              ) : null}

              <button
                type="button"
                disabled={isAiLoading}
                onClick={handleGenerateCategoryAi}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold transition cursor-pointer shadow-sm disabled:opacity-50"
              >
                {isAiLoading ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>AI Analiz Ediyor ve Yazıyor...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>{category.toUpperCase()} AI Asistanı ile Üret</span>
                  </>
                )}
              </button>
            </div>

            {/* Generated SEO & GEO insights */}
            {aiKeywords.length > 0 || aiGeoRegions.length > 0 ? (
              <div className="rounded-xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-slate-800/60 p-3 text-xs space-y-2">
                {aiKeywords.length > 0 ? (
                  <div>
                    <span className="font-semibold text-slate-700 dark:text-slate-300 text-[11px]">
                      SEO & Arama Niyeti Terimleri:
                    </span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {aiKeywords.map((kw, i) => (
                        <span key={i} className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/10 text-[11px] text-slate-700 dark:text-slate-300">
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {aiGeoRegions.length > 0 ? (
                  <div>
                    <span className="font-semibold text-slate-700 dark:text-slate-300 text-[11px]">
                      Hedef Lokasyonlar (GEO):
                    </span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {aiGeoRegions.map((geo, i) => (
                        <span key={i} className="px-2 py-0.5 rounded-md bg-violet-50 dark:bg-violet-500/10 text-[11px] text-violet-700 dark:text-violet-300 font-medium">
                          {geo}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {aiNotes.length > 0 ? (
                  <div className="pt-1 text-[11px] text-slate-500 italic">
                    {aiNotes[0]}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Platform Live Preview Card (LOOP 3) */}
          <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-800/40 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Eye className="h-3.5 w-3.5 text-slate-400" />
                <span>Önizleme: {activePlatformTab.toUpperCase()} ({category.toUpperCase()})</span>
              </span>
              <StatusBadge tone="neutral">Canlı Taslak</StatusBadge>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
              {/* Media Preview inside Mockup */}
              {previewUrls.length > 0 ? (
                <div className="relative aspect-video bg-black flex items-center justify-center">
                  {selectedFiles[0]?.type.startsWith("video") ? (
                    <video src={previewUrls[0]} controls className="w-full h-full object-contain" />
                  ) : (
                    <img src={previewUrls[0]} alt="Mockup" className="w-full h-full object-contain" />
                  )}
                  {previewUrls.length > 1 ? (
                    <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/60 text-white text-[10px] font-medium">
                      1/{previewUrls.length}
                    </span>
                  ) : null}
                </div>
              ) : (
                <div className="aspect-video bg-slate-100 dark:bg-white/5 flex flex-col items-center justify-center text-slate-400 text-xs">
                  <ImageIcon className="h-8 w-8 mb-1 opacity-50" />
                  <span>Görsel veya video seçildiğinde burada görünecektir</span>
                </div>
              )}

              {/* Text Preview inside Mockup */}
              <div className="p-3.5 space-y-2">
                {currentPlatformTitle ? (
                  <p className="text-xs font-bold text-slate-900 dark:text-white line-clamp-1">
                    {currentPlatformTitle}
                  </p>
                ) : null}

                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap line-clamp-5">
                  {currentPlatformCaption || "İçerik açıklaması buraya yansıyacaktır..."}
                </p>

                {activeDraft?.cta ? (
                  <div className="pt-1">
                    <span className="inline-block text-[11px] font-semibold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10 px-2.5 py-1 rounded-lg">
                      {activeDraft.cta}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
