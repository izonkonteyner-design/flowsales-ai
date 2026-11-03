import Link from "next/link";
import { cookies } from "next/headers";
import { FileCheck, FileText, Filter, Plus, ShieldCheck } from "lucide-react";

import { FlashToast } from "@/components/shared/flash-toast";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { MetricCard } from "@/components/shared/metric-card";
import { QuoteDeleteDialog } from "@/components/quotes/quote-delete-dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { QUOTE_STATUSES } from "@/lib/constants";
import { LOCALE_COOKIE, normalizeLocale } from "@/lib/i18n";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  canManageQuotes,
  getQuoteRecordRestrictionMessage,
  normalizeQuoteSearchParams,
  type QuoteFilterState,
} from "@/server/services/quote-domain";
import { getQuotePageData } from "@/server/services/quotes";

type QuotesPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const copy = {
  tr: {
    eyebrow: "Ticari İşlemler & Satış",
    title: "Teklif Yönetimi",
    description: "Katalog fiyatları, iskonto kuralları ve durum takibiyle yapılandırılmış teklifleri yönetin.",
    newQuote: "Yeni Teklif Hazırla",
    results: "Toplam Teklif",
    recordMode: "Çalışma Alanı Modu",
    viewState: "Aktif Durum Filtresi",
    permissions: "Erişim Yetkisi",
    live: "Canlı",
    demo: "Demo",
    all: "Tümü",
    editable: "Düzenlenebilir",
    readOnly: "Yalnızca Okuma",
    tenant: "Organizasyon Kapsamı",
    filters: "Teklif Filtreleri",
    filtersDesc: "Teklif no, müşteri adı veya notlara göre arayın.",
    search: "Arama",
    placeholder: "Teklif No, müşteri adı, şirket...",
    status: "Durum",
    allStatuses: "Tüm Durumlar",
    sort: "Sıralama",
    newest: "En Yeni",
    oldest: "En Eski",
    highest: "En Yüksek Tutar",
    expiring: "Yakında Sona Erecek",
    apply: "Uygula",
    reset: "Sıfırla",
    loadError: "Teklifler yüklenemedi",
    retry: "Yeniden Dene",
    register: "Teklif Defteri",
    registerDesc: "Onaylı, bekleyen ve kabul edilen tüm kurumsal tekliflerin listesi.",
    quote: "Teklif No",
    party: "Müşteri / Alıcı",
    issue: "Tanzim Tarihi",
    validUntil: "Geçerlilik",
    total: "Toplam Tutar",
    actions: "İşlemler",
    unassigned: "Belirtilmedi",
    noCompany: "Şirket Yok",
    noNotes: "Not girilmedi",
    view: "Görüntüle",
    edit: "Düzenle",
    noQuotes: "Henüz teklif bulunmuyor",
    noQuotesDesc: "Müşterilere fiyat sunmak için ilk teklif taslağını oluşturun.",
    previous: "Önceki",
    next: "Sonraki",
    page: "Sayfa",
    of: "/",
    quotes: "teklif",
    liveRecord: "Canlı",
    demoRecord: "Demo",
  },
  en: {
    eyebrow: "Commercial Operations",
    title: "Quote Management",
    description: "Create and track commercial proposals with catalog pricing, discounts, and approval policies.",
    newQuote: "Create Quote",
    results: "Total Quotes",
    recordMode: "Workspace Mode",
    viewState: "Active Status Filter",
    permissions: "Permissions",
    live: "Live",
    demo: "Demo",
    all: "All",
    editable: "Editable",
    readOnly: "Read Only",
    tenant: "Tenant scoped",
    filters: "Quote Filters",
    filtersDesc: "Search by quote number, recipient, company, or commercial terms.",
    search: "Search",
    placeholder: "Quote number, recipient, company...",
    status: "Status",
    allStatuses: "All statuses",
    sort: "Sort",
    newest: "Newest",
    oldest: "Oldest",
    highest: "Highest Total",
    expiring: "Expiring Soon",
    apply: "Apply",
    reset: "Reset",
    loadError: "Unable to load quotes",
    retry: "Retry",
    register: "Quote Directory",
    registerDesc: "Complete operational directory of draft, sent, and accepted commercial offers.",
    quote: "Quote #",
    party: "Recipient",
    issue: "Issued",
    validUntil: "Valid Until",
    total: "Grand Total",
    actions: "Actions",
    unassigned: "Unassigned",
    noCompany: "No company",
    noNotes: "No notes provided",
    view: "View",
    edit: "Edit",
    noQuotes: "No quotes yet",
    noQuotesDesc: "Create the first offer to see quote history and totals appear.",
    previous: "Previous",
    next: "Next",
    page: "Page",
    of: "of",
    quotes: "quotes",
    liveRecord: "Live",
    demoRecord: "Demo",
  },
} as const;

