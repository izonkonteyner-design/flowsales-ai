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
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  uploadMarketingMediaAction,
  generateMultiplatformSocialDraftsAction,
  createSocialPostAction,
} from "@/app/(app)/social/actions";
import type { MarketingMediaAsset } from "@/server/services/media/domain";
import type { SocialPlatformDraft } from "@/server/services/social/engine";

export function MediaUploadStudioTab() {
  const [isPending, startTransition] = useTransition();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [uploadedAsset, setUploadedAsset] = useState<MarketingMediaAsset | null>(null);
  const [drafts, setDrafts] = useState<SocialPlatformDraft[]>([]);
  const [copiedDraftId, setCopiedDraftId] = useState<string | null>(null);
  const [savedDraftIds, setSavedDraftIds] = useState<Set<string>>(new Set());

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    // Client-side quick validation
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

  const handleUploadAndAnalyze = () => {
    if (!selectedFile) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    startTransition(async () => {
      const formData = new FormData();
      formData.set("file", selectedFile);

      const res = await uploadMarketingMediaAction(formData);
      if (!res.success || !res.asset) {
        setErrorMsg(res.error || "Medya yüklenemedi.");
        return;
      }

      setUploadedAsset(res.asset);
      setSuccessMsg("Medya başarıyla yüklendi ve yapay zeka analizi tamamlandı!");

      // Auto generate drafts for all platforms
      const draftsRes = await generateMultiplatformSocialDraftsAction({
        analysis: res.asset.analysisResult,
        mediaUrl: res.asset.publicUrl,
        language: "tr",
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

  return (
    <div className="space-y-8">
      {/* Upload Header & Dropzone */}
      <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/40 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Upload className="h-5 w-5 text-violet-500" />
              Medya Yükleme & Yapay Zeka İçerik Motoru
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Fotoğraf veya video yükleyin. Yapay zeka içeriği analiz edip Instagram, Facebook, YouTube ve Google Business için hazır yayın taslakları üretsin.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 px-3 py-1.5 rounded-full">
            <CheckCircle2 className="h-4 w-4" />
            <span>Sıfır Ücretli API — Güvenli Yerel Fallback</span>
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
                Analiz & Otomasyon Süreci
              </h3>
              <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-2">
                <li className="flex items-start gap-2">
                  <span className="font-bold text-violet-600 dark:text-violet-400">1.</span>
                  Medya güvenli workspace storage deposuna yüklenir.
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-violet-600 dark:text-violet-400">2.</span>
                  Görsel/video içeriği yapay zeka ile taranıp konusu ve teması belirlenir.
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-violet-600 dark:text-violet-400">3.</span>
                  9 farklı platform ve yerleşim için bağımsız kanca, metin ve CTA üretilir.
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

            <button
              type="button"
              onClick={handleUploadAndAnalyze}
              disabled={!selectedFile || isPending}
              className={cn(
                "w-full mt-6 py-2.5 px-4 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer shadow-sm",
                !selectedFile || isPending
                  ? "bg-slate-200 dark:bg-white/10 text-slate-400 cursor-not-allowed"
                  : "bg-violet-600 hover:bg-violet-700 text-white"
              )}
            >
              <Sparkles className="h-4 w-4" />
              <span>{isPending ? "Analiz Ediliyor & Taslaklar Hazırlanıyor..." : "Medyayı Yükle ve Tüm Platformlar İçin Taslak Üret"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Uploaded Asset Analysis Card */}
      {uploadedAsset && (
        <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/40 p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-4 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-900 dark:text-white">Medya Analiz Çıktısı:</span>
              <span className="text-xs font-semibold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/40 px-2.5 py-0.5 rounded-full border border-violet-200 dark:border-violet-800">
                {uploadedAsset.analysisResult.primarySubject}
              </span>
            </div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {uploadedAsset.analysisResult.isFallback ? (
                <span className="text-amber-600 dark:text-amber-400">Güvenli Bağlam (Fallback)</span>
              ) : (
                <span className="text-emerald-600 dark:text-emerald-400">Doğrulanmış Model Görsel Analizi</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/10">
              <span className="font-semibold text-slate-500 dark:text-slate-400 block mb-1">Ürün / Hizmet:</span>
              <span className="font-bold text-slate-800 dark:text-slate-200">{uploadedAsset.analysisResult.productOrService}</span>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/10">
              <span className="font-semibold text-slate-500 dark:text-slate-400 block mb-1">Hedef Kitle:</span>
              <span className="font-bold text-slate-800 dark:text-slate-200">{uploadedAsset.analysisResult.suggestedAudience}</span>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/10">
              <span className="font-semibold text-slate-500 dark:text-slate-400 block mb-1">Görsel Ton & Atmosfer:</span>
              <span className="font-bold text-slate-800 dark:text-slate-200">{uploadedAsset.analysisResult.visualTone}</span>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/10">
              <span className="font-semibold text-slate-500 dark:text-slate-400 block mb-1">Pazarlama Satış Açısı:</span>
              <span className="font-bold text-slate-800 dark:text-slate-200">{uploadedAsset.analysisResult.marketingAngle}</span>
            </div>
          </div>
        </div>
      )}

      {/* Generated Platform Drafts Grid */}
      {drafts.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Layers className="h-5 w-5 text-violet-500" />
              Platforma Özel Üretilen Yayın Taslakları ({drafts.length} Taslak)
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Her taslak bağımsız olarak incelenebilir, kopyalanabilir veya taslak havuzuna kaydedilebilir.
            </span>
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
                        {draft.hashtags.slice(0, 4).map((tag, idx) => (
                          <span key={idx} className="text-[10px] text-violet-600 dark:text-violet-400">
                            {tag}
                          </span>
                        ))}
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
