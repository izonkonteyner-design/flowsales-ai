import Link from "next/link";

import { BRAND } from "@/lib/constants";

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.18),transparent_24%),linear-gradient(to_bottom,#f8fafc,#eef2ff_45%,#f8fafc)] px-4 py-8 dark:bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.18),transparent_24%),linear-gradient(to_bottom,#020617,#0f172a_45%,#020617)]">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center justify-center">
        <div className="grid w-full gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-slate-950/80">
            <Link href="/" className="inline-flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white dark:bg-white dark:text-slate-950">
                <span className="text-sm font-semibold">FS</span>
              </div>
              <div>
                <p className="font-semibold text-slate-950 dark:text-white">{BRAND.name}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{BRAND.tagline}</p>
              </div>
            </Link>

            <div className="mt-10 space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Secure workspace access</p>
              <h1 className="text-4xl font-semibold tracking-tight text-slate-950 dark:text-white">
                Manage your pipeline with one AI-powered sales workspace.
              </h1>
              <p className="text-sm leading-6 text-slate-600 dark:text-slate-400">
                Sign in to access leads, quotes, tasks, reporting, and company settings with tenant-safe access controls.
              </p>
            </div>

            <div className="mt-10 grid gap-3 sm:grid-cols-2">
              <Feature>Protected routes</Feature>
              <Feature>Role-based access</Feature>
              <Feature>AI-assisted workflows</Feature>
              <Feature>Secure Supabase boundary</Feature>
            </div>
          </section>

          <section className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-slate-950/80">
            {children}
          </section>
        </div>
      </div>
    </main>
  );
}

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
      {children}
    </div>
  );
}
