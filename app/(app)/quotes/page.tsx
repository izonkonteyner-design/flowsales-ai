import Link from "next/link";
import { Filter, Plus, Search } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getQuotes, getLeadById } from "@/server/services/crm-data";

export default function QuotesPage() {
  const quotes = getQuotes();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Commercial"
        title="Quotes"
        description="Create professional offers with products, taxes, and payment terms."
        actions={
          <>
            <button className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10">
              <Filter className="h-4 w-4" />
              Filters
            </button>
            <Link
              href="/quotes/new"
              className="inline-flex h-10 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950"
            >
              <Plus className="h-4 w-4" />
              New quote
            </Link>
          </>
        }
      />

      <SectionCard title="Quote register" description="Track quote status, lead linkage, and expiration dates.">
        <div className="mb-4 relative max-w-xl">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Search quote numbers, leads, or statuses" className="pl-10" />
        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-200 dark:border-white/10">
          <div className="hidden grid-cols-[1.1fr_1fr_0.7fr_0.8fr_0.9fr_0.9fr] gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 lg:grid dark:border-white/10 dark:bg-white/5">
            <span>Quote</span>
            <span>Lead</span>
            <span>Status</span>
            <span>Issue date</span>
            <span>Total</span>
            <span>Expiry</span>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-white/10">
            {quotes.map((quote) => {
              const lead = getLeadById(quote.lead_id);
              return (
                <Link
                  key={quote.id}
                  href={`/quotes/${quote.id}`}
                  className="block px-4 py-4 transition hover:bg-slate-50 dark:hover:bg-white/5"
                >
                  <div className="hidden grid-cols-[1.1fr_1fr_0.7fr_0.8fr_0.9fr_0.9fr] gap-4 lg:grid">
                    <div>
                      <p className="font-medium text-slate-950 dark:text-white">{quote.quote_number}</p>
                      <p className="mt-1 text-sm text-slate-500">{quote.notes}</p>
                    </div>
                    <div>
                      <p className="font-medium text-slate-700 dark:text-slate-300">{lead?.full_name}</p>
                      <p className="mt-1 text-sm text-slate-500">{lead?.company}</p>
                    </div>
                    <div>
                      <StatusBadge tone={quote.status === "accepted" ? "success" : quote.status === "rejected" ? "danger" : quote.status === "draft" ? "neutral" : "warning"}>
                        {quote.status}
                      </StatusBadge>
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-400">
                      {formatDate(quote.issue_date)}
                    </div>
                    <div className="text-sm font-medium text-slate-950 dark:text-white">
                      {formatCurrency(quote.total, quote.currency)}
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-400">
                      {formatDate(quote.expiry_date)}
                    </div>
                  </div>

                  <div className="space-y-3 lg:hidden">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium text-slate-950 dark:text-white">{quote.quote_number}</p>
                        <p className="mt-1 text-sm text-slate-500">{lead?.full_name}</p>
                      </div>
                      <StatusBadge tone={quote.status === "accepted" ? "success" : quote.status === "rejected" ? "danger" : quote.status === "draft" ? "neutral" : "warning"}>
                        {quote.status}
                      </StatusBadge>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">{formatCurrency(quote.total, quote.currency)}</Badge>
                      <Badge variant="secondary">{formatDate(quote.expiry_date)}</Badge>
                      <Badge variant="secondary">{lead?.company}</Badge>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {!quotes.length ? (
          <div className="mt-6">
            <EmptyState
              title="No quotes yet"
              description="Generate quotes from leads and approved products to see the register fill up."
              actionHref="/quotes/new"
              actionLabel="Create quote"
            />
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}
