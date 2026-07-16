import { BarChart3, LineChart, PieChart, Sparkles } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { MetricCard } from "@/components/shared/metric-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatCurrency } from "@/lib/utils";
import { getDashboardMetrics } from "@/server/services/crm-data";

export default function ReportsPage() {
  const metrics = getDashboardMetrics();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Analytics"
        title="Reports"
        description="Measure lead sources, conversion, revenue, and sales activity with workspace-ready dashboards."
        actions={<StatusBadge tone="info">Date range: last 30 days</StatusBadge>}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Won revenue" value={formatCurrency(metrics.wonRevenue)} delta="Closed deals" icon={BarChart3} tone="emerald" />
        <MetricCard label="Average deal" value={formatCurrency(metrics.averageDealValue)} delta="Pipeline average" icon={LineChart} tone="blue" />
        <MetricCard label="Conversion rate" value={`${metrics.conversionRate}%`} delta="From lead to win" icon={PieChart} tone="violet" />
        <MetricCard label="AI insights" value={String(metrics.aiRecommendations.length)} delta="Actionable recommendations" icon={Sparkles} tone="amber" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Lead sources" description="Breakdown of acquisition channels.">
          <div className="space-y-3">
            {metrics.leadSources.map((source) => (
              <Row key={source.label} label={source.label} value={String(source.value)} />
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Pipeline stages" description="How opportunities are distributed across the funnel.">
          <div className="space-y-3">
            {metrics.pipelineStages.map((stage) => (
              <Row key={stage.label} label={stage.label} value={String(stage.value)} />
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-white/5">
      <span className="text-slate-600 dark:text-slate-400">{label}</span>
      <span className="font-medium text-slate-950 dark:text-white">{value}</span>
    </div>
  );
}
