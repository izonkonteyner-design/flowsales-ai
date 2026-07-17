import type { ReactNode } from "react";

import { QuoteDocumentImage } from "@/components/quotes/quote-document-image";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import type { QuoteDocumentModel } from "@/server/services/quote-document";

type QuoteDocumentProps = {
  document: QuoteDocumentModel;
};

function DetailRow({ label, value }: { label: string; value: string }) {
  if (!value) {
    return null;
  }

  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="max-w-[65%] text-right font-medium text-slate-950 break-words">{value}</span>
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="space-y-1">
      <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">{title}</h2>
      {subtitle ? <p className="text-sm text-slate-500">{subtitle}</p> : null}
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm break-inside-avoid-page">
      <SectionTitle title={title} />
      <div className="mt-4 space-y-2">{children}</div>
    </section>
  );
}

function CompanyLine({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) {
    return null;
  }

  return <DetailRow label={label} value={value} />;
}

export function QuoteDocument({ document }: QuoteDocumentProps) {
  const address = [document.company.address_line_1, document.company.address_line_2].filter(Boolean).join(", ");
  const cityLine = [document.company.district, document.company.city, document.company.country].filter(Boolean).join(", ");

  return (
    <div className="mx-auto w-full max-w-[210mm] bg-white p-4 text-slate-950 sm:p-6 print:max-w-none print:p-0">
      <article className="space-y-5 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="grid gap-6 border-b border-slate-200 pb-5 sm:grid-cols-[1.2fr_0.8fr] print:border-slate-300">
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              {document.company.logo_url ? (
                <QuoteDocumentImage
                  src={document.company.logo_url}
                  alt={`${document.company.name} logo`}
                  className="h-20 w-20 rounded-3xl border border-slate-200 object-cover shadow-sm"
                />
              ) : null}
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">{document.company.name}</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Quote</h1>
                <p className="mt-2 text-sm text-slate-500">{document.company.company_slogan ?? "Branded commercial proposal, ready for print or PDF."}</p>
              </div>
            </div>

            <div className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
              {document.recordMode === "demo" ? "Demo data" : "Live data"}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <div className="grid gap-2 text-sm">
              <DetailRow label="Quote number" value={document.quote_number} />
              <DetailRow label="Status" value={document.status_label} />
              <DetailRow label="Issue date" value={formatDate(document.issue_date)} />
              <DetailRow label="Valid until" value={formatDate(document.valid_until)} />
              <DetailRow label="Currency" value={document.currency} />
            </div>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <InfoCard title="Company">
            <DetailRow label="Name" value={document.company.name} />
            <CompanyLine label="Legal name" value={document.company.legal_name} />
            <CompanyLine label="Website" value={document.company.website} />
            <CompanyLine label="Email" value={document.company.email} />
            <CompanyLine label="Phone" value={document.company.phone} />
            <CompanyLine label="Secondary phone" value={document.company.secondary_phone} />
            <CompanyLine label="Address" value={address || null} />
            <CompanyLine label="City" value={cityLine || null} />
            <CompanyLine label="Tax office" value={document.company.tax_office} />
            <CompanyLine label="Tax number" value={document.company.tax_number} />
            <CompanyLine label="Registry number" value={document.company.trade_registry_number} />
            <CompanyLine label="MERSIS" value={document.company.mersis_number} />
            <CompanyLine label="Bank" value={document.company.bank_name} />
            <CompanyLine label="Branch" value={document.company.bank_branch} />
            <CompanyLine label="IBAN" value={document.company.iban} />
            <DetailRow label="Workspace" value={document.company.slug} />
            <DetailRow label="Currency" value={document.company.currency} />
          </InfoCard>

          <InfoCard title="Recipient">
            {document.recipient.type === "none" ? (
              <p className="text-sm text-slate-500">No recipient information.</p>
            ) : (
              <>
                <DetailRow label={document.recipient.type === "customer" ? "Customer" : "Lead"} value={document.recipient.name} />
                <DetailRow label="Company" value={document.recipient.company ?? ""} />
                <DetailRow label="Email" value={document.recipient.email ?? ""} />
                <DetailRow label="Phone" value={document.recipient.phone ?? ""} />
                <DetailRow label="City" value={document.recipient.city ?? ""} />
              </>
            )}
          </InfoCard>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-4 break-inside-auto">
          <SectionTitle title="Quote items" subtitle="Snapshot values only. Long descriptions wrap cleanly." />
          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
            <div className="grid grid-cols-[0.45fr_1.5fr_0.55fr_0.55fr_0.65fr_0.65fr_0.7fr_0.8fr_0.8fr_0.8fr] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              <span>#</span>
              <span>Item</span>
              <span>Qty</span>
              <span>Unit</span>
              <span>Price</span>
              <span>Discount</span>
              <span>Tax</span>
              <span>Total</span>
              <span>SKU</span>
              <span>Image</span>
            </div>
            <div className="divide-y divide-slate-200">
              {document.items.map((item) => (
                <div key={item.id} className="grid grid-cols-[0.45fr_1.5fr_0.55fr_0.55fr_0.65fr_0.65fr_0.7fr_0.8fr_0.8fr_0.8fr] gap-3 px-3 py-4 text-sm break-inside-avoid-page">
                  <div className="font-medium text-slate-700">{item.index}</div>
                  <div className="min-w-0">
                    <p className="font-medium text-slate-950 break-words">{item.name}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500 break-words">{item.description || "Manual line"}</p>
                  </div>
                  <div className="text-slate-700">{item.quantity}</div>
                  <div className="text-slate-700">{item.unit}</div>
                  <div className="text-slate-700">{formatCurrency(item.unit_price, document.currency)}</div>
                  <div className="text-slate-700">{item.discount}</div>
                  <div className="text-slate-700">{item.tax}</div>
                  <div className="font-medium text-slate-950">{formatCurrency(item.line_total, document.currency)}</div>
                  <div className="text-xs text-slate-500 break-all">{item.sku ?? "-"}</div>
                  <div>{item.product_image_url ? <QuoteDocumentImage src={item.product_image_url} alt={item.name} /> : <span className="text-xs text-slate-400">-</span>}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
          <InfoCard title="Totals">
            <DetailRow label="Subtotal" value={formatCurrency(document.subtotal, document.currency)} />
            <DetailRow label="Line discounts" value={formatCurrency(document.line_discount_total, document.currency)} />
            <DetailRow label="Order discount" value={formatCurrency(document.order_discount_total, document.currency)} />
            <DetailRow label="Shipping" value={formatCurrency(document.shipping_total, document.currency)} />
            <DetailRow label="Taxable subtotal" value={formatCurrency(document.taxable_subtotal, document.currency)} />
            <DetailRow label="Tax total" value={formatCurrency(document.tax_total, document.currency)} />
            <div className="flex items-center justify-between border-t border-slate-200 pt-3 text-base font-semibold text-slate-950">
              <span>Grand total</span>
              <span>{formatCurrency(document.grand_total, document.currency)}</span>
            </div>
          </InfoCard>

          <div className="space-y-4">
            <InfoCard title="Notes">
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{document.notes || "No notes provided."}</p>
            </InfoCard>
            <InfoCard title="Terms">
              <DetailRow label="Payment" value={document.payment_terms || "Not specified"} />
              <DetailRow label="Delivery" value={document.delivery_terms || "Not specified"} />
            </InfoCard>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <InfoCard title="Signature">
            <div className="space-y-3">
              <div className="h-20 rounded-2xl border border-dashed border-slate-300 bg-slate-50" />
              <p className="text-sm text-slate-500">
                {document.company.signature_name || "Authorized signatory"}
                {document.company.signature_title ? `, ${document.company.signature_title}` : ""}
              </p>
            </div>
          </InfoCard>

          <InfoCard title="Metadata">
            <DetailRow label="Created at" value={document.created_at ? formatDateTime(document.created_at) : "-"} />
            <DetailRow label="Updated at" value={document.updated_at ? formatDateTime(document.updated_at) : "-"} />
            <DetailRow label="Created by" value={document.created_by || "-"} />
          </InfoCard>
        </section>

        <footer className="flex items-center justify-between border-t border-slate-200 pt-4 text-xs text-slate-500 print:border-slate-300">
          <span>
            {document.company.name} quote document
            {document.company.quote_footer_text ? ` - ${document.company.quote_footer_text}` : ""}
          </span>
          <span>{document.quote_number}</span>
        </footer>
      </article>
    </div>
  );
}
