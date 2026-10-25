"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  QrCode,
  RefreshCw,
  Smartphone,
  X,
  Zap,
} from "lucide-react";
import Image from "next/image";

type TikTokQrModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (displayName?: string) => void;
};

type QrState =
  | { type: "idle" }
  | { type: "loading" }
  | {
      type: "active";
      qrSessionId: string;
      qrCodeDataUrl: string;
      expiresAt: string;
      pollStatus: "waiting" | "scanned";
      statusMessage: string;
    }
  | { type: "confirmed"; displayName: string }
  | { type: "expired"; message: string }
  | {
      type: "unavailable";
      message: string;
    }
  | { type: "error"; message: string };

export function TikTokQrModal({ isOpen, onClose, onSuccess }: TikTokQrModalProps) {
  const [state, setState] = useState<QrState>({ type: "idle" });
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const handleCancel = useCallback(async () => {
    stopPolling();
    const currentSessionId = activeSessionIdRef.current;
    if (currentSessionId) {
      activeSessionIdRef.current = null;
      try {
        await fetch("/api/integrations/tiktok/qr/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ qrSessionId: currentSessionId }),
        });
      } catch {
        // Ignore cancellation failure
      }
    }
    onClose();
  }, [stopPolling, onClose]);

  const pollStatus = useCallback(
    async (sessionId: string) => {
      try {
        const res = await fetch("/api/integrations/tiktok/qr/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ qrSessionId: sessionId }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          stopPolling();
          setState({
            type: "error",
            message: errData.message || "Yetkilendirme durumu kontrol edilirken hata oluştu.",
          });
          return;
        }

        const data = (await res.json()) as {
          status: "waiting" | "scanned" | "confirmed" | "expired" | "error" | "invalid";
          displayName?: string;
          message: string;
        };

        if (data.status === "confirmed") {
          stopPolling();
          setState({ type: "confirmed", displayName: data.displayName || "TikTok Hesabı" });
          setTimeout(() => {
            onSuccess(data.displayName);
          }, 1500);
        } else if (data.status === "expired" || data.status === "invalid") {
          stopPolling();
          setState({
            type: "expired",
            message: data.message || "QR kodun süresi doldu.",
          });
        } else if (data.status === "scanned") {
          setState((prev) =>
            prev.type === "active"
              ? {
                  ...prev,
                  pollStatus: "scanned",
                  statusMessage: data.message || "QR kod tarandı. Telefonunuzda onaylayın.",
                }
              : prev,
          );
        } else if (data.status === "waiting") {
          setState((prev) =>
            prev.type === "active"
              ? {
                  ...prev,
                  pollStatus: "waiting",
                  statusMessage: data.message || "TikTok mobil uygulamasıyla tarayın.",
                }
              : prev,
          );
        }
      } catch (err) {
        // Network blip, keep polling
        console.warn("TikTok QR poll warning:", err);
      }
    },
    [stopPolling, onSuccess],
  );

  const startQrSession = useCallback(async () => {
    stopPolling();
    setState({ type: "loading" });

    try {
      const res = await fetch("/api/integrations/tiktok/qr/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        if (data.error === "qr_unavailable" || data.error === "configuration_required") {
          setState({
            type: "unavailable",
            message:
              data.message ||
              "TikTok Login Kit with QR Code servisi bu uygulama için henüz aktif değil veya inceleme aşamasında. Lütfen standart OAuth yöntemini kullanın.",
          });
        } else {
          setState({
            type: "error",
            message: data.message || "QR kod oluşturulamadı. Lütfen tekrar deneyin.",
          });
        }
        return;
      }

      activeSessionIdRef.current = data.qrSessionId;
      setState({
        type: "active",
        qrSessionId: data.qrSessionId,
        qrCodeDataUrl: data.qrCodeDataUrl,
        expiresAt: data.expiresAt,
        pollStatus: "waiting",
        statusMessage: "TikTok mobil uygulamasını açın ve QR kodu tarayın.",
      });

      // Start polling every 2.5 seconds (TikTok rate limit compliant)
      pollingRef.current = setInterval(() => {
        pollStatus(data.qrSessionId);
      }, 2500);
    } catch (err) {
      setState({
        type: "error",
        message: err instanceof Error ? err.message : "Ağ bağlantısı kurulamadı.",
      });
    }
  }, [stopPolling, pollStatus]);

  useEffect(() => {
    if (!isOpen) {
      stopPolling();
      activeSessionIdRef.current = null;
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) {
        startQrSession();
      }
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      stopPolling();
    };
  }, [isOpen, startQrSession, stopPolling]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tiktok-qr-title"
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-black text-white dark:bg-white dark:text-black">
              <QrCode className="h-5 w-5" />
            </div>
            <div>
              <h2 id="tiktok-qr-title" className="text-base font-bold text-slate-950 dark:text-white">
                TikTok QR Kod ile Bağlan
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Official TikTok QR Code Authorization
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            aria-label="Kapat"
            className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/5 dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="my-6 flex flex-col items-center justify-center text-center">
          {state.type === "loading" && (
            <div className="flex flex-col items-center gap-3 py-12">
              <Loader2 className="h-10 w-10 animate-spin text-slate-900 dark:text-white" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Resmi TikTok QR kodu oluşturuluyor...
              </p>
              <p className="text-xs text-slate-500">TikTok Login Kit v2 API çağrısı yapılıyor</p>
            </div>
          )}

          {state.type === "active" && (
            <div className="flex flex-col items-center gap-4">
              <div className="relative rounded-2xl border-2 border-slate-100 bg-white p-3 shadow-inner dark:border-white/10">
                <Image
                  src={state.qrCodeDataUrl}
                  alt="TikTok Yetkilendirme QR Kodu"
                  width={240}
                  height={240}
                  className="rounded-xl"
                  unoptimized
                />
                {state.pollStatus === "scanned" && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-slate-950/80 p-4 text-white backdrop-blur-xs">
                    <Loader2 className="mb-2 h-8 w-8 animate-spin text-white" />
                    <p className="text-xs font-semibold">QR Kod Tarandı!</p>
                    <p className="text-[11px] text-slate-300">Lütfen telefonunuzda onaylayın</p>
                  </div>
                )}
              </div>

              {/* Status pill */}
              <div className="flex items-center gap-2 rounded-full bg-slate-100 px-3.5 py-1 text-xs font-medium text-slate-700 dark:bg-white/10 dark:text-slate-300">
                {state.pollStatus === "scanned" ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600 dark:text-blue-400" />
                    <span>Onay bekleniyor (Awaiting confirmation)...</span>
                  </>
                ) : (
                  <>
                    <Clock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                    <span>Tarama bekleniyor (Waiting for scan)...</span>
                  </>
                )}
              </div>

              {/* Instructions */}
              <div className="w-full rounded-2xl border border-slate-200/70 bg-slate-50/70 p-3.5 text-left dark:border-white/5 dark:bg-white/5">
                <div className="flex items-start gap-2.5">
                  <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-slate-700 dark:text-slate-300" />
                  <div className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                    <p className="font-semibold text-slate-900 dark:text-white">Nasıl Taranır?</p>
                    <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-[11px]">
                      <li>TikTok uygulamasını açın ve profilinize gidin.</li>
                      <li>Sağ üst köşedeki menüye (☰) dokunun.</li>
                      <li><strong>QR Kodu</strong> veya <strong>Tara</strong> seçeneği ile bu kodu okutun.</li>
                      <li>Ekrandaki onay butonuna dokunun.</li>
                    </ol>
                  </div>
                </div>
              </div>
            </div>
          )}

          {state.type === "confirmed" && (
            <div className="flex flex-col items-center gap-3 py-8 text-center animate-in zoom-in-95 duration-200">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                <CheckCircle2 className="h-10 w-10" />
              </div>
              <h3 className="text-lg font-bold text-slate-950 dark:text-white">Bağlantı Başarılı!</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                <span className="font-semibold text-slate-900 dark:text-white">
                  {state.displayName}
                </span>{" "}
                hesabı FlowSales AI CRM&apos;e başarıyla bağlandı.
              </p>
              <p className="text-xs text-slate-500">Sayfa güncelleniyor...</p>
            </div>
          )}

          {state.type === "expired" && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
                <Clock className="h-8 w-8" />
              </div>
              <h3 className="text-base font-semibold text-slate-950 dark:text-white">
                QR Kodunun Süresi Doldu
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">{state.message}</p>
              <button
                type="button"
                onClick={startQrSession}
                className="mt-2 inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Yeni QR Kod Oluştur
              </button>
            </div>
          )}

          {state.type === "unavailable" && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
                <AlertCircle className="h-8 w-8" />
              </div>
              <h3 className="text-base font-semibold text-slate-950 dark:text-white">
                Resmi QR Yetkilendirme Bildirimi
              </h3>
              <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                {state.message}
              </p>
              <div className="mt-3 flex w-full flex-col gap-2">
                <a
                  href="/api/integrations/tiktok/connect"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
                >
                  <Zap className="h-4 w-4" />
                  Standart TikTok ile Bağlan (OAuth)
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          )}

          {state.type === "error" && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
                <AlertCircle className="h-8 w-8" />
              </div>
              <h3 className="text-base font-semibold text-slate-950 dark:text-white">Bağlantı Hatası</h3>
              <p className="text-xs text-rose-600 dark:text-rose-400">{state.message}</p>
              <button
                type="button"
                onClick={startQrSession}
                className="mt-2 inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Tekrar Dene
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-4 dark:border-white/10">
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Powered by TikTok Login Kit v2
          </p>
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-xl px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5"
          >
            Vazgeç
          </button>
        </div>
      </div>
    </div>
  );
}
