import Link from "next/link";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
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
  const filters = result.ok
    ? result.report.filters
    : normalizeDashboardSearchParams(rawSearchParams, "TRY");
  const currentHref = buildDashboardHref(filters);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales intelligence"
        title="Dashboard"
        description={
          result.ok
            ? `Source-backed reporting for ${result.report.period.label.toLowerCase()}.`
            : "Source-backed reporting for leads, quotes, products, and revenue."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={result.ok && result.report.sourceTone === "success" ? "success" : "neutral"}>
              {result.ok ? result.report.sourceLabel : "Dashboard"}
            </StatusBadge>
            <StatusBadge tone="neutral">{filters.currency}</StatusBadge>
          </div>
        }
      />

      <SectionCard title="Report filters" description="Choose a date range and currency. The filters stay shareable in the URL.">
        <form method="get" className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr_0.9fr_0.8fr_auto]">
          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Range</span>
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
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">From</span>
            <Input name="from" type="date" defaultValue={filters.from} />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">To</span>
            <Input name="to" type="date" defaultValue={filters.to} />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Currency</span>
            <Select name="currency" defaultValue={filters.currency}>
              {CURRENCY_CODES.map((currency) => (
                <option key={currency.value} value={currency.value}>
                  {currency.label}
                </option>
              ))}
            </Select>
          </label>

          <div className="flex items-end gap-3">
            <button
              type="submit"
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950"
            >
              Apply
            </button>
            <Link
              href="/dashboard"
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
            >
              Reset
            </Link>
          </div>
        </form>
        <p className="mt-4 text-xs leading-5 text-slate-500">
          Tip: use the custom range when you need a specific reporting window. Currency filters keep financial totals from mixing currencies.
        </p>
      </SectionCard>

      {result.ok ? (
        <DashboardReportView report={result.report} />
      ) : (
        <EmptyState
          title="Unable to load dashboard data"
          description={result.message}
          actionHref={currentHref}
          actionLabel="Retry"
        />
      )}
    </div>
  );
}

function buildDashboardHref(filters: ReturnType<typeof normalizeDashboardSearchParams>) {
  const params = new URLSearchParams();

  if (filters.range !== "current_month") {
    params.set("range", filters.range);
  }

  if (filters.from) {
    params.set("from", filters.from);
  }

  if (filters.to) {
    params.set("to", filters.to);
  }

  if (filters.currency !== "TRY") {
    params.set("currency", filters.currency);
  }

  const query = params.toString();
  return query ? `/dashboard?${query}` : "/dashboard";
}

