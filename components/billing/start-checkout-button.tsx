"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CreditCard } from "lucide-react";

import { cn } from "@/lib/utils";

type StartCheckoutButtonProps = {
  plan: "starter" | "pro" | "business";
  seats: number;
};

export function StartCheckoutButton({ plan, seats }: StartCheckoutButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, seats }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        throw new Error(data?.error || "Checkout failed.");
      }
      router.push(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed.");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className={cn(
          "inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100",
        )}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
        Subscribe to {plan}
      </button>
      {error && <p className="text-xs text-rose-500">{error}</p>}
    </div>
  );
}
