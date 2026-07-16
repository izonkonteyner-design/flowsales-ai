import Link from "next/link";
import { Plus } from "lucide-react";

import { FlashToast } from "@/components/shared/flash-toast";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getQuotePageData } from "@/server/services/quotes";
import {
  getQuoteRecordBadge,
  getQuoteRecordRestrictionMessage,
  getQuoteStatusInfo,
  normalizeQuoteSearchParams,
  type QuoteFilterState,
} from "@/server/services/quote-domain";

type QuotesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function buildQuoteHref(filters: QuoteFilterState, overrides: Partial<QuoteFilterState> = {}) {
  const merged = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (merged.query) params.set("query", merged.query);
  if (merged.status) params.set("status", merged.status);
  if (merged.sort !== "newest") params.set("sort", merged.sort);
  const query = params.toString();
  return query ? `/quotes?${query}` : "/quotes";
}

export default async function QuotesPage({ searchParams }: QuotesPageProps) {
  const rawSearchParams = await searchParams;
  const data = await getQuotePageData(rawSearchParams);
  const filters = normalizeQuoteSearchParams(rawSearchParams);
  const toastMessage = typeof rawSearchParams.toast === "string" ? rawSearchParams.toast : "";
  const toastTone =
    rawSearchParams.tone === "danger" || rawSearchParams.tone === "warning" || rawSearchParams.tone === "info"
      ? rawSearchParams.tone
      : "success";
  const currentHref = buildQuoteHref(filters);
  const createHref = `/quotes/new?redirect_to=${encodeURIComponent(currentHref)}`;

  return (
    <div className="space-y-6">
      {toastMessage ? <FlashToast message={toastMessage} tone={toastTone} /> : null}

      <PageHeader
        eyebrow="Commercial"
        title="Quotes"
        description="Create professional offers with products, taxes, and payment terms."
        actions={
          <Link href={createHref} className="inline-flex h-10 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950">
            <Plus className="h-4 w-4" />
            New quote
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Total quotes" value={String(data.total)} />
        <Metric label="Draft" value={String(data.quotes.filter((quote) => quote.status === "draft").length)} />
        <Metric label="Sent" value={String(data.quotes.filter((quote) => quote.status === "sent" || quote.status === "viewed").length)} />
        <Metric label="Accepted" value={String(data.quotes.filter((quote) => quote.status === "accepted").length)} />
      </div>

      <SectionCard title="Quote filters" description="Search by quote number, customer, lead, or notes.">
        <form method="get" className="grid gap-3 xl:grid-cols-[1.8fr_0.8fr_0.8fr_auto]">
          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Search</span>
            <Input name="query" defaultValue={data.filters.query} placeholder="Quote number, customer, lead" />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Status</span>
            <Select name="status" defaultValue={data.filters.status}>
              <option value="">All</option>
              {["draft", "sent", "viewed", "accepted", "rejected", "expired", "cancelled"].map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </Select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Sort</span>
            <Select name="sort" defaultValue={data.filters.sort}>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="value">Value</option>
            </Select>
          </label>

          <div className="flex items-end gap-3">
            <button type="submit" className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950">
              Apply
            </button>
            <Link href="/quotes" className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10">
              Reset
            </Link>
          </div>
        </form>
      </SectionCard>

      {data.error ? (
        <EmptyState title="Unable to load live quotes" description={data.error} actionHref="/quotes" actionLabel="Retry" />
      ) : data.quotes.length ? (
        <SectionCard title="Quote register" description="Track quote status, customer linkage, and expiration dates.">
          <div className="overflow-hidden rounded-3xl border border-slate-200 dark:border-white/10">
            <div className="hidden grid-cols-[1.1fr_1fr_0.8fr_0.9fr_0.9fr_0.9fr_0.8fr] gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 lg:grid dark:border-white/10 dark:bg-white/5">
              <span>Quote</span>
              <span>Customer</span>
              <span>Status</span>
              <span>Issue</span>
              <span>Total</span>
              <span>Expiry</span>
              <span>Actions</span>
            </div>

            <div className="divide-y divide-slate-200 dark:divide-white/10">
              {data.quotes.map((quote) => {
                const statusInfo = getQuoteStatusInfo(quote.status);
                const badge = getQuoteRecordBadge(quote.recordMode);
                const restriction = getQuoteRecordRestrictionMessage(quote.recordMode, data.context.role);
                return (
                  <article key={quote.id} className="block px-4 py-4 transition hover:bg-slate-50 dark:hover:bg-white/5">
                    <div className="hidden grid-cols-[1.1fr_1fr_0.8fr_0.9fr_0.9fr_0.9fr_0.8fr] gap-4 lg:grid">
                      <div>
                        <Link href={`/quotes/${quote.id}`} className="font-medium text-slate-950 underline-offset-4 hover:underline dark:text-white">
                          {quote.quote_number}
                        </Link>
                        <p className="mt-1 text-sm text-slate-500">{quote.notes || "No notes"}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <StatusBadge tone={badge.tone} title={badge.title}>{badge.label}</StatusBadge>
                        </div>
                      </div>
                      <div>
                        <p className="font-medium text-slate-700 dark:text-slate-300">{quote.lead_label}</p>
                        <p className="mt-1 text-sm text-slate-500">{quote.lead_company}</p>
                      </div>
                      <div><StatusBadge tone={statusInfo.tone}>{statusInfo.label}</StatusBadge></div>
                      <div className="text-sm text-slate-600 dark:text-slate-400">{formatDate(quote.issue_date)}</div>
                      <div className="text-sm font-medium text-slate-950 dark:text-white">{formatCurrency(quote.grand_total ?? quote.total, quote.currency)}</div>
                      <div className="text-sm text-slate-600 dark:text-slate-400">{formatDate(quote.expiry_date)}</div>
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/quotes/${quote.id}`} className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10">
                          View
                        </Link>
                        {restriction ? (
                          <span title={restriction} className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
                            Edit
                          </span>
                        ) : (
                          <Link href={`/quotes/${quote.id}/edit?redirect_to=${encodeURIComponent(currentHref)}`} className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10">
                            Edit
                          </Link>
                        )}
                      </div>
                    </div>

                    <div className="space-y-4 lg:hidden">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <Link href={`/quotes/${quote.id}`} className="font-medium text-slate-950 underline-offset-4 hover:underline dark:text-white">
                            {quote.quote_number}
                          </Link>
                          <p className="mt-1 text-sm text-slate-500">{quote.lead_label}</p>
                        </div>
                        <StatusBadge tone={statusInfo.tone}>{statusInfo.label}</StatusBadge>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <StatusBadge tone={badge.tone} title={badge.title}>{badge.label}</StatusBadge>
                        <StatusBadge tone="neutral">{formatCurrency(quote.grand_total ?? quote.total, quote.currency)}</StatusBadge>
                        <StatusBadge tone="neutral">{formatDate(quote.expiry_date)}</StatusBadge>
                      </div>

                      <p className="text-sm leading-6 text-slate-600 dark:text-slate-400">{quote.lead_company}</p>
                      {restriction ? <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">{restriction}</p> : null}

                      <div className="flex flex-wrap gap-2">
                        <Link href={`/quotes/${quote.id}`} className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10">
                          View
                        </Link>
                        {restriction ? (
                          <span className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
                            Edit
                          </span>
                        ) : (
                          <Link href={`/quotes/${quote.id}/edit?redirect_to=${encodeURIComponent(currentHref)}`} className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10">
                            Edit
                          </Link>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </SectionCard>
      ) : (
        <EmptyState title="No quotes yet" description="Create a quote from a lead or as a standalone customer proposal." actionHref={createHref} actionLabel="Create quote" />
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-slate-950/60">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{value}</p>
    </div>
  );
}
