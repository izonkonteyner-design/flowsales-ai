import Link from "next/link";
import { Banknote, BriefcaseBusiness, Coins, FileText, Package, TrendingUp, Users } from "lucide-react";

import { DashboardCharts } from "@/components/dashboard/dashboard-charts";
import { EmptyState } from "@/components/shared/empty-state";
import { MetricCard } from "@/components/shared/metric-card";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { formatDashboardComparison } from "@/server/services/dashboard-domain";
import { getQuoteStatusTone } from "@/server/services/quote-domain";
import type { DashboardReport } from "@/types/reporting";

type DashboardReportViewProps = { report: DashboardReport };

export function DashboardReportView({ report }: DashboardReportViewProps) {
  const comparison = report.comparisons;
  const currency = report.filters.currency;
  const sourceBadgeTone = report.sourceTone === "success" ? "success" : "neutral";

  const coreMetrics = [
    { label: "Toplam potansiyel müşteri", value: String(report.metrics.totalLeads), delta: formatDashboardComparison(comparison.totalLeads), icon: Users, tone: "blue" as const },
    { label: "Aktif potansiyel müşteri", value: String(report.metrics.activeLeads), delta: formatDashboardComparison(comparison.activeLeads), icon: Users, tone: "emerald" as const },
    { label: "Nitelikli fırsatlar", value: String(report.metrics.qualifiedLeads), delta: formatDashboardComparison(comparison.qualifiedLeads), icon: BriefcaseBusiness, tone: "violet" as const },
    { label: "Dönüşen fırsatlar", value: String(report.metrics.convertedLeads), delta: formatDashboardComparison(comparison.convertedLeads), icon: TrendingUp, tone: "emerald" as const },
    { label: "Toplam ürün", value: String(report.metrics.totalProducts), icon: Package, tone: "blue" as const },
    { label: "Aktif ürün", value: String(report.metrics.activeProducts), icon: Package, tone: "emerald" as const },
    { label: "Toplam teklif", value: String(report.metrics.totalQuotes), delta: formatDashboardComparison(comparison.totalQuotes), icon: FileText, tone: "amber" as const },
    { label: "Kabul edilen gelir", value: formatCurrency(report.metrics.acceptedRevenue, currency), delta: formatDashboardComparison(comparison.acceptedRevenue), icon: Coins, tone: "emerald" as const },
  ];

  const quoteMetrics = [
    { label: "Açık teklif değeri", value: formatCurrency(report.metrics.openQuoteValue, currency), delta: formatDashboardComparison(comparison.openQuoteValue), icon: Banknote, tone: "amber" as const },
    { label: "Ortalama teklif değeri", value: formatCurrency(report.metrics.averageQuoteValue, currency), delta: formatDashboardComparison(comparison.averageQuoteValue), icon: Coins, tone: "blue" as const },
    { label: "Teklif dönüşüm oranı", value: `${report.metrics.quoteConversionRate.toFixed(1)}%`, delta: formatDashboardComparison(comparison.quoteConversionRate), icon: TrendingUp, tone: "violet" as const },
    { label: "Ortalama kabul edilen teklif", value: formatCurrency(report.metrics.averageAcceptedQuoteValue, currency), delta: formatDashboardComparison(comparison.averageAcceptedQuoteValue), icon: Coins, tone: "emerald" as const },
    { label: "Toplam teklif edilen değer", value: formatCurrency(report.metrics.totalQuotedValue, currency), delta: formatDashboardComparison(comparison.totalQuotedValue), icon: Banknote, tone: "blue" as const },
  ];

  return (
    <div className="space-y-6">
      <SectionCard className="border border-emerald-200/70 bg-emerald-50/60 dark:border-emerald-500/20 dark:bg-emerald-500/10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={sourceBadgeTone} title={report.sourceLabel}>{report.sourceLabel}</StatusBadge>
              {report.hasMultipleCurrencies ? <StatusBadge tone="warning" title="Çalışma alanında birden fazla para birimi var; panel aynı anda bir para birimini gösterir.">Çoklu para birimi</StatusBadge> : null}
              <StatusBadge tone="neutral">{report.period.label}</StatusBadge>
              <StatusBadge tone="neutral">{report.filters.currency}</StatusBadge>
            </div>
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{report.period.comparisonLabel ? `${report.period.comparisonLabel} ile karşılaştırılıyor.` : "Tüm zamanlar görünümünde karşılaştırma dönemi yok."}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3"><MiniStat label="Potansiyel müşteri" value={String(report.metrics.totalLeads)} /><MiniStat label="Teklif" value={String(report.metrics.totalQuotes)} /><MiniStat label="Ürün" value={String(report.metrics.totalProducts)} /></div>
        </div>
      </SectionCard>

      <SectionCard title="Çalışma alanı özeti" description="Seçili raporlama dönemindeki potansiyel müşteri, ürün ve teklif metrikleri."><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{coreMetrics.map((metric) => <MetricCard key={metric.label} label={metric.label} value={metric.value} delta={metric.delta ?? undefined} icon={metric.icon} tone={metric.tone} />)}</div></SectionCard>
      <SectionCard title="Teklif ekonomisi" description="Seçili para birimindeki kalıcı teklif toplamları ve dönüşüm kalitesi."><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">{quoteMetrics.map((metric) => <MetricCard key={metric.label} label={metric.label} value={metric.value} delta={metric.delta ?? undefined} icon={metric.icon} tone={metric.tone} />)}</div></SectionCard>

      <DashboardCharts revenueSeries={report.revenueSeries} pipeline={report.pipeline} currency={currency} />

      <SectionCard title="Teklif durum dağılımı" description="Her durum teklif adedini, payını ve kalıcı değerini gösterir."><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{report.pipeline.map((status) => <div key={status.status} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/5"><div className="flex items-start justify-between gap-3"><div><StatusBadge tone={status.tone}>{status.label}</StatusBadge><p className="mt-3 text-2xl font-semibold text-slate-950 dark:text-white">{status.count}</p></div><span className="text-xs uppercase tracking-[0.18em] text-slate-500">{status.share.toFixed(1)}%</span></div><p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{formatCurrency(status.value, currency)}</p></div>)}</div></SectionCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="En güçlü ürünler" description="Teklif satırı anlık görüntülerinden gruplanır; manuel satırlar ayrı tutulur.">{report.topProducts.length ? <div className="space-y-3">{report.topProducts.map((product) => <div key={product.key} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/5"><div className="flex items-start justify-between gap-4"><div><p className="font-medium text-slate-950 dark:text-white">{product.name}</p><p className="mt-1 text-sm text-slate-500">{product.sku ? `SKU ${product.sku}` : "Manuel teklif satırı"}</p></div><StatusBadge tone="neutral">{product.currency}</StatusBadge></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><StatMini label="Miktar" value={product.quantity.toFixed(2).replace(/\.00$/, "")} /><StatMini label="Teklif edilen değer" value={formatCurrency(product.quotedValue, product.currency)} /><StatMini label="Kabul edilen değer" value={formatCurrency(product.acceptedValue, product.currency)} /></div></div>)}</div> : <EmptyState title="Henüz ürün performansı yok" description="Tekliflerde ürün anlık görüntüleri oluştukça en güçlü ürünler burada görünür." />}</SectionCard>

        <SectionCard title="En değerli müşteriler" description="Kabul edilen gelir müşteri veya potansiyel müşteri bazında toplanır.">{report.topRecipients.length ? <div className="space-y-3">{report.topRecipients.map((recipient) => <div key={recipient.key} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/5"><div className="flex items-start justify-between gap-4"><div><p className="font-medium text-slate-950 dark:text-white">{recipient.name}</p><p className="mt-1 text-sm text-slate-500">{recipient.company ?? "Şirket bilgisi yok"}</p></div><StatusBadge tone="neutral">{recipient.currency}</StatusBadge></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><StatMini label="Kabul edilen teklif" value={String(recipient.acceptedQuoteCount)} /><StatMini label="Kabul edilen değer" value={formatCurrency(recipient.acceptedValue, recipient.currency)} /><StatMini label="Toplam değer" value={formatCurrency(recipient.totalQuoteValue, recipient.currency)} /></div></div>)}</div> : <EmptyState title="Raporlanacak müşteri yok" description="Kazanılan teklifler oluştukça kabul edilen gelir burada görünür." />}</SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Son teklifler" description="Seçili para birimi ve tarih aralığındaki en güncel teklif hareketleri.">{report.recentQuotes.length ? <div className="space-y-3">{report.recentQuotes.map((quote) => <Link key={quote.id} href={quote.href} className="block rounded-2xl border border-slate-200 bg-slate-50/80 p-4 transition hover:border-slate-300 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20 dark:hover:bg-white/10"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium text-slate-950 dark:text-white">{quote.quoteNumber}</p><p className="mt-1 text-sm text-slate-500">{quote.recipient}</p><p className="mt-1 text-xs text-slate-500">{formatDateTime(quote.updatedAt)}</p></div><div className="flex items-center gap-3"><StatusBadge tone={getQuoteStatusTone(quote.status)}>{quote.statusLabel}</StatusBadge><span className="text-sm font-medium text-slate-950 dark:text-white">{formatCurrency(quote.grandTotal, quote.currency)}</span></div></div></Link>)}</div> : <EmptyState title="Güncel teklif yok" description="Yeni bir teklif oluşturun veya rapor dönemini genişletin." actionHref="/quotes/new" actionLabel="Yeni teklif" />}</SectionCard>

        <SectionCard title="Son potansiyel müşteriler" description="Çalışma alanına en son eklenen satış fırsatları.">{report.recentLeads.length ? <div className="space-y-3">{report.recentLeads.map((lead) => <Link key={lead.id} href={lead.href} className="block rounded-2xl border border-slate-200 bg-slate-50/80 p-4 transition hover:border-slate-300 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20 dark:hover:bg-white/10"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium text-slate-950 dark:text-white">{lead.fullName}</p><p className="mt-1 text-sm text-slate-500">{lead.company ?? "Şirket bilgisi yok"}</p><p className="mt-1 text-xs text-slate-500">{formatDateTime(lead.updatedAt)}</p></div><StatusBadge tone={getLeadTone(lead.status)}>{lead.statusLabel}</StatusBadge></div></Link>)}</div> : <EmptyState title="Güncel potansiyel müşteri yok" description="Yeni fırsatlar eklendikçe burada görünür." actionHref="/leads/new" actionLabel="Yeni potansiyel müşteri" />}</SectionCard>
      </div>

      {!report.hasData ? <EmptyState title="Bu dönemde panel hareketi yok" description="Seçili dönemde potansiyel müşteri, teklif veya ürün bulunmuyor. Daha geniş bir dönem ya da farklı para birimi deneyin." actionHref="/dashboard" actionLabel="Filtreleri sıfırla" /> : null}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-white/40 bg-white/70 px-3 py-2 text-sm text-slate-700 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-slate-300"><p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p><p className="mt-1 font-medium text-slate-950 dark:text-white">{value}</p></div>;
}

function StatMini({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p><p className="mt-1 text-sm font-medium text-slate-950 dark:text-white">{value}</p></div>;
}

function getLeadTone(status: string) {
  if (status === "won") return "success";
  if (status === "lost") return "danger";
  if (status === "quote_sent" || status === "negotiation") return "warning";
  if (status === "qualified") return "info";
  return "neutral";
}
