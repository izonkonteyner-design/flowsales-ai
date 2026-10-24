"use client";

import Link from "next/link";
import { ArrowLeft, Download, Printer } from "lucide-react";

import { getClientLocale, t, type Locale } from "@/lib/i18n";

type QuoteDocumentToolbarProps = {
  quoteId: string;
  pdfHref: string;
  backHref: string;
  locale?: Locale;
};

export function QuoteDocumentToolbar({ quoteId, pdfHref, backHref, locale }: QuoteDocumentToolbarProps) {
  const activeLocale = locale ?? getClientLocale();

  return (
    <div className="print-page-toolbar print:hidden">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900/90">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
            {t(activeLocale, "quotePreview")}
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t(activeLocale, "quotePreviewDesc")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={backHref}
            className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <ArrowLeft className="h-4 w-4" />
            {t(activeLocale, "back")}
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-10 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
          >
            <Printer className="h-4 w-4" />
            {t(activeLocale, "print")}
          </button>
          <Link
            href={pdfHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <Download className="h-4 w-4" />
            {t(activeLocale, "downloadPdf")}
          </Link>
        </div>
      </div>
      <div className="sr-only">
        <p>Quote {quoteId}</p>
      </div>
    </div>
  );
}
