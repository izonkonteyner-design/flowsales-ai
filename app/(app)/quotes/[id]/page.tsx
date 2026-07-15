import Link from "next/link";
import { ArrowLeft, Copy, Printer, Send } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getQuoteById, getLeadById } from "@/server/services/crm-data";

type QuoteDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function QuoteDetailPage({ params }: QuoteDetailPageProps) {
  const { id } = await params;
  const quote = getQuoteById(id);

  if (!quote) {
    return (
      <EmptyState
        title="Quote not found"
        description="The requested quote cannot be located in the workspace."
        actionHref="/quotes"
        actionLabel="Back to quotes"
      />
    );
  }

  const lead = getLeadById(quote.lead_id);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Quote detail"
        title={quote.quote_number}
        description={lead ? `${lead.full_name} · ${lead.company}` : "Commercial proposal"}
        actions={
          <>
            <Link
              href="/quotes"
              className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
            <button className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10">
              <Copy className="h-4 w-4" />
              Duplicate
            </button>
            <button className="inline-flex h-10 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950">
              <Send className="h-4 w-4" />
              Send
            </button>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <SectionCard title="Quote preview" description="A printable layout for client review and PDF export.">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-950">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-500">FlowSales AI</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">Commercial Proposal</h2>
                <p className="mt-2 text-sm text-slate-500">Your AI Sales Employee</p>
              </div>
              <StatusBadge tone={quote.status === "accepted" ? "success" : quote.status === "rejected" ? "danger" : quote.status === "draft" ? "neutral" : "warning"}>
                {quote.status}
              </StatusBadge>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <Info label="Lead" value={lead ? lead.full_name : quote.lead_id} />
              <Info label="Company" value={lead?.company ?? "-"} />
              <Info label="Issue date" value={formatDate(quote.issue_date)} />
              <Info label="Expiry date" value={formatDate(quote.expiry_date)} />
            </div>

            <div className="mt-8 overflow-hidden rounded-3xl border border-slate-200 dark:border-white/10">
              <div className="grid grid-cols-[1.3fr_0.6fr_0.7fr_0.8fr] gap-4 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:bg-white/5">
                <span>Description</span>
                <span>Qty</span>
                <span>Price</span>
                <span>Total</span>
              </div>
              <div className="divide-y divide-slate-200 dark:divide-white/10">
                {quote.items.map((item) => (
                  <div key={item.id} className="grid grid-cols-[1.3fr_0.6fr_0.7fr_0.8fr] gap-4 px-4 py-4 text-sm">
                    <span className="text-slate-950 dark:text-white">{item.description}</span>
                    <span className="text-slate-600 dark:text-slate-400">{item.quantity}</span>
                    <span className="text-slate-600 dark:text-slate-400">{formatCurrency(item.unit_price, quote.currency)}</span>
                    <span className="font-medium text-slate-950 dark:text-white">{formatCurrency(item.line_total, quote.currency)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
                <p className="text-sm text-slate-500">Payment terms</p>
                <p className="mt-2 text-sm text-slate-950 dark:text-white">{quote.payment_terms}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
                <p className="text-sm text-slate-500">Delivery terms</p>
                <p className="mt-2 text-sm text-slate-950 dark:text-white">{quote.delivery_terms}</p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-slate-200 pt-4 text-sm dark:border-white/10">
              <span className="text-slate-500">Signature area</span>
              <div className="flex items-center gap-2">
                <Printer className="h-4 w-4 text-slate-400" />
                <span className="text-slate-500">Print / PDF ready</span>
              </div>
            </div>
          </div>
        </SectionCard>

        <div className="space-y-6">
          <SectionCard title="Summary" description="Key numbers for the selected proposal.">
            <div className="space-y-3 text-sm">
              <Row label="Subtotal" value={formatCurrency(quote.subtotal, quote.currency)} />
              <Row label="Discount" value={formatCurrency(quote.discount_total, quote.currency)} />
              <Row label="Tax" value={formatCurrency(quote.tax_total, quote.currency)} />
              <div className="flex items-center justify-between border-t border-slate-200 pt-3 text-base font-semibold text-slate-950 dark:border-white/10 dark:text-white">
                <span>Total</span>
                <span>{formatCurrency(quote.total, quote.currency)}</span>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Quote links" description="Quick references and relationship context.">
            <div className="space-y-3">
              <Badge variant="secondary">Lead-linked</Badge>
              <Badge variant="secondary">Activity tracked</Badge>
              <Badge variant="secondary">Share link placeholder</Badge>
              <Badge variant="secondary">QR code placeholder</Badge>
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
