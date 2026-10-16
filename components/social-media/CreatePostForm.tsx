"use client";

import { useState } from "react";

export function CreatePostForm({ disabled }: { disabled: boolean }) {
  const [content, setContent] = useState("");
  const [mediaUrls, setMediaUrls] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    const body: {
      account_id?: string | null;
      platform: string;
      status: "draft" | "scheduled";
      content: string;
      media_urls: string[];
      scheduled_at?: string | null;
    } = {
      platform: "instagram",
      status: scheduledAt ? "scheduled" : "draft",
      content: content.trim(),
      media_urls: mediaUrls
        .split(",")
        .map((u) => u.trim())
        .filter(Boolean),
    };
    if (scheduledAt) body.scheduled_at = scheduledAt;

    try {
      const res = await fetch("/api/social-media/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Gönderi oluşturulamadı.");
        return;
      }
      setSuccess(true);
      setContent("");
      setMediaUrls("");
      setScheduledAt("");
    } catch {
      setError("İstek sırasında bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-slate-600 dark:text-slate-300 uppercase tracking-wider">
          İçerik
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Gönderi metnini yazın…"
          rows={3}
          disabled={disabled}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-950 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-white/10 dark:bg-white/5 dark:text-white disabled:bg-slate-50 dark:disabled:bg-slate-900/30"
        />
        {content.length > 2200 && (
          <span className="text-xs text-rose-500 dark:text-rose-400">Maksimum 2200 karakter.</span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300 uppercase tracking-wider">
            Medya URL&rsquo;leri (virgülle ayrılmış)
          </label>
          <input
            value={mediaUrls}
            onChange={(e) => setMediaUrls(e.target.value)}
            placeholder="https://örnek.com/gorsel.jpg"
            disabled={disabled}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-950 dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300 uppercase tracking-wider">
            Yayın tarihi (boşsa taslak)
          </label>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            disabled={disabled}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-950 dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
        </div>
      </div>

      {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      {success && (
        <p className="text-sm text-green-600 dark:text-green-400">
          Gönderi oluşturuldu.
        </p>
      )}

      <button
        type="submit"
        disabled={disabled || loading || !content.trim()}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 dark:border-white/10 dark:bg-white dark:text-slate-950 dark:hover:bg-white/10 disabled:opacity-50 disabled:pointer-events-none"
      >
        {loading ? "Oluşturuluyor…" : disabled ? "Paket kapalı" : "Gönderi Oluştur"}
      </button>
    </form>
  );
}
