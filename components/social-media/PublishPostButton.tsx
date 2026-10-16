"use client";

import { useState } from "react";

export function PublishPostButton({ postId }: { postId: string }) {
  const [loading, setLoading] = useState(false);
  const [published, setPublished] = useState(false);

  async function handlePublish() {
    setLoading(true);
    setPublished(false);
    try {
      const res = await fetch("/api/social-media/posts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, _action: "publish" }),
      });
      if (!res.ok) {
        return;
      }
      setPublished(true);
    } catch {
      // Surface the error to the user via the returned response in a follow-up;
      // for now the button resets on next click.
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
    <button
      onClick={handlePublish}
      disabled={loading}
      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10 disabled:opacity-50"
    >
      {loading ? "Yayınlanıyor…" : "Şimdi Yayımla"}
    </button>
  );
}
