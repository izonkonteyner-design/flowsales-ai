"use client";

import Link from "next/link";
import { ArrowLeft, Download, Printer } from "lucide-react";

type QuoteDocumentToolbarProps = {
  quoteId: string;
  pdfHref: string;
  backHref: string;
};

export function QuoteDocumentToolbar({ quoteId, pdfHref, backHref }: QuoteDocumentToolbarProps) {
  return (
    <div className="print-page-toolbar print:hidden">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Quote preview</p>
          <p className="mt-1 text-sm text-slate-500">Screen preview, browser print, and server PDF all share the same quote snapshot.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={backHref}
            className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-10 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
          <Link
            href={pdfHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <Download className="h-4 w-4" />
            Download PDF
          </Link>
        </div>
      </div>
      <div className="sr-only">
        <p>Quote {quoteId}</p>
      </div>
    </div>
  );
}