const trStatus: Record<string, string> = {
  draft: "Taslak",
  sent: "Gönderildi",
  viewed: "Görüntülendi",
  accepted: "Kabul Edildi",
  rejected: "Reddedildi",
  expired: "Süresi Doldu",
  cancelled: "İptal Edildi",
};

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
  const toastTone =
    rawSearchParams.tone === "danger" || rawSearchParams.tone === "warning" || rawSearchParams.tone === "info"
      ? rawSearchParams.tone
      : "success";
  const currentHref = buildQuoteHref(filters);
  const createHref = `/quotes/new?redirect_to=${encodeURIComponent(currentHref)}`;
  const hasFilters = Boolean(filters.query || filters.status || filters.sort !== "newest" || filters.pageSize !== 8);
  const statusLabel = (value: string, fallback: string) => (locale === "tr" ? trStatus[value] ?? fallback : fallback);

  return (
    <div className="space-y-5">
      {toastMessage ? <FlashToast message={toastMessage} tone={toastTone} /> : null}

      <PageHeader
        eyebrow={c.eyebrow}
        title={c.title}
        description={c.description}
        actions={
          <Link
            href={createHref}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            {c.newQuote}
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label={c.results}
          value={String(data.total)}
          delta={data.totalPages > 1 ? `${c.page} ${data.page} ${c.of} ${data.totalPages}` : undefined}
          icon={FileText}
          tone="blue"
        />
        <MetricCard
          label={c.recordMode}
          value={data.context.mode === "live" ? c.live : c.demo}
          delta={data.context.role}
          icon={ShieldCheck}
          tone="emerald"
        />
        <MetricCard
          label={c.viewState}
          value={filters.status ? statusLabel(filters.status, filters.status) : c.all}
          delta={filters.sort}
          icon={Filter}
          tone="amber"
        />
        <MetricCard
          label={c.permissions}
          value={canManageQuotes(data.context.role) ? c.editable : c.readOnly}
          delta={c.tenant}
          icon={FileCheck}
          tone="violet"
        />
      </div>

      <SectionCard title={c.filters} description={c.filtersDesc}>
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-end">
          <input type="hidden" name="page" value="1" />
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{c.search}</span>
            <Input name="query" defaultValue={filters.query} placeholder={c.placeholder} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{c.status}</span>
            <Select name="status" defaultValue={filters.status}>
              <option value="">{c.allStatuses}</option>
              {QUOTE_STATUSES.map((status) => (
                <option key={status.value} value={status.value}>
                  {statusLabel(status.value, status.label)}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{c.sort}</span>
            <Select name="sort" defaultValue={filters.sort}>
              <option value="newest">{c.newest}</option>
              <option value="oldest">{c.oldest}</option>
              <option value="total">{c.highest}</option>
              <option value="expiring">{c.expiring}</option>
            </Select>
          </label>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="inline-flex h-9 flex-1 items-center justify-center rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-colors"
            >
              {c.apply}
            </button>
            {hasFilters ? (
              <Link
                href="/quotes"
                className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-3 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                {c.reset}
              </Link>
            ) : null}
          </div>
        </form>
      </SectionCard>

      {data.error ? (
        <EmptyState title={c.loadError} description={data.error} actionHref="/quotes" actionLabel={c.retry} />
      ) : data.quotes.length ? (
        <SectionCard title={c.register} description={c.registerDesc}>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-muted/50 font-semibold text-muted-foreground">
                <tr>
                  <th className="px-3.5 py-2.5">{c.quote}</th>
                  <th className="px-3 py-2.5">{c.party}</th>
                  <th className="px-3 py-2.5">{c.status}</th>
                  <th className="px-3 py-2.5">{c.issue}</th>
                  <th className="px-3 py-2.5">{c.validUntil}</th>
                  <th className="px-3 py-2.5">{c.total}</th>
                  <th className="px-3.5 py-2.5 text-right">{c.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.quotes.map((quote) => {
                  const restriction = getQuoteRecordRestrictionMessage(quote.recordMode, data.context.role);
                  const canEdit = canManageQuotes(data.context.role) && quote.recordMode === "live";
                  const partyLabel = quote.lead_name ?? quote.customer_name ?? c.unassigned;
                  const partySub = quote.lead_company ?? quote.customer_company ?? c.noCompany;
                  const recordLabel = quote.recordMode === "live" ? c.liveRecord : c.demoRecord;
                  const localizedRestriction =
                    locale === "tr" && restriction
                      ? "Bu teklif rolünüz veya kayıt türü nedeniyle düzenlenemez."
                      : restriction;

                  return (
                    <tr key={quote.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3.5 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <Link
                            href={`/quotes/${quote.id}`}
                            className="font-bold text-foreground hover:underline font-mono"
                          >
                            {quote.quote_number}
                          </Link>
                          <StatusBadge tone={quote.record_badge.tone} title={quote.record_badge.title}>
                            {recordLabel}
                          </StatusBadge>
                        </div>
                      </td>

                      <td className="px-3 py-2.5">
                        <p className="font-semibold text-foreground">{partyLabel}</p>
                        <p className="text-[11px] text-muted-foreground">{partySub}</p>
                      </td>

                      <td className="px-3 py-2.5">
                        <StatusBadge tone={quote.status_tone}>
                          {statusLabel(quote.status, quote.status_label)}
                        </StatusBadge>
                      </td>

                      <td className="px-3 py-2.5 text-muted-foreground text-[11px]">
                        {formatDate(quote.issue_date)}
                      </td>

                      <td className="px-3 py-2.5 text-muted-foreground text-[11px]">
                        {formatDate(quote.valid_until ?? quote.expiry_date ?? quote.issue_date)}
                      </td>

                      <td className="px-3 py-2.5 font-bold text-foreground">
                        {formatCurrency(quote.grand_total ?? quote.total ?? 0, quote.currency)}
                      </td>

                      <td className="px-3.5 py-2.5 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <Link
                            href={`/quotes/${quote.id}`}
                            className="inline-flex h-7 items-center rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                          >
                            {c.view}
                          </Link>
                          {canEdit ? (
                            <Link
                              href={`/quotes/${quote.id}/edit?redirect_to=${encodeURIComponent(currentHref)}`}
                              className="inline-flex h-7 items-center rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                            >
                              {c.edit}
                            </Link>
                          ) : (
                            <span
                              title={localizedRestriction}
                              className="inline-flex h-7 items-center rounded-md border border-border bg-background px-2 text-xs font-medium text-muted-foreground opacity-50 cursor-not-allowed"
                            >
                              {c.edit}
                            </span>
                          )}
                          <QuoteDeleteDialog
                            quoteId={quote.id}
                            quoteNumber={quote.quote_number}
                            redirectTo={currentHref}
                            recordMode={quote.recordMode}
                            role={data.context.role}
                            restrictionMessage={localizedRestriction}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      ) : (
        <EmptyState
          title={c.noQuotes}
          description={c.noQuotesDesc}
          actionHref={createHref}
          actionLabel={c.newQuote}
        />
      )}

      {data.totalPages > 1 ? (
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
          <span>
            {c.page} {data.page} {c.of} {data.totalPages} · {data.total} {c.quotes}
          </span>
          <div className="flex items-center gap-1.5">
            <Nav
              href={buildQuoteHref(filters, { page: Math.max(1, data.page - 1) })}
              disabled={data.page === 1}
            >
              {c.previous}
            </Nav>
            <Nav
              href={buildQuoteHref(filters, { page: Math.min(data.totalPages, data.page + 1) })}
              disabled={data.page === data.totalPages}
            >
              {c.next}
            </Nav>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Nav({
  href,
  children,
  disabled,
}: {
  href: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-disabled={disabled}
      className={`inline-flex h-7 items-center justify-center rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-muted transition-colors ${
        disabled ? "pointer-events-none opacity-40" : ""
      }`}
    >
      {children}
    </Link>
  );
}
