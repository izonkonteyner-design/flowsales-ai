"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { EmptyState } from "@/components/shared/empty-state";
import { SectionCard } from "@/components/shared/section-card";
import { formatCurrency } from "@/lib/utils";
import type { QuotePipelineMetric, RevenueSeriesPoint } from "@/types/reporting";

type DashboardChartsProps = {
  revenueSeries: RevenueSeriesPoint[];
  pipeline: QuotePipelineMetric[];
  currency: string;
};

export function DashboardCharts({ revenueSeries, pipeline, currency }: DashboardChartsProps) {
  const hasRevenueData = revenueSeries.some((point) => point.acceptedRevenue > 0 || point.totalQuotedValue > 0);
  const hasPipelineData = pipeline.some((point) => point.count > 0 || point.value > 0);

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <SectionCard
        title="Revenue overview"
        description="Accepted revenue and total quoted value for the selected range."
        className="min-h-[420px]"
      >
        {hasRevenueData ? (
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueSeries}>
                <defs>
                  <linearGradient id="dashboardRevenueAccepted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0f172a" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#0f172a" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="dashboardRevenueTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.18)" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} minTickGap={20} />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => formatCurrency(Number(value), currency).replace(/\s\d+(\.\d+)?$/, "")}
                />
                <Tooltip
                  formatter={(value, name) => [
                    formatCurrency(Number(value), currency),
                    name === "acceptedRevenue" ? "Accepted revenue" : "Total quoted value",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="totalQuotedValue"
                  name="totalQuotedValue"
                  stroke="#2563eb"
                  fill="url(#dashboardRevenueTotal)"
                  strokeWidth={2.5}
                />
                <Area
                  type="monotone"
                  dataKey="acceptedRevenue"
                  name="acceptedRevenue"
                  stroke="#0f172a"
                  fill="url(#dashboardRevenueAccepted)"
                  strokeWidth={2.5}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState
            title="No revenue data in this period"
            description="Try a wider date range or a different currency to review quote performance."
          />
        )}
      </SectionCard>

      <SectionCard
        title="Quote pipeline"
        description="Status distribution by count and persisted quote value."
        className="min-h-[420px]"
      >
        {hasPipelineData ? (
          <div className="space-y-5">
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pipeline}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.18)" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} minTickGap={16} />
                  <YAxis axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(value, name, entry) => [
                      name === "value" ? formatCurrency(Number(value), currency) : value,
                      entry?.payload?.label ?? "Status",
                    ]}
                  />
                  <Bar dataKey="count" fill="#2563eb" radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {pipeline.map((item) => (
                <div
                  key={item.status}
                  className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-slate-950 dark:text-white">{item.label}</p>
                    <span className="text-xs uppercase tracking-[0.18em] text-slate-500">{item.share.toFixed(1)}%</span>
                  </div>
                  <p className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">{item.count}</p>
                  <p className="mt-1 text-sm text-slate-500">{formatCurrency(item.value, currency)}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState
            title="No quotes in the selected range"
            description="There are no quoted opportunities for the current currency and date range."
          />
        )}
      </SectionCard>
    </div>
  );
}

