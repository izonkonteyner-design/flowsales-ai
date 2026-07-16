"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  BarChart,
  Bar,
} from "recharts";
import {
  BellRing,
  BriefcaseBusiness,
  Coins,
  LayoutDashboard,
  TrendingUp,
  Users,
} from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { MetricCard } from "@/components/shared/metric-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import {
  getDashboardMetrics,
  formatDemoMoney,
} from "@/server/services/crm-data";

const metrics = getDashboardMetrics();

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description="Track your pipeline, follow-ups, and AI recommendations from one command center."
        actions={
          <>
            <button className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10">
              <LayoutDashboard className="h-4 w-4" />
              Last 30 days
            </button>
            <button className="inline-flex h-10 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950">
              <BellRing className="h-4 w-4" />
              Alerts
            </button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Pipeline value"
          value={formatDemoMoney(metrics.totalPipelineValue)}
          delta="Across all active leads"
          icon={Coins}
          tone="blue"
        />
        <MetricCard
          label="New leads"
          value={String(metrics.newLeads)}
          delta="Captured this period"
          icon={Users}
          tone="emerald"
        />
        <MetricCard
          label="Quotes sent"
          value={String(metrics.quotesSent)}
          delta="Ready for follow-up"
          icon={BriefcaseBusiness}
          tone="amber"
        />
        <MetricCard
          label="Conversion"
          value={`${metrics.conversionRate}%`}
          delta="Won opportunities"
          icon={TrendingUp}
          tone="violet"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <SectionCard
          title="Revenue trend"
          description="Demo data rendered in a responsive chart while live Supabase metrics are wired."
          className="min-h-[420px]"
        >
          <div className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metrics.monthlyRevenue}>
                <defs>
                  <linearGradient id="dashboardRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.18)" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => `₺${Number(value) / 1000}k`}
                />
                <Tooltip
                  formatter={(value) => [`₺${Number(value).toLocaleString("en-US")}`, "Revenue"]}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#2563eb"
                  strokeWidth={3}
                  fill="url(#dashboardRevenue)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <div className="space-y-6">
          <SectionCard title="AI recommendations" description="Suggested next actions for the team.">
            <div className="space-y-3">
              {metrics.aiRecommendations.map((recommendation) => (
                <div
                  key={recommendation}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                >
                  {recommendation}
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Lead sources" description="Acquisition mix by source.">
            <div className="space-y-3">
              {metrics.leadSources.map((source) => (
                <div key={source.label} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-400">{source.label}</span>
                    <span className="font-medium text-slate-950 dark:text-white">{source.value}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                    <div
                      className="h-full rounded-full bg-slate-950 dark:bg-white"
                      style={{ width: `${Math.max(source.value * 22, 12)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Pipeline stage breakdown" description="Stage distribution across your current leads.">
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.pipelineStages}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.18)" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="value" fill="#0f172a" radius={[12, 12, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Recent activity" description="Latest events from the workspace.">
          <div className="space-y-3">
            {metrics.recentActivity.map((activity) => (
              <div
                key={activity.id}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium text-slate-950 dark:text-white">{activity.title}</p>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{activity.detail}</p>
                  </div>
                  <StatusBadge tone="info">{activity.type.replace("_", " ")}</StatusBadge>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Recent leads" description="The latest opportunities added to the pipeline.">
          <div className="space-y-3">
            {metrics.recentLeads.map((lead) => (
              <div
                key={lead.id}
                className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-white/10"
              >
                <div>
                  <p className="font-medium text-slate-950 dark:text-white">{lead.full_name}</p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    {lead.company} · {lead.city}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge tone={lead.status === "won" ? "success" : lead.status === "quote_sent" ? "warning" : "info"}>
                    {lead.status.replace("_", " ")}
                  </StatusBadge>
                  <span className="text-sm font-medium text-slate-950 dark:text-white">
                    {formatDemoMoney(lead.estimated_value)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Performance summary" description="Quick health checks for the workspace.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
              <p className="text-sm text-slate-500">Won revenue</p>
              <p className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">
                {formatDemoMoney(metrics.wonRevenue)}
              </p>
              <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">+12% vs last period</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
              <p className="text-sm text-slate-500">Average deal size</p>
              <p className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">
                {formatDemoMoney(metrics.averageDealValue)}
              </p>
              <p className="mt-2 text-sm text-slate-500">Across all qualified leads</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
              <p className="text-sm text-slate-500">Follow-ups due</p>
              <p className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">{metrics.followUpsDue}</p>
              <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">Two are overdue</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
              <p className="text-sm text-slate-500">Tasks due today</p>
              <p className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">{metrics.tasksDueToday}</p>
              <p className="mt-2 text-sm text-slate-500">Keep the pipeline moving</p>
            </div>
          </div>
        </SectionCard>
      </div>

      {!metrics.recentLeads.length ? (
        <EmptyState
          title="No dashboard data yet"
          description="Once your organization starts capturing leads and quotes, the metrics will appear here."
          actionHref="/leads"
          actionLabel="Add a lead"
        />
      ) : null}
    </div>
  );
}
