import Link from "next/link";
import { ArrowLeft, Copy, Pencil, Send } from "lucide-react";

import { FlashToast } from "@/components/shared/flash-toast";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { QuoteDeleteDialog } from "@/components/quotes/quote-delete-dialog";
import { duplicateQuoteAction, updateQuoteStatusAction } from "@/app/(app)/quotes/actions";
import { QUOTE_STATUSES } from "@/lib/constants";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { Select } from "@/components/ui/select";
import { canManageQuotes, getQuoteRecordRestrictionMessage } from "@/server/services/quote-domain";
import { getQuoteDetailData } from "@/server/services/quotes";

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

  if (!data.quote) {
    return (
      <EmptyState
        title="Quote not found"
        description={data.error ?? "The requested quote cannot be located in this workspace."}
        actionHref="/quotes"
        actionLabel="Back to quotes"
      />
    );
  }

  const quote = data.quote;
  const backHref = typeof rawSearchParams.redirect_to === "string" && rawSearchParams.redirect_to.startsWith("/") ? rawSearchParams.redirect_to : "/quotes";
  const canMutate = quote.recordMode === "live" && canManageQuotes(data.context.role);
  const restriction = getQuoteRecordRestrictionMessage(quote.recordMode, data.context.role);

  return (
    <div className="space-y-6">
      {toastMessage ? <FlashToast message={toastMessage} tone={toastTone} /> : null}

      <PageHeader
        eyebrow="Quote detail"
        title={quote.quote_number}
        description={`${quote.lead_name ?? quote.customer_name ?? "Unassigned"} · ${quote.lead_company ?? quote.customer_company ?? "No company"}`}
        actions={
          <>
            <Link
              href={backHref}
              className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
            <form action={duplicateQuoteAction}>
              <input type="hidden" name="quote_id" value={quote.id} />
              <button
                type="submit"
                disabled={!canMutate}
                title={canMutate ? "Duplicate quote" : restriction}
                className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
              >
                <Copy className="h-4 w-4" />
                Duplicate
              </button>
            </form>
            {canMutate ? (
              <Link
                href={`/quotes/${quote.id}/edit?redirect_to=${encodeURIComponent(backHref)}`}
                className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
              >
                <Pencil className="h-4 w-4" />
                Edit
              </Link>
            ) : (
              <span
                title={restriction}
                className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400"
              >
                <Pencil className="h-4 w-4" />
                Edit
              </span>
            )}
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <SectionCard title="Quote preview" description="A clean client-ready summary with live line totals and terms.">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-950">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-500">FlowSales AI</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">Commercial Proposal</h2>
                <p className="mt-2 text-sm text-slate-500">Premium quote record with safe mutation rules.</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <StatusBadge tone={quote.record_badge.tone} title={quote.record_badge.title}>
                  {quote.record_badge.label}
                </StatusBadge>
                <StatusBadge tone={quote.status_tone}>{quote.status_label}</StatusBadge>
              </div>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <Info label="Lead" value={quote.lead_name ?? "Unassigned"} />
              <Info label="Customer" value={quote.customer_name ?? "No customer"} />
              <Info label="Issue date" value={formatDate(quote.issue_date)} />
              <Info label="Valid until" value={formatDate(quote.valid_until ?? quote.expiry_date ?? quote.issue_date)} />
              <Info label="Currency" value={quote.currency} />
              <Info label="Created" value={formatDateTime(quote.created_at)} />
            </div>

            <div className="mt-8 overflow-hidden rounded-3xl border border-slate-200 dark:border-white/10">
              <div className="grid grid-cols-[1.5fr_0.6fr_0.8fr_0.8fr_0.8fr] gap-4 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:bg-white/5">
                <span>Line item</span>
                <span>Qty</span>
                <span>Price</span>
                <span>Tax</span>
                <span>Total</span>
              </div>
              <div className="divide-y divide-slate-200 dark:divide-white/10">
                {quote.items.map((item) => (
                  <div key={item.id} className="grid grid-cols-[1.5fr_0.6fr_0.8fr_0.8fr_0.8fr] gap-4 px-4 py-4 text-sm">
                    <div>
                      <p className="font-medium text-slate-950 dark:text-white">{item.name || item.description}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.description || "Manual line"}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.sku || item.product_id || "No SKU"}</p>
                    </div>
                    <span className="text-slate-600 dark:text-slate-400">{item.quantity}</span>
                    <span className="text-slate-600 dark:text-slate-400">{formatCurrency(item.unit_price ?? 0, quote.currency)}</span>
                    <span className="text-slate-600 dark:text-slate-400">{formatCurrency(item.line_tax ?? 0, quote.currency)}</span>
                    <span className="font-medium text-slate-950 dark:text-white">{formatCurrency(item.line_total ?? 0, quote.currency)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
                <p className="text-sm text-slate-500">Payment terms</p>
                <p className="mt-2 text-sm text-slate-950 dark:text-white">{quote.payment_terms || "Not specified"}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
                <p className="text-sm text-slate-500">Delivery terms</p>
                <p className="mt-2 text-sm text-slate-950 dark:text-white">{quote.delivery_terms || "Not specified"}</p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-slate-200 pt-4 text-sm dark:border-white/10">
              <span className="text-slate-500">Snapshot currency and values are locked to the quote.</span>
              <div className="flex items-center gap-2">
                <Send className="h-4 w-4 text-slate-400" />
                <span className="text-slate-500">Client-ready preview</span>
              </div>
            </div>
          </div>
        </SectionCard>

        <div className="space-y-6">
          <SectionCard title="Summary" description="Live totals from the stored commercial snapshot.">
            <div className="space-y-3 text-sm">
              <Row label="Subtotal" value={formatCurrency(quote.subtotal, quote.currency)} />
              <Row label="Line discounts" value={formatCurrency(quote.line_discount_total ?? 0, quote.currency)} />
              <Row label="Order discount" value={formatCurrency(quote.order_discount_total ?? 0, quote.currency)} />
              <Row label="Shipping" value={formatCurrency(quote.shipping_total ?? 0, quote.currency)} />
              <Row label="Tax" value={formatCurrency(quote.tax_total, quote.currency)} />
              <div className="flex items-center justify-between border-t border-slate-200 pt-3 text-base font-semibold text-slate-950 dark:border-white/10 dark:text-white">
                <span>Grand total</span>
                <span>{formatCurrency(quote.grand_total ?? quote.total ?? 0, quote.currency)}</span>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Status" description="Use the secure server action to change quote state.">
            {canMutate ? (
              <form action={updateQuoteStatusAction} className="space-y-3">
                <input type="hidden" name="quote_id" value={quote.id} />
                <Select name="status" defaultValue={quote.status}>
                  {QUOTE_STATUSES.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </Select>
                <button
                  type="submit"
                  className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950"
                >
                  Save status
                </button>
              </form>
            ) : (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
                {restriction}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Actions" description="Safe mutations are disabled for demo records and viewer roles.">
            <div className="space-y-3">
              <QuoteDeleteDialog
                quoteId={quote.id}
                quoteNumber={quote.quote_number}
                redirectTo="/quotes"
                recordMode={quote.recordMode}
                role={data.context.role}
                restrictionMessage={restriction}
              />
              {restriction ? <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">{restriction}</p> : null}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-slate-950 dark:text-white">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-950 dark:text-white">{value}</span>
    </div>
  );
}
