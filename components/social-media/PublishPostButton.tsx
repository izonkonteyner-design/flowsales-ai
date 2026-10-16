"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PublishPostButton({ postId }: { postId: string }) {
  const [loading, setLoading] = useState(false);
  const [published, setPublished] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handlePublish() {
    if (loading || !window.confirm("Bu gönderi seçilen sosyal medya hesabında herkese açık olarak yayımlansın mı?")) return;
    setLoading(true);
    setError("");
    setPublished(false);
    try {
      const res = await fetch("/api/social-media/posts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, _action: "publish" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Yayınlama başarısız. Yeniden denemeden önce platform hesabını kontrol edin.");
        return;
      }
      setPublished(true);
      router.refresh();
    } catch {
      setError("Yayın sonucu doğrulanamadı. Yeniden denemeden önce platform hesabını kontrol edin.");
    } finally {
      setLoading(false);
    }
  }

  if (published) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border border-green-200 text-green-700 dark:border-green-800/50 dark:text-green-400">
        <span className="h-1.5 w-1.5 rounded-full bg-green-600" aria-hidden="true" />
        Yayınlandı
      </span>
    );
  }

  return (
    <div><button
      onClick={handlePublish}
      disabled={loading}
      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10 disabled:opacity-50"
    >
      {loading ? "Yayınlanıyor…" : "Şimdi Yayımla"}
    </button>{error ? <p role="alert" className="mt-2 max-w-xs text-sm text-rose-300">{error}</p> : null}</div>
  );
}
