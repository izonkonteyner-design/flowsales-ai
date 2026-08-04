import Link from "next/link";
import { ArrowUpRight, Bot, CheckCircle2, ShieldCheck, Sparkles, TrendingUp } from "lucide-react";

import { BRAND } from "@/lib/constants";

export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050816] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_10%,rgba(124,58,237,.24),transparent_28%),radial-gradient(circle_at_88%_20%,rgba(14,165,233,.17),transparent_24%),linear-gradient(180deg,#050816_0%,#070b18_52%,#050816_100%)]" />
      <div className="pointer-events-none absolute -left-32 top-1/3 h-80 w-80 rounded-full bg-violet-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 bottom-0 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />

      <div className="relative mx-auto grid min-h-[calc(100vh-3rem)] max-w-7xl overflow-hidden rounded-[2.25rem] border border-white/[0.09] bg-white/[0.025] shadow-[0_35px_120px_rgba(0,0,0,.48)] backdrop-blur-xl lg:grid-cols-[1.15fr_0.85fr]">
        <section className="relative hidden overflow-hidden border-r border-white/[0.08] p-10 lg:flex lg:flex-col xl:p-14">
          <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(124,58,237,.13),transparent_42%,rgba(14,165,233,.08))]" />
          <div className="relative flex items-center justify-between">
            <Link href="/" className="inline-flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 via-blue-500 to-cyan-400 shadow-[0_0_38px_rgba(99,102,241,.35)]">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold tracking-tight">{BRAND.name}</p>
                <p className="text-xs text-slate-500">AI revenue workspace</p>
              </div>
            </Link>
            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">Production ready</span>
          </div>

          <div className="relative my-auto max-w-2xl py-14">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1.5 text-xs font-medium text-violet-200">
              <Bot className="h-3.5 w-3.5" /> AI-powered sales operations
            </div>
            <h1 className="max-w-xl text-5xl font-semibold tracking-[-0.045em] text-white xl:text-6xl">
              Turn every sales signal into the next best action.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-slate-400">
              Manage leads, quotes, approvals, revenue intelligence and AI-assisted follow-ups from one secure premium workspace.
            </p>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              <Feature icon={TrendingUp} label="Pipeline intelligence" value="Live" />
              <Feature icon={ShieldCheck} label="Tenant security" value="Protected" />
              <Feature icon={CheckCircle2} label="AI approvals" value="Controlled" />
            </div>

            <div className="mt-10 rounded-[1.75rem] border border-white/[0.08] bg-[#0b1020]/80 p-5 shadow-[0_24px_80px_rgba(0,0,0,.25)]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">Revenue command center</p>
                  <p className="mt-1 text-xs text-slate-500">Pipeline, quote performance and AI actions</p>
                </div>
                <ArrowUpRight className="h-4 w-4 text-cyan-300" />
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3">
                <MockMetric label="Pipeline" value="₺1.84M" />
                <MockMetric label="Win rate" value="31.8%" />
                <MockMetric label="AI actions" value="148" />
              </div>
              <div className="mt-5 flex h-28 items-end gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4">
                {[34, 48, 42, 66, 58, 82, 73, 94, 78, 100, 88, 112].map((height, index) => (
                  <div key={`${height}-${index}`} className="flex-1 rounded-t-md bg-gradient-to-t from-violet-500/35 to-cyan-300/85" style={{ height }} />
                ))}
              </div>
            </div>
          </div>

          <p className="relative text-xs text-slate-600">Secure by design · Role-based · Read-only demo protected</p>
        </section>

        <section className="flex items-center justify-center p-5 sm:p-8 lg:p-10 xl:p-14">
          <div className="w-full max-w-md">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-400"><Sparkles className="h-5 w-5" /></div>
              <div><p className="font-semibold">{BRAND.name}</p><p className="text-xs text-slate-500">AI revenue workspace</p></div>
            </div>
            <div className="rounded-[2rem] border border-white/[0.09] bg-white/[0.035] p-6 shadow-[0_30px_90px_rgba(0,0,0,.35)] backdrop-blur-xl sm:p-8">
              {children}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Feature({ icon: Icon, label, value }: { icon: typeof TrendingUp; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4">
      <Icon className="h-5 w-5 text-violet-300" />
      <p className="mt-3 text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-white">{value}</p>
    </div>
  );
}

function MockMetric({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[10px] uppercase tracking-[0.16em] text-slate-600">{label}</p><p className="mt-1 text-sm font-semibold text-white">{value}</p></div>;
}
