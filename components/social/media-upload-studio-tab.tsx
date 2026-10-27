"use client";

import React, { useState, useTransition } from "react";
import {
  Upload,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  Send,
  Layers,
  RefreshCw,
  Edit3,
  MapPin,
  Key,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  uploadMarketingMediaAction,
  reanalyzeMarketingMediaAction,
  generateMultiplatformSocialDraftsAction,
  createSocialPostAction,
} from "@/app/(app)/social/actions";
import type { MarketingMediaAsset, ManualMediaInput } from "@/server/services/media/domain";
import type { SocialPlatformDraft } from "@/server/services/social/engine";

export function MediaUploadStudioTab() {
  const [isPending, startTransition] = useTransition();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Manual inputs for fallback/refinement
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualProduct, setManualProduct] = useState("");
  const [manualCategory, setManualCategory] = useState("");
  const [manualFeatures, setManualFeatures] = useState("");
  const [manualTargetCity, setManualTargetCity] = useState("İstanbul & Marmara Bölgesi");

  const [uploadedAsset, setUploadedAsset] = useState<MarketingMediaAsset | null>(null);
  const [drafts, setDrafts] = useState<SocialPlatformDraft[]>([]);
  const [copiedDraftId, setCopiedDraftId] = useState<string | null>(null);
  const [savedDraftIds, setSavedDraftIds] = useState<Set<string>>(new Set());

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    const isImage = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
    const isVideo = ["video/mp4", "video/quicktime"].includes(file.type);

    if (!isImage && !isVideo) {
      setErrorMsg("Desteklenmeyen dosya türü. Lütfen JPG, PNG, WebP, MP4 veya MOV yükleyin.");
      return;
    }

    if (isImage && file.size > 10 * 1024 * 1024) {
      setErrorMsg("Görsel dosyası 10 MB sınırını aşıyor.");
      return;
    }

    if (isVideo && file.size > 100 * 1024 * 1024) {
      setErrorMsg("Video dosyası 100 MB sınırını aşıyor.");
      return;
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleUploadAndAnalyze = (withManual = false) => {
    if (!selectedFile) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    startTransition(async () => {
      const formData = new FormData();
      formData.set("file", selectedFile);

      if (withManual || showManualForm) {
        if (manualProduct) formData.set("manualProductOrService", manualProduct);
        if (manualCategory) formData.set("manualCategory", manualCategory);
        if (manualFeatures) formData.set("manualFeatures", manualFeatures);
        if (manualTargetCity) formData.set("manualTargetCity", manualTargetCity);
      }

      const res = await uploadMarketingMediaAction(formData);
      if (!res.success || !res.asset) {
        setErrorMsg(res.error || "Medya yüklenemedi.");
        return;
      }

      setUploadedAsset(res.asset);
      const isAnalyzed = res.asset.analysisResult.analysis_status === "ANALYZED";

      if (isAnalyzed) {
        setSuccessMsg("Medya başarıyla yüklendi ve doğrulanmış yapay zeka görsel analizi tamamlandı!");
      } else {
        setSuccessMsg("Medya yüklendi. Görsel model analizi yapılamadı veya girdi bekleniyor.");
        setShowManualForm(true);
      }

      // Generate drafts
      const draftsRes = await generateMultiplatformSocialDraftsAction({
        analysis: res.asset.analysisResult,
        mediaUrl: res.asset.publicUrl,
        language: "tr",
        targetCity: manualTargetCity,
      });

      if (draftsRes.success && draftsRes.campaignDraft) {
        setDrafts(draftsRes.campaignDraft.drafts);
      }
    });
  };

  const handleRetryWithManual = () => {
    if (!uploadedAsset) return;

    startTransition(async () => {
      const manualInput: ManualMediaInput = {
        productOrService: manualProduct || undefined,
        productCategory: manualCategory || undefined,
        features: manualFeatures ? manualFeatures.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean) : undefined,
        targetCity: manualTargetCity || undefined,
      };

      const res = await reanalyzeMarketingMediaAction({
        assetId: uploadedAsset.id,
        manualInput,
      });

      if (!res.success || !res.asset) {
        setErrorMsg(res.error || "Yeniden analiz başarısız oldu.");
        return;
      }

      setUploadedAsset(res.asset);
      setSuccessMsg("Ürün bilgileri güncellendi ve taslaklar yeniden üretiliyor!");

      const draftsRes = await generateMultiplatformSocialDraftsAction({
        analysis: res.asset.analysisResult,
        mediaUrl: res.asset.publicUrl,
        language: "tr",
        targetCity: manualTargetCity,
      });

      if (draftsRes.success && draftsRes.campaignDraft) {
        setDrafts(draftsRes.campaignDraft.drafts);
      }
    });
  };

  const handleCopyDraft = (draft: SocialPlatformDraft) => {
    const text = `${draft.headline}\n\n${draft.caption}\n\nCTA: ${draft.cta}\n\n${draft.hashtags.join(" ")}`;
    navigator.clipboard.writeText(text);
    setCopiedDraftId(draft.id);
    setTimeout(() => setCopiedDraftId(null), 2500);
  };

  const handleSaveSocialPost = async (draft: SocialPlatformDraft) => {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("title", draft.headline);
      fd.set("caption", draft.caption);
      fd.set("contentType", draft.placement === "story" ? "story" : draft.placement === "reel" ? "reel" : "post");
      fd.set("platforms", draft.platform);
      fd.set("mediaUrl", draft.mediaUrl);
      fd.set("status", "draft");

      await createSocialPostAction(fd);
      setSavedDraftIds((prev) => new Set(prev).add(draft.id));
    });
  };

  const isVideo = selectedFile?.type.startsWith("video/");
  const analysisStatus = uploadedAsset?.analysisResult.analysis_status;

  return (
    <div className="space-y-8">
      {/* Upload Header & Dropzone */}
      <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/40 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Upload className="h-5 w-5 text-violet-500" />
              Medya Yükleme & Gerçek Multimodal Görsel Analizi
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Fotoğraf yükleyin. Google Gemini Multimodal Vision API görüntünün gerçek piksellerini analiz etsin; SEO, GEO ve yerel arama niyetine uygun yayın taslakları hazırlansın.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 px-3 py-1.5 rounded-full">
            <CheckCircle2 className="h-4 w-4" />
            <span>Sıfır Sahte Fallback — Gerçek Görsel Analizi</span>
          </div>
        </div>

        {/* Dropzone */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 dark:border-white/15 rounded-xl p-8 hover:border-violet-500 transition text-center cursor-pointer relative bg-slate-50/50 dark:bg-white/[0.02]">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
              onChange={handleFileChange}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
            {previewUrl ? (
              <div className="w-full flex flex-col items-center gap-3">
                {isVideo ? (
                  <video src={previewUrl} controls className="max-h-56 rounded-lg shadow-sm border border-slate-200 dark:border-white/10" />
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={previewUrl} alt="Seçilen Medya" className="max-h-56 rounded-lg object-contain shadow-sm border border-slate-200 dark:border-white/10" />
                )}
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {selectedFile?.name} ({(selectedFile ? selectedFile.size / (1024 * 1024) : 0).toFixed(2)} MB)
                </div>
                <span className="text-[11px] text-violet-600 dark:text-violet-400 underline">Farklı dosya seçmek için tıklayın</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="p-3 bg-violet-100 dark:bg-violet-900/40 rounded-full text-violet-600 dark:text-violet-400">
                  <Upload className="h-6 w-6" />
                </div>
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Fotoğraf veya video seçin veya buraya sürükleyin
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Desteklenenler: JPG, PNG, WebP (maks 10MB) &bull; MP4, MOV (maks 100MB)
                </span>
              </div>
            )}
          </div>

          {/* Action & Status Card */}
          <div className="flex flex-col justify-between border border-slate-200 dark:border-white/10 rounded-xl p-6 bg-slate-50/40 dark:bg-white/[0.01]">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-violet-500" />
                Doğrulanmış Multimodal Analiz Süreci
              </h3>
              <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-2">
                <li className="flex items-start gap-2">
                  <span className="font-bold text-violet-600 dark:text-violet-400">1.</span>
                  Görselin ham ikili verisi (base64) resmî Gemini Vision modeline iletilir.
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-violet-600 dark:text-violet-400">2.</span>
                  Pikseller taranarak görünen nesneler, mimari detaylar ve renkler tespit edilir; dosya adı kesinlikle ürün adı olarak kabul edilmez.
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-violet-600 dark:text-violet-400">3.</span>
                  SEO, GEO ve yerel müşteri arama niyetine uygun, her platforma özgün ve en fazla 5 hashtag içeren taslaklar üretilir.
                </li>
              </ul>

              {errorMsg && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {successMsg && (
                <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}
            </div>

            <div className="space-y-2 mt-4">
              <button
                type="button"
                onClick={() => handleUploadAndAnalyze(false)}
                disabled={!selectedFile || isPending}
                className={cn(
                  "w-full py-2.5 px-4 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer shadow-sm",
                  !selectedFile || isPending
                    ? "bg-slate-200 dark:bg-white/10 text-slate-400 cursor-not-allowed"
                    : "bg-violet-600 hover:bg-violet-700 text-white"
                )}
              >
                <Sparkles className="h-4 w-4" />
                <span>{isPending ? "Analiz Ediliyor & Taslaklar Hazırlanıyor..." : "Görseli Yükle ve Gemini ile Analiz Et"}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowManualForm(!showManualForm)}
                className="w-full text-center text-xs text-slate-600 dark:text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 flex items-center justify-center gap-1.5 py-1"
              >
                <Edit3 className="h-3.5 w-3.5" />
                <span>{showManualForm ? "Manuel Bilgi Formunu Gizle" : "Manuel Ürün Bilgisi Ekle veya Düzelt"}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Manual Input Form */}
        {showManualForm && (
          <div className="mt-6 p-4 rounded-xl border border-violet-200 dark:border-violet-900/60 bg-violet-50/50 dark:bg-violet-950/20 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-violet-900 dark:text-violet-300 flex items-center gap-1.5">
                <Edit3 className="h-4 w-4" />
                Doğrulanmış Ürün ve Bölge Bilgisi (Kota aşımında veya video için zorunlu)
              </h4>
              <span className="text-[11px] text-violet-700 dark:text-violet-400">
                Uydurma metin yerine sizin girdiğiniz gerçek ürün bilgileri temel alınır.
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Ürün Adı / Modeli</label>
                <input
                  type="text"
                  placeholder="örn: 3x7m Yaşam Konteyneri"
                  value={manualProduct}
                  onChange={(e) => setManualProduct(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-white/10 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Kategori</label>
                <input
                  type="text"
                  placeholder="örn: Konteyner Ev / Şantiye Ofisi"
                  value={manualCategory}
                  onChange={(e) => setManualCategory(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-white/10 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Belirgin Özellikler (Virgülle)</label>
                <input
                  type="text"
                  placeholder="örn: Çift cam, Sandviç panel, Ahşap desen"
                  value={manualFeatures}
                  onChange={(e) => setManualFeatures(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-white/10 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Hedef Şehir / Bölge</label>
                <input
                  type="text"
                  placeholder="örn: İstanbul, Kocaeli, Bursa"
                  value={manualTargetCity}
                  onChange={(e) => setManualTargetCity(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-white/10 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            {uploadedAsset && (
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleRetryWithManual}
                  disabled={isPending}
                  className="py-1.5 px-4 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold flex items-center gap-1.5"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", isPending && "animate-spin")} />
                  <span>Bilgileri Güncelle ve Taslakları Yeniden Üret</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Uploaded Asset Analysis Card */}
      {uploadedAsset && (
        <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/40 p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-200 dark:border-white/10 pb-4 mb-4 gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-900 dark:text-white">Görsel Analiz Çıktısı:</span>
              <span className="text-xs font-semibold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/40 px-2.5 py-0.5 rounded-full border border-violet-200 dark:border-violet-800">
                {uploadedAsset.analysisResult.product_category || uploadedAsset.analysisResult.primarySubject || "Modüler Yapı"}
              </span>
            </div>

            {/* Status Badges */}
            <div className="flex items-center gap-2">
              {analysisStatus === "ANALYZED" ? (
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 px-3 py-1 rounded-full flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  ANALYZED &bull; Gerçek Görsel Analizi Doğrulandı
                </span>
              ) : analysisStatus === "RATE_LIMITED" ? (
                <span className="text-xs font-bold text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40 border border-orange-300 dark:border-orange-800 px-3 py-1 rounded-full flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  RATE_LIMITED &bull; Gemini Kotası Aşıldı (429)
                </span>
              ) : analysisStatus === "PROVIDER_UNAVAILABLE" ? (
                <span className="text-xs font-bold text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 px-3 py-1 rounded-full flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  PROVIDER_UNAVAILABLE &bull; Yapılandırma Eksik
                </span>
              ) : analysisStatus === "NEEDS_INPUT" ? (
                <span className="text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 px-3 py-1 rounded-full flex items-center gap-1.5">
                  <Edit3 className="h-3.5 w-3.5" />
                  NEEDS_INPUT &bull; Manuel Bilgi Bekleniyor
                </span>
              ) : (
                <span className="text-xs font-bold text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 px-3 py-1 rounded-full flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  FAILED &bull; Analiz Başarısız
                </span>
              )}
            </div>
          </div>

          {/* Fallback Warning Box */}
          {uploadedAsset.analysisResult.isFallback && uploadedAsset.analysisResult.fallbackReason && (
            <div className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="font-semibold">Gerçek Görsel Analizi Yapılamadı — Sahte Fallback Engellendi</p>
                <p className="mt-0.5 text-amber-700 dark:text-amber-400">{uploadedAsset.analysisResult.fallbackReason}</p>
                <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-500">
                  Sistem dosya adını ürün olarak uydurmaz. Lütfen yukarıdaki &quot;Manuel Ürün Bilgisi Ekle&quot; formunu doldurarak gerçek ürün özellikleriyle taslak üretin.
                </p>
              </div>
            </div>
          )}

          {/* Visual Details Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/10">
              <span className="font-semibold text-slate-500 dark:text-slate-400 block mb-1">Görsel Tasviri:</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {uploadedAsset.analysisResult.visual_description || "Görsel analizi mevcut değil."}
              </span>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/10">
              <span className="font-semibold text-slate-500 dark:text-slate-400 block mb-1">Tespit Edilen Nesneler:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {uploadedAsset.analysisResult.detected_objects.length > 0 ? (
                  uploadedAsset.analysisResult.detected_objects.map((obj, i) => (
                    <span key={i} className="px-2 py-0.5 rounded bg-slate-200 dark:bg-white/10 text-[10px] font-medium text-slate-800 dark:text-slate-200">
                      {obj}
                    </span>
                  ))
                ) : (
                  <span className="text-slate-400 italic">Nesne tespit edilmedi</span>
                )}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/10">
              <span className="font-semibold text-slate-500 dark:text-slate-400 block mb-1">Görsel Özellikler:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {uploadedAsset.analysisResult.visible_features.length > 0 ? (
                  uploadedAsset.analysisResult.visible_features.map((feat, i) => (
                    <span key={i} className="px-2 py-0.5 rounded bg-violet-100 dark:bg-violet-950/40 text-[10px] font-medium text-violet-800 dark:text-violet-300">
                      {feat}
                    </span>
                  ))
                ) : (
                  <span className="text-slate-400 italic">Görsel özellik yok</span>
                )}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/10">
              <span className="font-semibold text-slate-500 dark:text-slate-400 block mb-1">Doğrulanamayan İddialar:</span>
              <div className="text-[11px] text-slate-600 dark:text-slate-400 space-y-0.5">
                {uploadedAsset.analysisResult.unknown_or_unverified_details.length > 0 ? (
                  uploadedAsset.analysisResult.unknown_or_unverified_details.map((note, i) => (
                    <div key={i} className="text-[10px] text-slate-500">&bull; {note}</div>
                  ))
                ) : (
                  <span>Tüm iddialar görselle tutarlı.</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Generated Platform Drafts Grid */}
      {drafts.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Layers className="h-5 w-5 text-violet-500" />
                SEO & GEO Uyumlu Platform Taslakları ({drafts.length} Taslak)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Her platform için bağımsız arama niyeti, anahtar kelimeler, yerel hedefleme ve en fazla 5 hashtag ile üretilmiştir.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {drafts.map((draft) => {
              const isSaved = savedDraftIds.has(draft.id);
              const isCopied = copiedDraftId === draft.id;

              return (
                <div
                  key={draft.id}
                  className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/40 p-5 shadow-sm flex flex-col justify-between space-y-4 hover:border-violet-400/60 transition"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800/80">
                        {draft.platform} &bull; {draft.placement}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyDraft(draft)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 dark:text-slate-400 transition"
                        title="Metni Kopyala"
                      >
                        {isCopied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                      </button>
                    </div>

                    {/* SEO/GEO Badges */}
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                      {draft.primaryKeyword && (
                        <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 flex items-center gap-1">
                          <Key className="h-3 w-3" />
                          {draft.primaryKeyword}
                        </span>
                      )}
                      {draft.targetRegions.length > 0 && (
                        <span className="px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {draft.targetRegions[0]}
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-400">
                        Niyet: {draft.searchIntent}
                      </span>
                    </div>

                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white line-clamp-1">{draft.headline}</h4>
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium mt-0.5 italic">
                        &ldquo;{draft.hook}&rdquo;
                      </p>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap max-h-36 overflow-y-auto">
                      {draft.caption}
                    </div>

                    <div className="text-[11px] font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">CTA:</span>
                      <span className="line-clamp-1">{draft.cta}</span>
                    </div>

                    {draft.hashtags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {draft.hashtags.map((tag, idx) => (
                          <span key={idx} className="text-[10px] text-violet-600 dark:text-violet-400 font-medium">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Unverified Claims Warning */}
                    {draft.unverifiedClaimsWarning && (
                      <div className="p-2 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-[10px] text-amber-800 dark:text-amber-300 flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                        <span>{draft.unverifiedClaimsWarning}</span>
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-200 dark:border-white/10 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      disabled={isSaved || isPending}
                      onClick={() => handleSaveSocialPost(draft)}
                      className={cn(
                        "w-full py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer",
                        isSaved
                          ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700"
                          : "bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90"
                      )}
                    >
                      {isSaved ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          <span>Taslak Havuzuna Kaydedildi</span>
                        </>
                      ) : (
                        <>
                          <Send className="h-3.5 w-3.5" />
                          <span>Taslağı Kaydet</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
