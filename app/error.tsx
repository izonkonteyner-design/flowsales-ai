"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, Home } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl items-center px-6">
      <div className="space-y-6 rounded-[2rem] border border-slate-200 bg-white p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-slate-950/80">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-600 dark:text-rose-300">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-3xl font-semibold text-slate-950 dark:text-white">Something went wrong</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            The application encountered an unexpected error. You can retry or return to the dashboard.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={reset}
            className="inline-flex h-10 items-center rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white dark:bg-white dark:text-slate-950"
          >
            Retry
          </button>
          <Link
            href="/dashboard"
            className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 px-4 text-sm font-medium text-slate-700 dark:border-white/10 dark:text-slate-300"
          >
            <Home className="h-4 w-4" />
            Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
