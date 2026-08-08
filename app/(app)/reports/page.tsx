import { BarChart3, LineChart, PieChart, Sparkles } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { MetricCard } from "@/components/shared/metric-card";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/utils";
import { getDashboardReportData } from "@/server/services/dashboard-reporting";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ReportsPage({ searchParams }: Props) {
  const result = await getDashboardReportData(await searchParams);
  if (!result.ok) return <EmptyState title="Raporlar yüklenemedi" description={result.message} actionHref="/reports" actionLabel="Yeniden dene" />;
  const report = result.report;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Analitik" title="Raporlar ve Satış Analitiği" description={`${report.period.label} için gerçek CRM ve teklif verilerinden oluşturulan satış görünümü.`} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Kazanılan gelir" value={formatCurrency(report.metrics.acceptedRevenue, report.filters.currency)} delta={`${report.metrics.acceptedQuotes} kabul edilen teklif`} icon={BarChart3} tone="emerald" />
        <MetricCard label="Açık teklif değeri" value={formatCurrency(report.metrics.openQuoteValue, report.filters.currency)} delta={`${report.metrics.totalQuotes} toplam teklif`} icon={LineChart} tone="blue" />
        <MetricCard label="Teklif dönüşüm oranı" value={`%${report.metrics.quoteConversionRate.toFixed(1)}`} delta={`${report.metrics.convertedLeads} kazanılan potansiyel müşteri`} icon={PieChart} tone="violet" />
        <MetricCard label="Ortalama teklif" value={formatCurrency(report.metrics.averageQuoteValue, report.filters.currency)} delta={`${report.metrics.activeLeads} aktif fırsat`} icon={Sparkles} tone="amber" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Teklif hunisi" description="Tekliflerin durumlara göre adet, değer ve pay dağılımı.">
          <div className="space-y-3">{report.pipeline.map((item) => <Row key={item.status} label={item.label} value={`${item.count} · ${formatCurrency(item.value, report.filters.currency)} · %${item.share.toFixed(1)}`} />)}</div>
        </SectionCard>
        <SectionCard title="En güçlü ürünler" description="Teklif edilen değere göre öne çıkan ürünler.">
          {report.topProducts.length ? <div className="space-y-3">{report.topProducts.slice(0, 8).map((item) => <Row key={item.key} label={item.name} value={formatCurrency(item.quotedValue, item.currency)} />)}</div> : <p className="text-sm text-slate-500">Bu dönem için ürün verisi bulunmuyor.</p>}
        </SectionCard>
      </div>

      <SectionCard title="En değerli alıcılar" description="Kabul edilen ve toplam teklif değerine göre hesaplanan müşteri/fırsat görünümü.">
        {report.topRecipients.length ? <div className="grid gap-3 md:grid-cols-2">{report.topRecipients.slice(0, 10).map((item) => <Row key={item.key} label={item.company ? `${item.name} · ${item.company}` : item.name} value={formatCurrency(item.acceptedValue || item.totalQuoteValue, item.currency)} />)}</div> : <p className="text-sm text-slate-500">Bu dönem için alıcı verisi bulunmuyor.</p>}
      </SectionCard>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-3"><span className="text-sm text-slate-400">{label}</span><span className="text-right text-sm font-medium text-white">{value}</span></div>;
}
