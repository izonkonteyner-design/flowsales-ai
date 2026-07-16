import Link from "next/link";
import { ArrowLeft, Pencil } from "lucide-react";

import { QuoteDeleteDialog } from "@/components/quotes/quote-delete-dialog";
import { QuoteStatusMenu } from "@/components/quotes/quote-status-menu";
import { FlashToast } from "@/components/shared/flash-toast";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { getQuoteDetailData } from "@/server/services/quotes";
import { getQuoteRecordBadge, getQuoteRecordRestrictionMessage, getQuoteStatusInfo } from "@/server/services/quote-domain";

type QuoteDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function QuoteDetailPage({ params, searchParams }: QuoteDetailPageProps) {
  const [{ id }, rawSearchParams] = await Promise.all([params, searchParams]);
  const data = await getQuoteDetailData(id);
  const toastMessage = typeof rawSearchParams.toast === "string" ? rawSearchParams.toast : "";
  const toastTone =
    rawSearchParams.tone === "danger" || rawSearchParams.tone === "warning" || rawSearchParams.tone === "info"
      ? rawSearchParams.tone
      : "success";

  if (data.error && !data.quote) {
    return (
      <div className="space-y-6">
        {toastMessage ? <FlashToast message={toastMessage} tone={toastTone} /> : null}
        <PageHeader
          eyebrow="Commercial"
          title="Quote detail"
          description="Inspect the quote record."
          actions={
            <Link href="/quotes" className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10">
              <ArrowLeft className="h-4 w-4" />
              Back to quotes
            </Link>
          }
        />
        <EmptyState title="Quote not available" description={data.error} actionHref="/quotes" actionLabel="Back to quotes" />
      </div>
    );
  }

  const quote = data.quote;

  if (!quote) {
    return null;
  }

  const statusInfo = getQuoteStatusInfo(quote.status);
  const badge = getQuoteRecordBadge(quote.recordMode);
  const restriction = getQuoteRecordRestrictionMessage(quote.recordMode, data.context.role);
  const editable = !restriction;

  return (
    <div className="space-y-6">
      {toastMessage ? <FlashToast message={toastMessage} tone={toastTone} /> : null}

      <PageHeader
        eyebrow="Commercial"
        title={quote.quote_number}
        description="Review the quote, pricing, and supporting line items."
        actions={
          <>
            <Link href="/quotes" className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
            {editable ? (
              <Link href={`/quotes/${quote.id}/edit?redirect_to=/quotes/${quote.id}`} className="inline-flex h-10 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950">
                <Pencil className="h-4 w-4" />
                Edit
              </Link>
            ) : (
              <span title={restriction} className="inline-flex h-10 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white opacity-50">
                Edit
              </span>
            )}
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="Customer" value={quote.lead_label} />
        <Metric label="Company" value={quote.lead_company} />
        <Metric label="Status" value={statusInfo.label} />
        <Metric label="Grand total" value={formatCurrency(quote.grand_total ?? quote.total, quote.currency)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <SectionCard title="Quote overview" description="Commercial terms and validity window.">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone={statusInfo.tone}>{statusInfo.label}</StatusBadge>
              <StatusBadge tone={badge.tone} title={badge.title}>{badge.label}</StatusBadge>
              <StatusBadge tone="neutral">{formatDate(quote.issue_date)}</StatusBadge>
              <StatusBadge tone="neutral">{formatDate(quote.expiry_date)}</StatusBadge>
            </div>
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-400">{quote.notes || "No notes recorded."}</p>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Stat label="Payment terms" value={quote.payment_terms || "—"} />
              <Stat label="Delivery terms" value={quote.delivery_terms || "—"} />
              <Stat label="Subtotal" value={formatCurrency(quote.subtotal, quote.currency)} />
              <Stat label="Tax" value={formatCurrency(quote.tax_total, quote.currency)} />
              <Stat label="Shipping" value={formatCurrency(quote.shipping_total ?? 0, quote.currency)} />
              <Stat label="Updated" value={quote.updated_at ? formatDateTime(quote.updated_at) : "—"} />
            </dl>
            {restriction ? <p className="text-sm text-slate-500 dark:text-slate-400">{restriction}</p> : null}
          </div>
        </SectionCard>

        <SectionCard title="Actions" description="Change status or remove the quote when permissions allow.">
          <div className="space-y-4">
            <QuoteStatusMenu
              quoteId={quote.id}
              currentStatus={quote.status}
              redirectTo={`/quotes/${quote.id}`}
              recordMode={quote.recordMode}
              role={data.context.role}
              label="Save stage"
            />
            {editable ? (
              <QuoteDeleteDialog
                quoteId={quote.id}
                quoteName={quote.quote_number}
                redirectTo="/quotes"
                recordMode={quote.recordMode}
                role={data.context.role}
              />
            ) : (
              <button type="button" disabled title={restriction} className="inline-flex h-10 items-center gap-2 rounded-2xl border border-rose-200 bg-white px-4 text-sm font-medium text-rose-700 opacity-50 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">
                Delete
              </button>
            )}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Line items" description="Products and manual items in the quote.">
        <div className="space-y-4">
          {quote.items.map((item) => (
            <article key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-slate-950 dark:text-white">{item.name ?? item.description}</p>
                  <p className="mt-1 text-sm text-slate-500">{item.description}</p>
                </div>
                <StatusBadge tone="neutral">
                  {item.quantity} x {formatCurrency(item.unit_price, quote.currency)}
                </StatusBadge>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <StatusBadge tone="neutral">Unit {item.unit ?? "unit"}</StatusBadge>
                <StatusBadge tone="neutral">Tax {item.tax_rate}%</StatusBadge>
                <StatusBadge tone="neutral">
                  {item.discount_type === "percentage" ? `${item.discount_value}% discount` : formatCurrency(item.discount_value ?? 0, quote.currency)}
                </StatusBadge>
                <StatusBadge tone="success">{formatCurrency(item.line_total, quote.currency)}</StatusBadge>
              </div>
            </article>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-slate-950/60">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-3 text-lg font-semibold text-slate-950 dark:text-white">{value}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
      <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</dt>
      <dd className="mt-2 text-sm font-medium text-slate-950 dark:text-white">{value}</dd>
    </div>
  );
}
