import Link from "next/link";
import { cookies } from "next/headers";
import { Filter, Plus } from "lucide-react";

import { FlashToast } from "@/components/shared/flash-toast";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { QuoteDeleteDialog } from "@/components/quotes/quote-delete-dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { QUOTE_STATUSES } from "@/lib/constants";
import { LOCALE_COOKIE, normalizeLocale } from "@/lib/i18n";
import { formatCurrency, formatDate } from "@/lib/utils";
import { canManageQuotes, getQuoteRecordRestrictionMessage, normalizeQuoteSearchParams, type QuoteFilterState } from "@/server/services/quote-domain";
import { getQuotePageData } from "@/server/services/quotes";

type QuotesPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const copy = {
  tr: {
    eyebrow: "Ticari", title: "Teklifler", description: "Canlı fiyatlandırma, durum takibi ve güvenli yetkilerle yapılandırılmış teklifleri yönetin.", newQuote: "Yeni teklif",
    results: "Sonuçlar", recordMode: "Kayıt modu", viewState: "Görünüm", permissions: "Yetkiler", live: "Canlı", demo: "Demo", all: "Tümü", editable: "Düzenlenebilir", readOnly: "Salt okunur", tenant: "Çalışma alanı sınırında",
    filters: "Teklif filtreleri", filtersDesc: "Teklif numarası, potansiyel müşteri, müşteri veya notlarda arayın.", search: "Ara", placeholder: "Numara, potansiyel müşteri, müşteri, not", status: "Durum", allStatuses: "Tüm durumlar", sort: "Sırala", newest: "En yeni", oldest: "En eski", highest: "En yüksek toplam", expiring: "Yakında sona erecek", apply: "Uygula", reset: "Sıfırla",
    loadError: "Teklifler yüklenemedi", retry: "Yeniden dene", register: "Teklif listesi", registerDesc: "Her teklif veri kaynağını ve güvenli işlem sınırını korur.", quote: "Teklif", party: "İlgili kişi", issue: "Düzenleme", validUntil: "Geçerlilik", total: "Toplam", actions: "İşlemler", unassigned: "Atanmamış", noCompany: "Şirket yok", noNotes: "Not girilmedi", view: "Görüntüle", edit: "Düzenle", noQuotes: "Henüz teklif yok", noQuotesDesc: "Teklif geçmişi ve tutarlarını görmek için ilk teklifi oluşturun.", previous: "Önceki", next: "Sonraki", page: "Sayfa", of: "/", quotes: "teklif", liveRecord: "Canlı kayıt", demoRecord: "Demo kayıt",
  },
  en: {
    eyebrow: "Commercial", title: "Quotes", description: "Create and manage structured offers with live pricing, status tracking, and safe permissions.", newQuote: "New quote",
    results: "Results", recordMode: "Record mode", viewState: "View state", permissions: "Permissions", live: "Live", demo: "Demo", all: "All", editable: "Editable", readOnly: "Read only", tenant: "Tenant scoped",
    filters: "Quote filters", filtersDesc: "Search by quote number, lead, customer, or commercial notes.", search: "Search", placeholder: "Number, lead, customer, notes", status: "Status", allStatuses: "All statuses", sort: "Sort", newest: "Newest", oldest: "Oldest", highest: "Highest total", expiring: "Expiring soon", apply: "Apply", reset: "Reset",
    loadError: "Unable to load quotes", retry: "Retry", register: "Quote register", registerDesc: "Each quote keeps a live data badge and a strict mutation boundary.", quote: "Quote", party: "Party", issue: "Issue", validUntil: "Valid until", total: "Total", actions: "Actions", unassigned: "Unassigned", noCompany: "No company", noNotes: "No notes provided", view: "View", edit: "Edit", noQuotes: "No quotes yet", noQuotesDesc: "Create the first offer to see quote history and totals appear.", previous: "Previous", next: "Next", page: "Page", of: "of", quotes: "quotes", liveRecord: "Live record", demoRecord: "Demo record",
  },
} as const;

