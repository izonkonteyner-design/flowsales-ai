import { Suspense } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Banknote, BriefcaseBusiness, Coins, FileText, Package, TrendingUp, Users } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { MetricCard } from "@/components/shared/metric-card";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { formatDashboardComparison } from "@/server/services/dashboard-domain";
import { getQuoteStatusTone } from "@/server/services/quote-domain";
import type { DashboardReport } from "@/types/reporting";

const DashboardCharts = dynamic(
  () => import("@/components/dashboard/dashboard-charts").then((m) => m.DashboardCharts),
);

function DashboardChartsFallback() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="h-72 rounded-xl border border-border bg-card p-5 animate-pulse shadow-xs" />
      <div className="h-72 rounded-xl border border-border bg-card p-5 animate-pulse shadow-xs" />
    </div>
  );
}

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
    <div className="space-y-5">
      {/* Period & Source Summary Bar */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={sourceBadgeTone} title={report.sourceLabel}>{report.sourceLabel}</StatusBadge>
              {report.hasMultipleCurrencies ? (
                <StatusBadge tone="warning" title="Çalışma alanında birden fazla para birimi var; panel aynı anda bir para birimini gösterir.">
                  Çoklu para birimi
                </StatusBadge>
              ) : null}
              <StatusBadge tone="neutral">{report.period.label}</StatusBadge>
              <StatusBadge tone="neutral">{report.filters.currency}</StatusBadge>
            </div>
            <p className="text-xs text-muted-foreground">
              {report.period.comparisonLabel ? `${report.period.comparisonLabel} ile karşılaştırılıyor.` : "Tüm zamanlar görünümünde karşılaştırma dönemi yok."}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <MiniStat label="Potansiyel Müşteri" value={String(report.metrics.totalLeads)} />
            <MiniStat label="Teklif" value={String(report.metrics.totalQuotes)} />
            <MiniStat label="Ürün" value={String(report.metrics.totalProducts)} />
          </div>
        </div>
      </div>

      <SectionCard title="Çalışma Alanı Özeti" description="Seçili raporlama dönemindeki potansiyel müşteri, ürün ve teklif metrikleri.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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

      <SectionCard title="Teklif Ekonomisi" description="Seçili para birimindeki kalıcı teklif toplamları ve dönüşüm performansı.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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

      <Suspense fallback={<DashboardChartsFallback />}>
        <DashboardCharts revenueSeries={report.revenueSeries} pipeline={report.pipeline} currency={currency} />
      </Suspense>

      <SectionCard title="Teklif Durum Dağılımı" description="Her durumdaki teklif adedi, genel payı ve toplam parasal değeri.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {report.pipeline.map((status) => (
            <div key={status.status} className="rounded-lg border border-border bg-card p-3.5 shadow-xs">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                  <p className="mt-2 text-xl font-bold tracking-tight text-foreground">{status.count}</p>
                </div>
                <span className="text-[11px] font-semibold text-muted-foreground">{status.share.toFixed(1)}%</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground font-medium">{formatCurrency(status.value, currency)}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="En Güçlü Ürünler" description="Teklif satırı anlık görüntülerinden gruplanmış ürün hacimleri.">
          {report.topProducts.length ? (
            <div className="space-y-2.5">
              {report.topProducts.map((product) => (
                <div key={product.key} className="rounded-lg border border-border bg-card p-3 shadow-xs">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{product.name}</p>
                      <p className="text-xs text-muted-foreground">{product.sku ? `SKU: ${product.sku}` : "Özel ürün satırı"}</p>
                    </div>
                    <StatusBadge tone="neutral">{product.currency}</StatusBadge>
                  </div>
                  <div className="mt-2.5 grid grid-cols-3 gap-2 border-t border-border pt-2 text-xs">
                    <StatMini label="Miktar" value={product.quantity.toFixed(2).replace(/\.00$/, "")} />
                    <StatMini label="Teklif Edilen" value={formatCurrency(product.quotedValue, product.currency)} />
                    <StatMini label="Kabul Edilen" value={formatCurrency(product.acceptedValue, product.currency)} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Henüz ürün performansı yok" description="Tekliflerde ürün anlık görüntüleri oluştukça en güçlü ürünler burada listelenir." />
          )}
        </SectionCard>

        <SectionCard title="En Değerli Müşteriler" description="Kabul edilen gelire göre sıralanmış müşteri ve şirket toplamları.">
          {report.topRecipients.length ? (
            <div className="space-y-2.5">
              {report.topRecipients.map((recipient) => (
                <div key={recipient.key} className="rounded-lg border border-border bg-card p-3 shadow-xs">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{recipient.name}</p>
                      <p className="text-xs text-muted-foreground">{recipient.company ?? "Şirket bilgisi yok"}</p>
                    </div>
                    <StatusBadge tone="neutral">{recipient.currency}</StatusBadge>
                  </div>
                  <div className="mt-2.5 grid grid-cols-3 gap-2 border-t border-border pt-2 text-xs">
                    <StatMini label="Kabul Edilen" value={String(recipient.acceptedQuoteCount)} />
                    <StatMini label="Kazanılan Gelir" value={formatCurrency(recipient.acceptedValue, recipient.currency)} />
                    <StatMini label="Toplam Değer" value={formatCurrency(recipient.totalQuoteValue, recipient.currency)} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Raporlanacak müşteri yok" description="Kazanılan teklifler oluştukça kabul edilen gelir burada görünür." />
          )}
        </SectionCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Son Teklifler" description="Seçili para birimi ve dönemdeki en güncel teklif kayıtları.">
          {report.recentQuotes.length ? (
            <div className="space-y-2">
              {report.recentQuotes.map((quote) => (
                <Link
                  key={quote.id}
                  href={quote.href}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs sm:text-sm font-semibold text-foreground">{quote.quoteNumber}</p>
                    <p className="truncate text-xs text-muted-foreground">{quote.recipient}</p>
                    <p className="text-[11px] text-muted-foreground">{formatDateTime(quote.updatedAt)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <StatusBadge tone={getQuoteStatusTone(quote.status)}>{quote.statusLabel}</StatusBadge>
                    <p className="mt-1 text-xs font-bold text-foreground">{formatCurrency(quote.grandTotal, quote.currency)}</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title="Güncel teklif yok" description="Yeni bir teklif oluşturun veya rapor dönemini genişletin." actionHref="/quotes/new" actionLabel="Yeni teklif" />
          )}
        </SectionCard>

        <SectionCard title="Son Potansiyel Müşteriler" description="Çalışma alanına en son eklenen satış adayları.">
          {report.recentLeads.length ? (
            <div className="space-y-2">
              {report.recentLeads.map((lead) => (
                <Link
                  key={lead.id}
                  href={lead.href}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs sm:text-sm font-semibold text-foreground">{lead.fullName}</p>
                    <p className="truncate text-xs text-muted-foreground">{lead.company ?? "Şirket bilgisi yok"}</p>
                    <p className="text-[11px] text-muted-foreground">{formatDateTime(lead.updatedAt)}</p>
                  </div>
                  <StatusBadge tone={getLeadTone(lead.status)}>{lead.statusLabel}</StatusBadge>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title="Güncel potansiyel müşteri yok" description="Yeni adaylar eklendikçe burada listelenir." actionHref="/leads/new" actionLabel="Yeni müşteri adayı" />
          )}
        </SectionCard>
      </div>

      {!report.hasData ? (
        <EmptyState
          title="Bu dönemde panel hareketi yok"
          description="Seçili dönemde potansiyel müşteri, teklif veya ürün bulunmuyor. Daha geniş bir dönem ya da farklı para birimi seçin."
          actionHref="/dashboard"
          actionLabel="Filtreleri sıfırla"
        />
      ) : null}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-right">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-xs sm:text-sm font-bold text-foreground">{value}</p>
    </div>
  );
}

function StatMini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-xs font-semibold text-foreground truncate">{value}</p>
    </div>
  );
}

function getLeadTone(status: string) {
  if (status === "won") return "success";
  if (status === "lost") return "danger";
  if (status === "quote_sent" || status === "negotiation") return "warning";
  if (status === "qualified") return "info";
  return "neutral";
}
