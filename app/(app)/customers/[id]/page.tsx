import Link from "next/link";
import { ArrowLeft, ExternalLink, MessageSquarePlus } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { getCustomerDetailData } from "@/server/services/customers";
import { getCustomerRecordInfo } from "@/server/services/customers";

type CustomerDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function CustomerDetailPage({ params }: CustomerDetailPageProps) {
  const { id } = await params;
  const data = await getCustomerDetailData(id);

  if (!data.customer) {
    return (
      <EmptyState
        title="Customer not found"
        description={data.error ?? "The requested customer does not exist in this workspace."}
        actionHref="/customers"
        actionLabel="Back to customers"
      />
    );
  }

  const customer = data.customer;
  const recordInfo = getCustomerRecordInfo(customer.recordMode);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="CRM"
        title={customer.name}
        description={`${customer.company || "No company"} · ${customer.city || "No city"}`}
        actions={
          <>
            <Link
              href="/customers"
              className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
            <Link
              href={`/quotes/new?customer_id=${encodeURIComponent(customer.id)}&redirect_to=${encodeURIComponent(`/customers/${customer.id}`)}`}
              className="inline-flex h-10 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950"
            >
              <MessageSquarePlus className="h-4 w-4" />
              Create quote
            </Link>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
        <SectionCard title="Customer summary" description="Converted account context and commercial snapshot.">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={recordInfo.tone} title={recordInfo.title}>
              {recordInfo.label}
            </StatusBadge>
            <Badge variant="secondary">{customer.segment}</Badge>
            <Badge variant="secondary">{customer.quote_count ?? 0} quotes</Badge>
            <Badge variant="secondary">{formatCurrency(customer.lifetime_value, data.context.organization.currency)}</Badge>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Info label="Email" value={customer.email || "Not set"} />
            <Info label="Phone" value={customer.phone || "Not set"} />
            <Info label="Source lead" value={data.sourceLead ? data.sourceLead.full_name : "No linked lead"} />
            <Info label="Last quote" value={customer.last_quote_at ? formatDateTime(customer.last_quote_at) : "No quote yet"} />
            <Info label="Converted at" value={customer.converted_at ? formatDateTime(customer.converted_at) : "Not recorded"} />
            <Info label="Next review" value={customer.next_review_at ? formatDate(customer.next_review_at) : "Not scheduled"} />
          </div>
        </SectionCard>

        <SectionCard title="Linked records" description="Navigate to the source lead or related quote history.">
          <div className="space-y-4">
            {data.sourceLead ? (
              <Link
                href={`/leads/${data.sourceLead.id}`}
                className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
              >
                <div>
                  <p className="font-medium text-slate-950 dark:text-white">Source lead</p>
                  <p className="mt-1 text-xs text-slate-500">{data.sourceLead.company || "No company"}</p>
                </div>
                <ExternalLink className="h-4 w-4 text-slate-400" />
              </Link>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">No source lead linked to this customer.</p>
            )}

            <div className="space-y-3">
              {data.relatedQuotes.length ? (
                data.relatedQuotes.map((quote) => (
                  <Link
                    key={quote.id}
                    href={`/quotes/${quote.id}`}
                    className="block rounded-2xl border border-slate-200 bg-white px-4 py-3 transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-950/60 dark:hover:bg-white/5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-950 dark:text-white">{quote.quote_number}</p>
                        <p className="mt-1 text-xs text-slate-500">{formatDate(quote.issue_date)}</p>
                      </div>
                      <StatusBadge tone="neutral">{quote.status}</StatusBadge>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
                      <span>{quote.currency}</span>
                      <span>{formatCurrency(quote.grand_total ?? quote.total ?? 0, quote.currency)}</span>
                    </div>
                  </Link>
                ))
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">No related quotes yet.</p>
              )}
            </div>
          </div>
        </SectionCard>
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
