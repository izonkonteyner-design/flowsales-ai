"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { AlertTriangle, Home } from "lucide-react";

import * as Sentry from "@sentry/nextjs";

import { LOCALE_COOKIE, normalizeLocale, t } from "@/lib/i18n";

function readLocale(): "tr" | "en" {
  if (typeof document === "undefined") return "tr";
  const match = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`));
  return normalizeLocale(match?.[1]);
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    Sentry.captureException(error);
  }, [error]);

  const locale = useMemo(readLocale, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl items-center px-6">
      <div className="space-y-6 rounded-[2rem] border border-border bg-card p-8 text-card-foreground shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/15 text-destructive">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-3xl font-semibold">{t(locale, "errorTitle")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t(locale, "errorDescription")}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={reset}
            className="inline-flex h-10 items-center rounded-2xl bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            {t(locale, "retry")}
          </button>
          <Link
            href="/dashboard"
            className="inline-flex h-10 items-center gap-2 rounded-2xl border border-border px-4 text-sm font-medium text-foreground"
          >
            <Home className="h-4 w-4" />
            {t(locale, "dashboard")}
          </Link>
        </div>
      </div>
    </main>
  );
}
