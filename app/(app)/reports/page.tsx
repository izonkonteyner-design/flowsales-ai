import Link from "next/link";
import { BarChart3, LineChart, PieChart, TrendingUp } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { MetricCard } from "@/components/shared/metric-card";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/utils";
import { getDashboardReportData } from "@/server/services/dashboard-reporting";
import { getWorkspaceContext } from "@/server/services/workspace-context";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ReportsPage({ searchParams }: Props) {
  const [result, context] = await Promise.all([getDashboardReportData(await searchParams), getWorkspaceContext()]);
  if (!result.ok) {
    return (
      <EmptyState
        title="Raporlar yüklenemedi"
        description={result.message}
        actionHref="/reports"
        actionLabel="Yeniden dene"
      />
    );
  }
  const report = result.report;
  const canViewActivation = ["owner", "admin"].includes(context.role);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Analitik & Performans"
        title="Satış ve Finansal Raporlar"
        description={`${report.period.label} dönemi için CRM ve teklif verilerinden derlenen kurumsal satış raporu.`}
        actions={
          canViewActivation ? (
            <Link
              href="/reports/activation"
              className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground shadow-xs transition hover:bg-muted"
            >
              Activation report
            </Link>
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Kazanılan Gelir"
          value={formatCurrency(report.metrics.acceptedRevenue, report.filters.currency)}
          delta={`${report.metrics.acceptedQuotes} kabul edilen teklif`}
          icon={BarChart3}
          tone="emerald"
        />
        <MetricCard
          label="Açık Teklif Değeri"
          value={formatCurrency(report.metrics.openQuoteValue, report.filters.currency)}
          delta={`${report.metrics.totalQuotes} toplam teklif`}
          icon={LineChart}
          tone="blue"
        />
        <MetricCard
          label="Teklif Dönüşüm Oranı"
          value={`%${report.metrics.quoteConversionRate.toFixed(1)}`}
          delta={`${report.metrics.convertedLeads} kazanılan fırsat`}
          icon={PieChart}
          tone="violet"
        />
        <MetricCard
          label="Ortalama Teklif"
          value={formatCurrency(report.metrics.averageQuoteValue, report.filters.currency)}
          delta={`${report.metrics.activeLeads} aktif fırsat`}
          icon={TrendingUp}
          tone="amber"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Teklif Hunisi Dağılımı" description="Tekliflerin aşamalara göre adet, toplam değer ve genel payı.">
          <div className="space-y-2">
            {report.pipeline.map((item) => (
              <Row
                key={item.status}
                label={item.label}
                value={`${item.count} adet · ${formatCurrency(item.value, report.filters.currency)} · %${item.share.toFixed(1)}`}
              />
            ))}
          </div>
        </SectionCard>

        <SectionCard title="En Çok Teklif Edilen Ürünler" description="Teklif edilen toplam değere göre en çok talep gören modeller.">
          {report.topProducts.length ? (
            <div className="space-y-2">
              {report.topProducts.slice(0, 8).map((item) => (
                <Row key={item.key} label={item.name} value={formatCurrency(item.quotedValue, item.currency)} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">Bu dönem için ürün verisi bulunmuyor.</p>
          )}
        </SectionCard>
      </div>

      <SectionCard title="En Yüksek Hacimli Alıcılar" description="Kabul edilen ve toplam teklif büyüklüğüne göre sıralı müşteri listesi.">
        {report.topRecipients.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {report.topRecipients.slice(0, 10).map((item) => (
              <Row
                key={item.key}
                label={item.company ? `${item.name} · ${item.company}` : item.name}
                value={formatCurrency(item.acceptedValue || item.totalQuoteValue, item.currency)}
              />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-4">Bu dönem için alıcı verisi bulunmuyor.</p>
        )}
      </SectionCard>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-xs shadow-xs">
      <span className="text-muted-foreground font-medium truncate">{label}</span>
      <span className="text-right font-bold text-foreground shrink-0">{value}</span>
    </div>
  );
}
