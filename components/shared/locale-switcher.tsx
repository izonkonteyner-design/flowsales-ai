"use client";

import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";

import { LOCALE_COOKIE, type Locale } from "@/lib/i18n";

export function LocaleSwitcher({ locale }: { locale: Locale }) {
  const router = useRouter();

  function setLocale(nextLocale: Locale) {
    document.cookie = `${LOCALE_COOKIE}=${nextLocale}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = nextLocale;
    router.refresh();
  }

  return (
    <div className="inline-flex h-10 items-center rounded-2xl border border-white/[0.08] bg-white/[0.035] p-1" aria-label={locale === "tr" ? "Dil seçimi" : "Language selector"}>
      <Languages className="mx-2 h-4 w-4 text-slate-500" />
      {(["tr", "en"] as const).map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => setLocale(value)}
          className={`rounded-xl px-2.5 py-1 text-xs font-semibold transition ${locale === value ? "bg-white text-slate-950" : "text-slate-400 hover:text-white"}`}
          aria-pressed={locale === value}
        >
          {value === "tr" ? "TR" : "EN"}
        </button>
      ))}
    </div>
  );
}