const trStatus: Record<string, string> = { draft: "Taslak", sent: "Gönderildi", viewed: "Görüntülendi", accepted: "Kabul edildi", rejected: "Reddedildi", expired: "Süresi doldu", cancelled: "İptal edildi" };

function buildQuoteHref(filters: QuoteFilterState, overrides: Partial<QuoteFilterState> = {}) {
  const merged = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (merged.query) params.set("query", merged.query);
  if (merged.status) params.set("status", merged.status);
  if (merged.sort !== "newest") params.set("sort", merged.sort);
  if (merged.page > 1) params.set("page", String(merged.page));
  if (merged.pageSize !== 8) params.set("pageSize", String(merged.pageSize));
  const query = params.toString();
  return query ? `/quotes?${query}` : "/quotes";
}

export default async function QuotesPage({ searchParams }: QuotesPageProps) {
  const rawSearchParams = await searchParams;
  const data = await getQuotePageData(rawSearchParams);
  const filters = normalizeQuoteSearchParams(rawSearchParams);
  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get(LOCALE_COOKIE)?.value);
  const c = copy[locale];
  const toastMessage = typeof rawSearchParams.toast === "string" ? rawSearchParams.toast : "";
  const toastTone = rawSearchParams.tone === "danger" || rawSearchParams.tone === "warning" || rawSearchParams.tone === "info" ? rawSearchParams.tone : "success";
  const currentHref = buildQuoteHref(filters);
  const createHref = `/quotes/new?redirect_to=${encodeURIComponent(currentHref)}`;
  const hasFilters = Boolean(filters.query || filters.status || filters.sort !== "newest" || filters.pageSize !== 8);
  const statusLabel = (value: string, fallback: string) => locale === "tr" ? trStatus[value] ?? fallback : fallback;

  return (
    <div className="space-y-6">
      {toastMessage ? <FlashToast message={toastMessage} tone={toastTone} /> : null}
      <PageHeader eyebrow={c.eyebrow} title={c.title} description={c.description} actions={<Link href={createHref} className="inline-flex h-10 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950"><Plus className="h-4 w-4" />{c.newQuote}</Link>} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label={c.results} value={String(data.total)} delta={data.totalPages > 1 ? `${c.page} ${data.page} ${c.of} ${data.totalPages}` : c.page} />
        <Metric label={c.recordMode} value={data.context.mode === "live" ? c.live : c.demo} delta={data.context.role} />
        <Metric label={c.viewState} value={filters.status ? statusLabel(filters.status, filters.status) : c.all} delta={filters.sort} />
        <Metric label={c.permissions} value={canManageQuotes(data.context.role) ? c.editable : c.readOnly} delta={c.tenant} />
      </div>

      <SectionCard title={c.filters} description={c.filtersDesc}>
        <form method="get" className="grid gap-3 xl:grid-cols-[1.8fr_0.8fr_0.8fr_auto]">
          <input type="hidden" name="page" value="1" />
          <label className="space-y-2"><span className="text-sm font-medium text-slate-700 dark:text-slate-300">{c.search}</span><Input name="query" defaultValue={filters.query} placeholder={c.placeholder} /></label>
          <label className="space-y-2"><span className="text-sm font-medium text-slate-700 dark:text-slate-300">{c.status}</span><Select name="status" defaultValue={filters.status}><option value="">{c.allStatuses}</option>{QUOTE_STATUSES.map((status) => <option key={status.value} value={status.value}>{statusLabel(status.value, status.label)}</option>)}</Select></label>
          <label className="space-y-2"><span className="text-sm font-medium text-slate-700 dark:text-slate-300">{c.sort}</span><Select name="sort" defaultValue={filters.sort}><option value="newest">{c.newest}</option><option value="oldest">{c.oldest}</option><option value="total">{c.highest}</option><option value="expiring">{c.expiring}</option></Select></label>
          <div className="flex items-end gap-3"><button type="submit" className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950">{c.apply}</button>{hasFilters ? <Link href="/quotes" className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10">{c.reset}</Link> : null}</div>
        </form>
      </SectionCard>

      {data.error ? <EmptyState title={c.loadError} description={data.error} actionHref="/quotes" actionLabel={c.retry} /> : data.quotes.length ? (
        <SectionCard title={c.register} description={c.registerDesc}>
          <div className="space-y-3">
            {data.quotes.map((quote) => {
              const restriction = getQuoteRecordRestrictionMessage(quote.recordMode, data.context.role);
              const canEdit = canManageQuotes(data.context.role) && quote.recordMode === "live";
              const partyLabel = quote.lead_name ?? quote.customer_name ?? c.unassigned;
              const partySub = quote.lead_company ?? quote.customer_company ?? c.noCompany;
              const recordLabel = quote.recordMode === "live" ? c.liveRecord : c.demoRecord;
              const localizedRestriction = locale === "tr" && restriction ? "Bu teklif rolünüz veya kayıt türü nedeniyle düzenlenemez." : restriction;
              return (
                <article key={quote.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><Link href={`/quotes/${quote.id}`} className="font-semibold text-slate-950 underline-offset-4 hover:underline dark:text-white">{quote.quote_number}</Link><StatusBadge tone={quote.status_tone}>{statusLabel(quote.status, quote.status_label)}</StatusBadge><StatusBadge tone={quote.record_badge.tone} title={quote.record_badge.title}>{recordLabel}</StatusBadge></div>
                      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{partyLabel} · {partySub}</p><p className="mt-1 text-sm text-slate-500">{quote.notes || c.noNotes}</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[440px]"><Mini label={c.issue} value={formatDate(quote.issue_date)} /><Mini label={c.validUntil} value={formatDate(quote.valid_until ?? quote.expiry_date ?? quote.issue_date)} /><Mini label={c.total} value={formatCurrency(quote.grand_total ?? quote.total ?? 0, quote.currency)} /></div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2"><Link href={`/quotes/${quote.id}`} className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">{c.view}</Link>{canEdit ? <Link href={`/quotes/${quote.id}/edit?redirect_to=${encodeURIComponent(currentHref)}`} className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">{c.edit}</Link> : <span title={localizedRestriction} className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">{c.edit}</span>}<QuoteDeleteDialog quoteId={quote.id} quoteNumber={quote.quote_number} redirectTo={currentHref} recordMode={quote.recordMode} role={data.context.role} restrictionMessage={localizedRestriction} /></div>
                </article>
              );
            })}
          </div>
        </SectionCard>
      ) : <EmptyState title={c.noQuotes} description={c.noQuotesDesc} actionHref={createHref} actionLabel={c.newQuote} />}

      {data.totalPages > 1 ? <SectionCard><div className="flex items-center justify-between gap-3"><p className="text-sm text-slate-500">{c.page} {data.page} {c.of} {data.totalPages} · {data.total} {c.quotes}</p><div className="flex gap-2"><Nav href={buildQuoteHref(filters, { page: Math.max(1, data.page - 1) })} disabled={data.page === 1}>{c.previous}</Nav><Nav href={buildQuoteHref(filters, { page: Math.min(data.totalPages, data.page + 1) })} disabled={data.page === data.totalPages}>{c.next}</Nav></div></div></SectionCard> : null}
    </div>
  );
}

function Metric({ label, value, delta }: { label: string; value: string; delta: string }) { return <div className="rounded-3xl border border-slate-200/80 bg-white p-5 dark:border-white/10 dark:bg-slate-950/60"><div className="flex items-center justify-between"><p className="text-sm text-slate-500">{label}</p><Filter className="h-4 w-4 text-slate-300" /></div><p className="mt-3 text-2xl font-semibold text-slate-950 dark:text-white">{value}</p><p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">{delta}</p></div>; }
function Mini({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-slate-950/40"><p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p><p className="mt-1 text-sm font-medium text-slate-950 dark:text-white">{value}</p></div>; }
function Nav({ href, children, disabled }: { href: string; children: React.ReactNode; disabled?: boolean }) { return <Link href={href} aria-disabled={disabled} className={`inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 ${disabled ? "pointer-events-none opacity-50" : ""}`}>{children}</Link>; }
