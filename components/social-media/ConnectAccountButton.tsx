"use client";

import { useState } from "react";
import {
  getProvider,
  isSocialMediaError,
} from "@/lib/social-media/registry";
import type { SocialPlatform } from "@/types/social-media";

export function ConnectAccountButton({
  platform,
  disabled,
}: {
  platform: string;
  disabled: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");

  async function handleConnect() {
    if (disabled) return;
    setLoading(true);
    setError(null);
    try {
      const provider = getProvider(platform as SocialPlatform);
      const redirectUri = `${window.location.origin}/api/social-media/accounts`;
      const state = crypto.randomUUID?.() ?? "state";
      const url = provider.authorizeUrl(state, redirectUri);
      window.open(url, "_blank");
      setError(
        "OAuth penceresi açıldı. İzin verdikten sonra, servis size dönen kodu yapıştırın:",
      );
    } catch (error) {
      setError(
        isSocialMediaError(error)
          ? error.message
          : "Bağlantı başlatılamadı.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleManualConnect() {
    if (!manualCode.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/social-media/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          code: manualCode.trim(),
          redirect_uri: `${window.location.origin}/api/social-media/accounts`,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Hesap bağlanamadı.");
        return;
      }
      // Reload so the new account appears in the list.
      window.location.reload();
    } catch {
      setError("İstek sırasında bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
      <button
        onClick={handleConnect}
        disabled={disabled || loading}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10 disabled:opacity-50 disabled:pointer-events-none"
      >
        {loading ? "Açılıyor…" : "Instagram Bağla"}
      </button>

      {error && <p className="text-sm text-slate-600 dark:text-slate-400">{error}</p>}

      {!disabled && !loading && manualCode === "" && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Kimlik bilgileriniz yoksa Yayınlama çalışmaz (sahte başarı gösterilmez).
        </p>
      )}

      {!disabled && !loading && error && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500 dark:text-slate-400">OAuth kodu:</label>
          <input
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder="code..."
            className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
          <button
            onClick={handleManualConnect}
            disabled={loading}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10 disabled:opacity-50"
          >
            Bağla
          </button>
        </div>
      )}
    </div>
  );
}
