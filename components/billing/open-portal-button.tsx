"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ExternalLink } from "lucide-react";

export function OpenPortalButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        throw new Error(data?.error || "Failed to open billing portal.");
      }
      router.push(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open billing portal.");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:text-white dark:hover:bg-white/5"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
        Manage subscription in Stripe portal
      </button>
      {error && <p className="text-xs text-rose-500">{error}</p>}
    </div>
  );
}
