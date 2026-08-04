import Link from "next/link";
import { ArrowUpRight, Bot, ShieldCheck, Sparkles, Zap } from "lucide-react";

import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionCard } from "@/components/shared/section-card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { CURRENCY_CODES } from "@/lib/constants";
import { DashboardReportView } from "@/components/dashboard/dashboard-report";
import { getDashboardReportData } from "@/server/services/dashboard-reporting";
import { normalizeDashboardSearchParams } from "@/server/services/dashboard-domain";

type DashboardPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const rawSearchParams = await searchParams;
  const result = await getDashboardReportData(rawSearchParams);
  const filters = result.ok ? result.report.filters : normalizeDashboardSearchParams(rawSearchParams, "TRY");
  const currentHref = buildDashboardHref(filters);

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[2rem] border border-violet-400/15 bg-[linear-gradient(135deg,rgba(124,58,237,.16),rgba(37,99,235,.08)_48%,rgba(14,165,233,.06))] p-6 shadow-[0_35px_100px_rgba(15,23,42,.25)] sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-violet-500/15 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/3 h-48 w-48 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-300/15 bg-violet-300/10 px-3 py-1.5 text-xs font-medium text-violet-200">
              <Sparkles className="h-3.5 w-3.5" /> Executive revenue workspace
            </div>
            <h1 className="text-3xl font-semibold tracking-[-0.035em] text-white sm:text-4xl xl:text-5xl">
              Your sales operation, prioritized in one view.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
              Track pipeline health, quote economics and AI-assisted actions with source-backed reporting for {result.ok ? result.report.period.label.toLowerCase() : "your selected period"}.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <StatusBadge tone={result.ok && result.report.sourceTone === "success" ? "success" : "neutral"}>
                {result.ok ? result.report.sourceLabel : "Dashboard"}
              </StatusBadge>
              <StatusBadge tone="neutral">{filters.currency}</StatusBadge>
              <StatusBadge tone="info">Migration 0026 ready</StatusBadge>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:w-[470px]">
            <QuickAction href="/ai" icon={Bot} label="Ask AI" detail="Generate next actions" />
            <QuickAction href="/approvals" icon={ShieldCheck} label="Approvals" detail="Review controlled actions" />
            <QuickAction href="/leads/new" icon={Zap} label="New lead" detail="Capture opportunity" />
          </div>
        </div>
      </section>

      <SectionCard title="Report controls" description="Choose a date range and currency. Filters remain shareable in the URL.">
        <form method="get" className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr_0.9fr_0.8fr_auto]">
          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-300">Range</span>
            <Select name="range" defaultValue={filters.range}>
              <option value="current_month">Current month</option>
              <option value="previous_month">Previous month</option>
              <option value="last_30_days">Last 30 days</option>
              <option value="last_90_days">Last 90 days</option>
              <option value="current_year">Current year</option>
              <option value="all_time">All time</option>
              <option value="custom">Custom</option>
            </Select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-300">From</span>
            <Input name="from" type="date" defaultValue={filters.from} />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-300">To</span>
            <Input name="to" type="date" defaultValue={filters.to} />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-300">Currency</span>
            <Select name="currency" defaultValue={filters.currency}>
              {CURRENCY_CODES.map((currency) => (
                <option key={currency.value} value={currency.value}>{currency.label}</option>
              ))}
            </Select>
          </label>

          <div className="flex items-end gap-3">
            <button type="submit" className="inline-flex h-11 items-center justify-center rounded-2xl bg-gradient-to-r from-violet-500 to-blue-500 px-5 text-sm font-medium text-white shadow-[0_12px_28px_rgba(99,102,241,.25)] transition hover:brightness-110">
              Apply
            </button>
            <Link href="/dashboard" className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/[0.09] bg-white/[0.04] px-4 text-sm font-medium text-slate-300 transition hover:bg-white/[0.07]">
              Reset
            </Link>
          </div>
        </form>
      </SectionCard>

      {result.ok ? (
        <DashboardReportView report={result.report} />
      ) : (
        <EmptyState title="Unable to load dashboard data" description={result.message} actionHref={currentHref} actionLabel="Retry" />
      )}
    </div>
  );
}

function QuickAction({ href, icon: Icon, label, detail }: { href: string; icon: typeof Bot; label: string; detail: string }) {
  return (
    <Link href={href} className="group rounded-2xl border border-white/[0.09] bg-white/[0.045] p-4 backdrop-blur transition hover:-translate-y-0.5 hover:border-violet-300/25 hover:bg-white/[0.07]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-cyan-400/15 ring-1 ring-white/10">
          <Icon className="h-4 w-4 text-violet-200" />
        </div>
        <ArrowUpRight className="h-4 w-4 text-slate-600 transition group-hover:text-cyan-300" />
      </div>
      <p className="mt-4 text-sm font-medium text-white">{label}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </Link>
  );
}

function buildDashboardHref(filters: ReturnType<typeof normalizeDashboardSearchParams>) {
  const params = new URLSearchParams();
  if (filters.range !== "current_month") params.set("range", filters.range);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.currency !== "TRY") params.set("currency", filters.currency);
  const query = params.toString();
  return query ? `/dashboard?${query}` : "/dashboard";
}
