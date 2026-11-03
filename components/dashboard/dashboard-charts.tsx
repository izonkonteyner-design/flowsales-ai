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
    <div className="grid gap-5 lg:grid-cols-2">
      <SectionCard
        title="Gelir ve Teklif Eğilimi"
        description="Seçili dönemde kabul edilen net gelir ve toplam teklif edilen değer."
        className="min-h-[400px]"
      >
        {hasRevenueData ? (
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueSeries}>
                <defs>
                  <linearGradient id="dashboardRevenueAccepted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0f172a" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#0f172a" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="dashboardRevenueTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.15)" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} minTickGap={20} tick={{ fontSize: 11 }} />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(value) => formatCurrency(Number(value), currency).replace(/\s\d+(\.\d+)?$/, "")}
                />
                <Tooltip
                  formatter={(value, name) => [
                    formatCurrency(Number(value), currency),
                    name === "acceptedRevenue" ? "Kabul Edilen Gelir" : "Toplam Teklif",
                  ]}
                  contentStyle={{
                    backgroundColor: "var(--card)",
                    borderColor: "var(--border)",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="totalQuotedValue"
                  name="totalQuotedValue"
                  stroke="#2563eb"
                  fill="url(#dashboardRevenueTotal)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="acceptedRevenue"
                  name="acceptedRevenue"
                  stroke="#0f172a"
                  fill="url(#dashboardRevenueAccepted)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState
            title="Bu dönemde gelir verisi yok"
            description="Daha geniş bir tarih aralığı veya farklı bir para birimi deneyin."
          />
        )}
      </SectionCard>

      <SectionCard
        title="Teklif Hunisi Dağılımı"
        description="Teklif durumlarının adet ve parasal büyüklük oranı."
        className="min-h-[400px]"
      >
        {hasPipelineData ? (
          <div className="space-y-4">
            <div className="h-[230px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pipeline}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.15)" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} minTickGap={16} tick={{ fontSize: 11 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(value, name, entry) => [
                      name === "value" ? formatCurrency(Number(value), currency) : value,
                      entry?.payload?.label ?? "Durum",
                    ]}
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      borderColor: "var(--border)",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="count" fill="#2563eb" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2">
              {pipeline.map((item) => (
                <div
                  key={item.status}
                  className="rounded-lg border border-border bg-card p-3 shadow-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-foreground">{item.label}</p>
                    <span className="text-[10px] font-semibold text-muted-foreground">{item.share.toFixed(1)}%</span>
                  </div>
                  <p className="mt-1 text-lg font-bold text-foreground">{item.count} adet</p>
                  <p className="text-xs text-muted-foreground">{formatCurrency(item.value, currency)}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState
            title="Seçili aralıkta teklif bulunmuyor"
            description="Geçerli filtrelerle eşleşen bir teklif kaydı bulunamadı."
          />
        )}
      </SectionCard>
    </div>
  );
}
