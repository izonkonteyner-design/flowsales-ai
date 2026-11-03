import Link from "next/link";
import { Bot, ShieldCheck, Zap } from "lucide-react";

import { DashboardReportView } from "@/components/dashboard/dashboard-report";
import { PipelineIntelligence } from "@/components/dashboard/pipeline-intelligence";
import { TodaysPriorities } from "@/components/dashboard/todays-priorities";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { CURRENCY_CODES } from "@/lib/constants";
import { normalizeDashboardSearchParams } from "@/server/services/dashboard-domain";
import { getDashboardReportData } from "@/server/services/dashboard-reporting";

type DashboardPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const rawSearchParams = await searchParams;
  const result = await getDashboardReportData(rawSearchParams);
  const filters = result.ok ? result.report.filters : normalizeDashboardSearchParams(rawSearchParams, "TRY");
  const currentHref = buildDashboardHref(filters);

  return (
    <div className="space-y-5">
      {/* Executive Welcome & Quick Actions Bar */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-xs">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                Yönetici Satış & Operasyon Paneli
              </h1>
              <StatusBadge tone={result.ok && result.report.sourceTone === "success" ? "success" : "neutral"}>
                {result.ok ? result.report.sourceLabel : "Canlı Veri"}
              </StatusBadge>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-2xl">
              Satış hunisi performansını, teklif ekonomisini ve operasyonel aksiyonları izleyin.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              href="/leads/new"
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-colors"
            >
              <Zap className="h-3.5 w-3.5" /> Yeni Fırsat
            </Link>
            <Link
              href="/opportunities/risk"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted transition-colors"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" /> Riskli Fırsatlar
            </Link>
            <Link
              href="/ai"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted transition-colors"
            >
              <Bot className="h-3.5 w-3.5 text-muted-foreground" /> Satış Asistanı
            </Link>
          </div>
        </div>
      </div>

      <TodaysPriorities />
      <PipelineIntelligence />

      {/* Date & Currency Filters */}
      <SectionCard
        title="Rapor Kontrolleri"
        description="Görüntülemek istediğiniz dönem ve para birimini seçin."
      >
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 items-end">
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Dönem</span>
            <Select name="range" defaultValue={filters.range}>
              <option value="current_month">Bu ay</option>
              <option value="previous_month">Geçen ay</option>
              <option value="last_30_days">Son 30 gün</option>
              <option value="last_90_days">Son 90 gün</option>
              <option value="current_year">Bu yıl</option>
              <option value="all_time">Tüm zamanlar</option>
              <option value="custom">Özel aralık</option>
            </Select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Başlangıç</span>
            <Input name="from" type="date" defaultValue={filters.from} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Bitiş</span>
            <Input name="to" type="date" defaultValue={filters.to} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Para Birimi</span>
            <Select name="currency" defaultValue={filters.currency}>
              {CURRENCY_CODES.map((currency) => (
                <option key={currency.value} value={currency.value}>
                  {currency.label}
                </option>
              ))}
            </Select>
          </label>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="inline-flex h-9 flex-1 items-center justify-center rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-colors"
            >
              Uygula
            </button>
            <Link
              href="/dashboard"
              className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-3 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              Sıfırla
            </Link>
          </div>
        </form>
      </SectionCard>

      {result.ok ? (
        <DashboardReportView report={result.report} />
      ) : (
        <EmptyState
          title="Kontrol paneli verileri yüklenemedi"
          description={result.message}
          actionHref={currentHref}
          actionLabel="Yeniden dene"
        />
      )}
    </div>
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
