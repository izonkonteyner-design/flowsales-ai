import Link from "next/link";
import {
  Banknote,
  BriefcaseBusiness,
  Coins,
  FileText,
  Package,
  TrendingUp,
  Users,
} from "lucide-react";

import { DashboardCharts } from "@/components/dashboard/dashboard-charts";
import { EmptyState } from "@/components/shared/empty-state";
import { MetricCard } from "@/components/shared/metric-card";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { formatDashboardComparison } from "@/server/services/dashboard-domain";
import { getQuoteStatusTone } from "@/server/services/quote-domain";
import type { DashboardReport } from "@/types/reporting";

type DashboardReportViewProps = {
  report: DashboardReport;
};

export function DashboardReportView({ report }: DashboardReportViewProps) {
  const comparison = report.comparisons;
  const currency = report.filters.currency;
  const sourceBadgeTone = report.sourceTone === "success" ? "success" : "neutral";

  const coreMetrics = [
    {
      label: "Total leads",
      value: String(report.metrics.totalLeads),
      delta: formatDashboardComparison(comparison.totalLeads),
      icon: Users,
      tone: "blue" as const,
    },
    {
      label: "Active leads",
      value: String(report.metrics.activeLeads),
      delta: formatDashboardComparison(comparison.activeLeads),
      icon: Users,
      tone: "emerald" as const,
    },
    {
      label: "Qualified leads",
      value: String(report.metrics.qualifiedLeads),
      delta: formatDashboardComparison(comparison.qualifiedLeads),
      icon: BriefcaseBusiness,
      tone: "violet" as const,
    },
    {
      label: "Converted leads",
      value: String(report.metrics.convertedLeads),
      delta: formatDashboardComparison(comparison.convertedLeads),
      icon: TrendingUp,
      tone: "emerald" as const,
    },
    {
      label: "Total products",
      value: String(report.metrics.totalProducts),
      icon: Package,
      tone: "blue" as const,
    },
    {
      label: "Active products",
      value: String(report.metrics.activeProducts),
      icon: Package,
      tone: "emerald" as const,
    },
    {
      label: "Total quotes",
      value: String(report.metrics.totalQuotes),
      delta: formatDashboardComparison(comparison.totalQuotes),
      icon: FileText,
      tone: "amber" as const,
    },
    {
      label: "Accepted revenue",
      value: formatCurrency(report.metrics.acceptedRevenue, currency),
      delta: formatDashboardComparison(comparison.acceptedRevenue),
      icon: Coins,
      tone: "emerald" as const,
    },
  ];

  const quoteMetrics = [
    {
      label: "Open quote value",
      value: formatCurrency(report.metrics.openQuoteValue, currency),
      delta: formatDashboardComparison(comparison.openQuoteValue),
      icon: Banknote,
      tone: "amber" as const,
    },
    {
      label: "Average quote value",
      value: formatCurrency(report.metrics.averageQuoteValue, currency),
      delta: formatDashboardComparison(comparison.averageQuoteValue),
      icon: Coins,
      tone: "blue" as const,
    },
    {
      label: "Quote conversion rate",
      value: `${report.metrics.quoteConversionRate.toFixed(1)}%`,
      delta: formatDashboardComparison(comparison.quoteConversionRate),
      icon: TrendingUp,
      tone: "violet" as const,
    },
    {
      label: "Average accepted quote value",
      value: formatCurrency(report.metrics.averageAcceptedQuoteValue, currency),
      delta: formatDashboardComparison(comparison.averageAcceptedQuoteValue),
      icon: Coins,
      tone: "emerald" as const,
    },
    {
      label: "Total quoted value",
      value: formatCurrency(report.metrics.totalQuotedValue, currency),
      delta: formatDashboardComparison(comparison.totalQuotedValue),
      icon: Banknote,
      tone: "blue" as const,
    },
  ];

  return (
    <div className="space-y-6">
      <SectionCard className="border border-emerald-200/70 bg-emerald-50/60 dark:border-emerald-500/20 dark:bg-emerald-500/10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={sourceBadgeTone} title={report.sourceLabel}>
                {report.sourceLabel}
              </StatusBadge>
              {report.hasMultipleCurrencies ? (
                <StatusBadge
                  tone="warning"
                  title="The workspace has mixed currencies; the dashboard is filtered to one currency at a time."
                >
                  Mixed-currency workspace
                </StatusBadge>
              ) : null}
              <StatusBadge tone="neutral">{report.period.label}</StatusBadge>
              <StatusBadge tone="neutral">{report.filters.currency}</StatusBadge>
            </div>
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
              {report.period.comparisonLabel
                ? `Compared against ${report.period.comparisonLabel}.`
                : "All-time reporting with no comparison period."}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <MiniStat label="Total leads" value={String(report.metrics.totalLeads)} />
            <MiniStat label="Total quotes" value={String(report.metrics.totalQuotes)} />
            <MiniStat label="Products" value={String(report.metrics.totalProducts)} />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Workspace snapshot" description="Lead, product, and quote counts for the selected reporting period.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {coreMetrics.map((metric) => (
            <MetricCard
              key={metric.label}
              label={metric.label}
              value={metric.value}
              delta={metric.delta ?? undefined}
              icon={metric.icon}
              tone={metric.tone}
            />
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Quote economics" description="Persisted quote totals and conversion quality for the selected currency.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {quoteMetrics.map((metric) => (
            <MetricCard
              key={metric.label}
              label={metric.label}
              value={metric.value}
              delta={metric.delta ?? undefined}
              icon={metric.icon}
              tone={metric.tone}
            />
          ))}
        </div>
      </SectionCard>

      <DashboardCharts revenueSeries={report.revenueSeries} pipeline={report.pipeline} currency={currency} />

      <SectionCard title="Quote status breakdown" description="Each status shows the count, share of quotes, and persisted value.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {report.pipeline.map((status) => (
            <div key={status.status} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                  <p className="mt-3 text-2xl font-semibold text-slate-950 dark:text-white">{status.count}</p>
                </div>
                <span className="text-xs uppercase tracking-[0.18em] text-slate-500">{status.share.toFixed(1)}%</span>
              </div>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{formatCurrency(status.value, currency)}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Top products" description="Grouped from quote item snapshots. Manual lines stay separate.">
          {report.topProducts.length ? (
            <div className="space-y-3">
              {report.topProducts.map((product) => (
                <div key={product.key} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-slate-950 dark:text-white">{product.name}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {product.sku ? `SKU ${product.sku}` : "Manual snapshot line"}
                      </p>
                    </div>
                    <StatusBadge tone="neutral">{product.currency}</StatusBadge>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <StatMini label="Quantity" value={product.quantity.toFixed(2).replace(/\.00$/, "")} />
                    <StatMini label="Quoted value" value={formatCurrency(product.quotedValue, product.currency)} />
                    <StatMini label="Accepted value" value={formatCurrency(product.acceptedValue, product.currency)} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No top products yet"
              description="Once quotes include product snapshots, the strongest sellers will show up here."
            />
          )}
        </SectionCard>

        <SectionCard title="Top customers" description="Accepted revenue aggregated by customer or lead fallback.">
          {report.topRecipients.length ? (
            <div className="space-y-3">
              {report.topRecipients.map((recipient) => (
                <div key={recipient.key} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-slate-950 dark:text-white">{recipient.name}</p>
                      <p className="mt-1 text-sm text-slate-500">{recipient.company ?? "No company"}</p>
                    </div>
                    <StatusBadge tone="neutral">{recipient.currency}</StatusBadge>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <StatMini label="Accepted quotes" value={String(recipient.acceptedQuoteCount)} />
                    <StatMini label="Accepted value" value={formatCurrency(recipient.acceptedValue, recipient.currency)} />
                    <StatMini label="Total value" value={formatCurrency(recipient.totalQuoteValue, recipient.currency)} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No recipients to report"
              description="Accepted quote revenue will appear here once quotes are won."
            />
          )}
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Recent quotes" description="Latest quote updates in the selected currency and date range.">
          {report.recentQuotes.length ? (
            <div className="space-y-3">
              {report.recentQuotes.map((quote) => (
                <Link
                  key={quote.id}
                  href={quote.href}
                  className="block rounded-2xl border border-slate-200 bg-slate-50/80 p-4 transition hover:border-slate-300 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20 dark:hover:bg-white/10"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium text-slate-950 dark:text-white">{quote.quoteNumber}</p>
                      <p className="mt-1 text-sm text-slate-500">{quote.recipient}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatDateTime(quote.updatedAt)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge tone={getQuoteStatusTone(quote.status)}>{quote.statusLabel}</StatusBadge>
                      <span className="text-sm font-medium text-slate-950 dark:text-white">
                        {formatCurrency(quote.grandTotal, quote.currency)}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No recent quotes"
              description="Create a quote or widen the reporting range to see recent commercial activity."
              actionHref="/quotes/new"
              actionLabel="New quote"
            />
          )}
        </SectionCard>

        <SectionCard title="Recent leads" description="Latest leads captured in the workspace.">
          {report.recentLeads.length ? (
            <div className="space-y-3">
              {report.recentLeads.map((lead) => (
                <Link
                  key={lead.id}
                  href={lead.href}
                  className="block rounded-2xl border border-slate-200 bg-slate-50/80 p-4 transition hover:border-slate-300 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20 dark:hover:bg-white/10"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium text-slate-950 dark:text-white">{lead.fullName}</p>
                      <p className="mt-1 text-sm text-slate-500">{lead.company ?? "No company"}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatDateTime(lead.updatedAt)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge tone={getLeadTone(lead.status)}>{lead.statusLabel}</StatusBadge>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No recent leads"
              description="Captured leads will appear here once the workspace starts collecting new opportunities."
              actionHref="/leads/new"
              actionLabel="New lead"
            />
          )}
        </SectionCard>
      </div>

      {!report.hasData ? (
        <EmptyState
          title="No dashboard activity in this period"
          description="The selected range has no leads, quotes, or products. Try a broader range or a different currency."
          actionHref="/dashboard"
          actionLabel="Reset filters"
        />
      ) : null}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/40 bg-white/70 px-3 py-2 text-sm text-slate-700 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 font-medium text-slate-950 dark:text-white">{value}</p>
    </div>
  );
}

function StatMini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-950 dark:text-white">{value}</p>
    </div>
  );
}

function getLeadTone(status: string) {
  if (status === "won") {
    return "success";
  }

  if (status === "lost") {
    return "danger";
  }

  if (status === "quote_sent" || status === "negotiation") {
    return "warning";
  }

  if (status === "qualified") {
    return "info";
  }

  return "neutral";
}
