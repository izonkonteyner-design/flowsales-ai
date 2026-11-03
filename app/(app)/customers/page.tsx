import Link from "next/link";
import { cookies } from "next/headers";
import { BadgeCheck, CalendarClock, Coins, LayoutGrid, Users2 } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { MetricCard } from "@/components/shared/metric-card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { LOCALE_COOKIE, normalizeLocale } from "@/lib/i18n";
import { getCustomerPageData } from "@/server/services/customers";
import { getCustomerRecordInfo, getCustomerRestrictionMessage } from "@/server/services/customers";

const copy = {
  tr: {
    title: "Müşteri Fihristi",
    description: "Kayıtlı müşterileri, bağlı satış fırsatlarını ve teklif geçmişini yönetin.",
    convert: "Adayı Müşteriye Dönüştür",
    customers: "Toplam Müşteri",
    converted: "Dönüşen Adaylar",
    linked: "Bağlı Kaynak Kayıtları",
    customerValue: "Toplam Müşteri Değeri",
    derived: "Kazanılan Tekliflerden",
    reviews: "Planlanan Değerlendirmeler",
    milestones: "Takip Edilen Hesaplar",
    live: "Canlı Organizasyon",
    demo: "Demo Organizasyon",
    loadError: "Müşteri verileri yüklenemedi",
    back: "Adaylara Dön",
    accounts: "Kayıtlı Müşteri Hesapları",
    accountsDesc: "Aday geçmişi ve teklif bağlamı bulunan doğrulanmış kurumsal müşteri kayıtları.",
    noCompany: "Şirket Yok",
    noCity: "Şehir Yok",
    quotes: "Teklif",
    email: "E-posta",
    phone: "Telefon",
    sourceLead: "Kaynak Aday",
    lastQuote: "Son Teklif",
    notSet: "Belirtilmedi",
    noLinked: "Bağlı aday yok",
    noQuote: "Henüz teklif yok",
    empty: "Henüz müşteri kaydı bulunmuyor",
    emptyDesc: "İlk müşteri kaydını oluşturmak için bir müşteri adayını müşteriye dönüştürün.",
    openLeads: "Adayları Aç",
    liveRecord: "Canlı",
    demoRecord: "Demo",
  },
  en: {
    title: "Customers",
    description: "Track converted accounts, source leads, and quote history in one place.",
    convert: "Convert a Lead",
    customers: "Total Customers",
    converted: "Converted Leads",
    linked: "Linked source records",
    customerValue: "Customer Lifetime Value",
    derived: "Derived from accepted quotes",
    reviews: "Reviews Due",
    milestones: "Active review milestones",
    live: "Live organization",
    demo: "Demo organization",
    loadError: "Unable to load customers",
    back: "Back to leads",
    accounts: "Customer Directory",
    accountsDesc: "Verified customer accounts with full CRM and quote history.",
    noCompany: "No company",
    noCity: "No city",
    quotes: "quotes",
    email: "Email",
    phone: "Phone",
    sourceLead: "Source lead",
    lastQuote: "Last quote",
    notSet: "Not set",
    noLinked: "No linked lead",
    noQuote: "No quote yet",
    empty: "No customers yet",
    emptyDesc: "Convert a qualified lead to create the first live customer record.",
    openLeads: "Open Leads",
    liveRecord: "Live",
    demoRecord: "Demo",
  },
} as const;

export default async function CustomersPage() {
  const data = await getCustomerPageData();
  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get(LOCALE_COOKIE)?.value);
  const c = copy[locale];
  const totalValue = data.customers.reduce((sum, customer) => sum + Number(customer.lifetime_value ?? 0), 0);
  const convertedCount = data.customers.filter((customer) => customer.source_lead_id).length;
  const recentReviews = data.customers.filter((customer) => customer.next_review_at).length;
  const liveMode = data.context.mode === "live";
  const restriction = getCustomerRestrictionMessage(liveMode ? "live" : "demo", data.context.role);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="CRM & Müşteri Yönetimi"
        title={c.title}
        description={c.description}
        actions={
          <Link
            href="/leads"
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-colors"
          >
            <Users2 className="h-3.5 w-3.5" />
            {c.convert}
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label={c.customers}
          value={String(data.total)}
          delta={data.context.mode === "live" ? c.live : c.demo}
          icon={LayoutGrid}
          tone="blue"
        />
        <MetricCard
          label={c.converted}
          value={String(convertedCount)}
          delta={c.linked}
          icon={BadgeCheck}
          tone="emerald"
        />
        <MetricCard
          label={c.customerValue}
          value={formatCurrency(totalValue, data.context.organization.currency)}
          delta={c.derived}
          icon={Coins}
          tone="amber"
        />
        <MetricCard
          label={c.reviews}
          value={String(recentReviews)}
          delta={c.milestones}
          icon={CalendarClock}
          tone="violet"
        />
      </div>

      {data.error ? (
        <EmptyState title={c.loadError} description={data.error} actionHref="/leads" actionLabel={c.back} />
      ) : data.customers.length ? (
        <SectionCard title={c.accounts} description={c.accountsDesc}>
          <div className="space-y-3">
            {data.customers.map((customer) => {
              const recordInfo = getCustomerRecordInfo(customer.recordMode);
              return (
                <article
                  key={customer.id}
                  className="rounded-lg border border-border bg-card p-3.5 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/customers/${customer.id}`}
                          className="font-bold text-sm text-foreground hover:underline"
                        >
                          {customer.name}
                        </Link>
                        <StatusBadge tone={recordInfo.tone} title={recordInfo.title}>
                          {customer.recordMode === "live" ? c.liveRecord : c.demoRecord}
                        </StatusBadge>
                        <Badge variant="secondary">{customer.segment}</Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{customer.company || c.noCompany}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline">{customer.city || c.noCity}</Badge>
                      <Badge variant="outline">
                        {formatCurrency(customer.lifetime_value, data.context.organization.currency)}
                      </Badge>
                      <Badge variant="secondary">
                        {customer.quote_count ?? 0} {c.quotes}
                      </Badge>
                      <Link
                        href={`/customers/${customer.id}`}
                        className="inline-flex h-7 items-center rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-muted transition-colors ml-1"
                      >
                        Görüntüle
                      </Link>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-4 border-t border-border pt-2.5">
                    <Info label={c.email} value={customer.email || c.notSet} />
                    <Info label={c.phone} value={customer.phone || c.notSet} />
                    <Info label={c.sourceLead} value={customer.source_lead_name ?? c.noLinked} />
                    <Info label={c.lastQuote} value={customer.last_quote_at ? formatDateTime(customer.last_quote_at) : c.noQuote} />
                  </div>
                </article>
              );
            })}
          </div>

          {restriction ? (
            <p className="mt-3 text-xs text-muted-foreground">
              {locale === "tr"
                ? "Bu çalışma alanında bazı müşteri işlemleri rol veya kayıt türü nedeniyle sınırlandırılmıştır."
                : restriction}
            </p>
          ) : null}
        </SectionCard>
      ) : (
        <EmptyState title={c.empty} description={c.emptyDesc} actionHref="/leads" actionLabel={c.openLeads} />
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 px-2.5 py-1.5">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <p className="mt-0.5 truncate text-xs font-semibold text-foreground">{value}</p>
    </div>
  );
}
