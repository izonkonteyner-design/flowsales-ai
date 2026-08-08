import Link from "next/link";
import { cookies } from "next/headers";
import { BadgeCheck, CalendarClock, Coins, LayoutGrid, Users2 } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { LOCALE_COOKIE, normalizeLocale } from "@/lib/i18n";
import { getCustomerPageData } from "@/server/services/customers";
import { getCustomerRecordInfo, getCustomerRestrictionMessage } from "@/server/services/customers";

const copy = {
  tr: {
    title: "Müşteriler",
    description: "Dönüşen hesapları, kaynak potansiyel müşterileri ve teklif geçmişini tek yerde yönetin.",
    convert: "Potansiyel müşteriyi dönüştür",
    customers: "Müşteriler",
    converted: "Dönüşen potansiyel müşteriler",
    linked: "Bağlı kaynak kayıtları",
    customerValue: "Müşteri değeri",
    derived: "Tekliflerden ve çalışma alanı verilerinden hesaplanır",
    reviews: "Yaklaşan değerlendirmeler",
    milestones: "Sonraki değerlendirme tarihleri",
    live: "Canlı çalışma alanı",
    demo: "Demo çalışma alanı",
    loadError: "Müşteriler yüklenemedi",
    back: "Potansiyel müşterilere dön",
    accounts: "Müşteri hesapları",
    accountsDesc: "Kaynak potansiyel müşteri ve teklif bağlamı bulunan dönüştürülmüş müşteri kayıtları.",
    noCompany: "Şirket yok",
    noCity: "Şehir yok",
    quotes: "teklif",
    email: "E-posta",
    phone: "Telefon",
    sourceLead: "Kaynak potansiyel müşteri",
    lastQuote: "Son teklif",
    notSet: "Belirtilmedi",
    noLinked: "Bağlı potansiyel müşteri yok",
    noQuote: "Henüz teklif yok",
    empty: "Henüz müşteri yok",
    emptyDesc: "İlk canlı müşteri kaydını oluşturmak için nitelikli bir potansiyel müşteriyi dönüştürün.",
    openLeads: "Potansiyel müşterileri aç",
    liveRecord: "Canlı kayıt",
    demoRecord: "Demo kayıt",
  },
  en: {
    title: "Customers",
    description: "Track converted accounts, source leads, and quote history in one place.",
    convert: "Convert a lead",
    customers: "Customers",
    converted: "Converted leads",
    linked: "Linked source records",
    customerValue: "Customer value",
    derived: "Derived from quotes and workspace data",
    reviews: "Reviews due",
    milestones: "Next review milestones",
    live: "Live workspace",
    demo: "Demo workspace",
    loadError: "Unable to load customers",
    back: "Back to leads",
    accounts: "Accounts",
    accountsDesc: "Converted customer records with source-lead and quote context.",
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
    openLeads: "Open leads",
    liveRecord: "Live record",
    demoRecord: "Demo record",
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
    <div className="space-y-6">
      <PageHeader
        eyebrow="CRM"
        title={c.title}
        description={c.description}
        actions={<Link href="/leads" className="inline-flex h-10 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950"><Users2 className="h-4 w-4" />{c.convert}</Link>}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label={c.customers} value={String(data.total)} delta={data.context.mode === "live" ? c.live : c.demo} icon={LayoutGrid} />
        <Metric label={c.converted} value={String(convertedCount)} delta={c.linked} icon={BadgeCheck} />
        <Metric label={c.customerValue} value={formatCurrency(totalValue, data.context.organization.currency)} delta={c.derived} icon={Coins} />
        <Metric label={c.reviews} value={String(recentReviews)} delta={c.milestones} icon={CalendarClock} />
      </div>

      {data.error ? (
        <EmptyState title={c.loadError} description={data.error} actionHref="/leads" actionLabel={c.back} />
      ) : data.customers.length ? (
        <SectionCard title={c.accounts} description={c.accountsDesc}>
          <div className="space-y-3">
            {data.customers.map((customer) => {
              const recordInfo = getCustomerRecordInfo(customer.recordMode);
              return (
                <article key={customer.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/customers/${customer.id}`} className="font-medium text-slate-950 underline-offset-4 hover:underline dark:text-white">{customer.name}</Link>
                        <StatusBadge tone={recordInfo.tone} title={recordInfo.title}>{customer.recordMode === "live" ? c.liveRecord : c.demoRecord}</StatusBadge>
                        <Badge variant="secondary">{customer.segment}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{customer.company || c.noCompany}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">{customer.city || c.noCity}</Badge>
                      <Badge variant="secondary">{formatCurrency(customer.lifetime_value, data.context.organization.currency)}</Badge>
                      <Badge variant="secondary">{customer.quote_count ?? 0} {c.quotes}</Badge>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 text-sm text-slate-600 dark:text-slate-400 sm:grid-cols-4">
                    <Info label={c.email} value={customer.email || c.notSet} />
                    <Info label={c.phone} value={customer.phone || c.notSet} />
                    <Info label={c.sourceLead} value={customer.source_lead_name ?? c.noLinked} />
                    <Info label={c.lastQuote} value={customer.last_quote_at ? formatDateTime(customer.last_quote_at) : c.noQuote} />
                  </div>
                </article>
              );
            })}
          </div>
          {restriction ? <p className="mt-4 text-xs leading-5 text-slate-500 dark:text-slate-400">{locale === "tr" ? "Bu çalışma alanında bazı müşteri işlemleri rol veya kayıt türü nedeniyle sınırlandırılmıştır." : restriction}</p> : null}
        </SectionCard>
      ) : (
        <EmptyState title={c.empty} description={c.emptyDesc} actionHref="/leads" actionLabel={c.openLeads} />
      )}
    </div>
  );
}

function Metric({ label, value, delta, icon: Icon }: { label: string; value: string; delta: string; icon: typeof LayoutGrid }) {
  return <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-slate-950/60"><div className="flex items-center justify-between gap-3"><p className="text-sm text-slate-500">{label}</p><Icon className="h-4 w-4 text-slate-300" /></div><p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{value}</p><p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">{delta}</p></div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-slate-950/40"><p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p><p className="mt-1 truncate text-sm text-slate-700 dark:text-slate-300">{value}</p></div>;
}
