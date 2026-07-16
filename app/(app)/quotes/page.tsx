import Link from "next/link";
import type { ReactNode } from "react";
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
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  canManageQuotes,
  getQuoteRecordRestrictionMessage,
  normalizeQuoteSearchParams,
  type QuoteFilterState,
} from "@/server/services/quote-domain";
import { getQuotePageData } from "@/server/services/quotes";

type QuotesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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
  const toastMessage = typeof rawSearchParams.toast === "string" ? rawSearchParams.toast : "";
  const toastTone =
    rawSearchParams.tone === "danger" || rawSearchParams.tone === "warning" || rawSearchParams.tone === "info"
      ? rawSearchParams.tone
      : "success";
  const currentHref = buildQuoteHref(filters);
  const createHref = `/quotes/new?redirect_to=${encodeURIComponent(currentHref)}`;
  const hasFilters = Boolean(filters.query || filters.status || filters.sort !== "newest" || filters.pageSize !== 8);

  return (
    <div className="space-y-6">
      {toastMessage ? <FlashToast message={toastMessage} tone={toastTone} /> : null}

      <PageHeader
        eyebrow="Commercial"
        title="Quotes"
        description="Create and manage structured offers with live pricing, status tracking, and safe permissions."
        actions={
          <Link
            href={createHref}
            className="inline-flex h-10 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950"
          >
            <Plus className="h-4 w-4" />
            New quote
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Results" value={String(data.total)} delta={data.totalPages > 1 ? `Page ${data.page} of ${data.totalPages}` : "Single page"} />
        <Metric label="Record mode" value={data.context.mode === "live" ? "Live" : "Demo"} delta={data.context.role} />
        <Metric label="View state" value={filters.status || "All"} delta={filters.sort} />
        <Metric label="Permissions" value={canManageQuotes(data.context.role) ? "Editable" : "Read only"} delta="Tenant scoped" />
      </div>

      <SectionCard title="Quote filters" description="Search by quote number, lead, customer, or commercial notes.">
        <form method="get" className="grid gap-3 xl:grid-cols-[1.8fr_0.8fr_0.8fr_auto]">
          <input type="hidden" name="page" value="1" />

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Search</span>
            <Input name="query" defaultValue={filters.query} placeholder="Number, lead, customer, notes" />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Status</span>
            <Select name="status" defaultValue={filters.status}>
              <option value="">All statuses</option>
              {QUOTE_STATUSES.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </Select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Sort</span>
            <Select name="sort" defaultValue={filters.sort}>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="total">Highest total</option>
              <option value="expiring">Expiring soon</option>
            </Select>
          </label>

          <div className="flex items-end gap-3">
            <button
              type="submit"
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950"
            >
              Apply
            </button>
            {hasFilters ? (
              <Link
                href="/quotes"
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
              >
                Reset
              </Link>
            ) : null}
          </div>
        </form>
      </SectionCard>

      {data.error ? (
        <EmptyState title="Unable to load quotes" description={data.error} actionHref="/quotes" actionLabel="Retry" />
      ) : data.quotes.length ? (
        <SectionCard title="Quote register" description="Each quote keeps a live data badge and a strict mutation boundary.">
          <div className="overflow-hidden rounded-3xl border border-slate-200 dark:border-white/10">
            <div className="hidden grid-cols-[1.1fr_1fr_0.8fr_0.8fr_0.8fr_0.8fr_0.9fr] gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 lg:grid dark:border-white/10 dark:bg-white/5">
              <span>Quote</span>
              <span>Party</span>
              <span>Status</span>
              <span>Issue</span>
              <span>Valid until</span>
              <span>Total</span>
              <span>Actions</span>
            </div>

            <div className="divide-y divide-slate-200 dark:divide-white/10">
              {data.quotes.map((quote) => {
                const restriction = getQuoteRecordRestrictionMessage(quote.recordMode, data.context.role);
                const canEdit = canManageQuotes(data.context.role) && quote.recordMode === "live";
                const partyLabel = quote.lead_name ?? quote.customer_name ?? "Unassigned";
                const partySub = quote.lead_company ?? quote.customer_company ?? "No company";

                return (
                  <article key={quote.id} className="block px-4 py-4 transition hover:bg-slate-50 dark:hover:bg-white/5">
                    <div className="hidden grid-cols-[1.1fr_1fr_0.8fr_0.8fr_0.8fr_0.8fr_0.9fr] gap-4 lg:grid">
                      <div>
                        <Link href={`/quotes/${quote.id}`} className="font-medium text-slate-950 underline-offset-4 hover:underline dark:text-white">
                          {quote.quote_number}
                        </Link>
                        <p className="mt-1 text-sm text-slate-500">{quote.notes || "No notes provided"}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <StatusBadge tone={quote.record_badge.tone} title={quote.record_badge.title}>
                            {quote.record_badge.label}
                          </StatusBadge>
                          <StatusBadge tone={quote.follow_up_state.tone}>{quote.follow_up_state.label}</StatusBadge>
                        </div>
                      </div>

                      <div>
                        <p className="font-medium text-slate-700 dark:text-slate-300">{partyLabel}</p>
                        <p className="mt-1 text-sm text-slate-500">{partySub}</p>
                      </div>

                      <div>
                        <StatusBadge tone={quote.status_tone}>{quote.status_label}</StatusBadge>
                      </div>

                      <div className="text-sm text-slate-600 dark:text-slate-400">{formatDate(quote.issue_date)}</div>

                      <div className="text-sm text-slate-600 dark:text-slate-400">
                        {formatDate(quote.valid_until ?? quote.expiry_date ?? quote.issue_date)}
                      </div>

                      <div className="text-sm font-medium text-slate-950 dark:text-white">
                        {formatCurrency(quote.grand_total ?? quote.total ?? 0, quote.currency)}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/quotes/${quote.id}`}
                          className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
                        >
                          View
                        </Link>
                        {canEdit ? (
                          <Link
                            href={`/quotes/${quote.id}/edit?redirect_to=${encodeURIComponent(currentHref)}`}
                            className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
                          >
                            Edit
                          </Link>
                        ) : (
                          <span
                            title={restriction}
                            className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400"
                          >
                            Edit
                          </span>
                        )}
                        <QuoteDeleteDialog
                          quoteId={quote.id}
                          quoteNumber={quote.quote_number}
                          redirectTo={currentHref}
                          recordMode={quote.recordMode}
                          role={data.context.role}
                          restrictionMessage={restriction}
                        />
                      </div>
                    </div>

                    <div className="space-y-4 lg:hidden">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <Link href={`/quotes/${quote.id}`} className="font-medium text-slate-950 underline-offset-4 hover:underline dark:text-white">
                            {quote.quote_number}
                          </Link>
                          <p className="mt-1 text-sm text-slate-500">{partyLabel}</p>
                          <p className="mt-1 text-xs text-slate-500">{partySub}</p>
                        </div>
                        <StatusBadge tone={quote.status_tone}>{quote.status_label}</StatusBadge>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <StatusBadge tone={quote.record_badge.tone} title={quote.record_badge.title}>
                          {quote.record_badge.label}
                        </StatusBadge>
                        <StatusBadge tone={quote.follow_up_state.tone}>{quote.follow_up_state.label}</StatusBadge>
                        <StatusBadge tone="neutral">{formatDate(quote.valid_until ?? quote.expiry_date ?? quote.issue_date)}</StatusBadge>
                      </div>

                      <p className="text-sm leading-6 text-slate-600 dark:text-slate-400">{quote.notes || "No notes provided"}</p>

                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Total</p>
                          <p className="mt-1 text-sm font-medium text-slate-950 dark:text-white">
                            {formatCurrency(quote.grand_total ?? quote.total ?? 0, quote.currency)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Issue</p>
                          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{formatDate(quote.issue_date)}</p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/quotes/${quote.id}`}
                          className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
                        >
                          View
                        </Link>
                        {canEdit ? (
                          <Link
                            href={`/quotes/${quote.id}/edit?redirect_to=${encodeURIComponent(currentHref)}`}
                            className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
                          >
                            Edit
                          </Link>
                        ) : (
                          <span
                            title={restriction}
                            className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400"
                          >
                            Edit
                          </span>
                        )}
                        <QuoteDeleteDialog
                          quoteId={quote.id}
                          quoteNumber={quote.quote_number}
                          redirectTo={currentHref}
                          recordMode={quote.recordMode}
                          role={data.context.role}
                          restrictionMessage={restriction}
                        />
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </SectionCard>
      ) : (
        <EmptyState
          title="No quotes yet"
          description="Create the first offer from a lead or customer to see quote history and totals appear."
          actionHref={createHref}
          actionLabel="New quote"
        />
      )}

      {data.totalPages > 1 ? (
        <SectionCard>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Page {data.page} of {data.totalPages} - {data.total} quote{data.total === 1 ? "" : "s"}
            </p>
            <div className="flex flex-wrap gap-2">
              <PageNavLink href={buildQuoteHref(filters, { page: Math.max(1, data.page - 1) })} disabled={data.page === 1}>
                Previous
              </PageNavLink>
              {Array.from({ length: data.totalPages }, (_, index) => index + 1).map((page) => (
                <PageNavLink key={page} href={buildQuoteHref(filters, { page })} active={page === data.page}>
                  {page}
                </PageNavLink>
              ))}
              <PageNavLink href={buildQuoteHref(filters, { page: Math.min(data.totalPages, data.page + 1) })} disabled={data.page === data.totalPages}>
                Next
              </PageNavLink>
            </div>
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}

function Metric({ label, value, delta }: { label: string; value: string; delta: string }) {
  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-slate-950/60">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{label}</p>
        <Filter className="h-4 w-4 text-slate-300" />
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{value}</p>
      <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">{delta}</p>
    </div>
  );
}

function PageNavLink({
  href,
  children,
  active,
  disabled,
}: {
  href: string;
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
}) {
  const className = [
    "inline-flex h-10 min-w-10 items-center justify-center rounded-2xl border px-3 text-sm font-medium transition",
    active
      ? "border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950"
      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10",
    disabled ? "pointer-events-none opacity-50" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Link href={href} className={className} aria-disabled={disabled}>
      {children}
    </Link>
  );
}
