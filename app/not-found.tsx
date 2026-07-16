import Link from "next/link";
import { SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl items-center px-6">
      <div className="space-y-6 rounded-[2rem] border border-slate-200 bg-white p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-slate-950/80">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-white">
          <SearchX className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-3xl font-semibold text-slate-950 dark:text-white">Page not found</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            The page you requested does not exist or may have been moved.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex h-10 items-center rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white dark:bg-white dark:text-slate-950"
        >
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
