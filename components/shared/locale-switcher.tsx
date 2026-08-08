"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";

import type { Locale } from "@/lib/i18n";

export function LocaleSwitcher({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function setLocale(nextLocale: Locale) {
    if (nextLocale === locale || pending) return;
    setPending(true);
    try {
      const response = await fetch("/api/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: nextLocale }),
      });
      if (!response.ok) throw new Error("Locale update failed");
      document.documentElement.lang = nextLocale;
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="inline-flex h-10 items-center rounded-2xl border border-white/[0.08] bg-white/[0.035] p-1" aria-label={locale === "tr" ? "Dil seçimi" : "Language selector"}>
      <Languages className="mx-2 h-4 w-4 text-slate-500" />
      {(["tr", "en"] as const).map((value) => (
        <button
          key={value}
          type="button"
          disabled={pending}
          onClick={() => void setLocale(value)}
          className={`rounded-xl px-2.5 py-1 text-xs font-semibold transition disabled:opacity-50 ${locale === value ? "bg-white text-slate-950" : "text-slate-400 hover:text-white"}`}
          aria-pressed={locale === value}
        >
          {value === "tr" ? "TR" : "EN"}
        </button>
      ))}
    </div>
  );
}
