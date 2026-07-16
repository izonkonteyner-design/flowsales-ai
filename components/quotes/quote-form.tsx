"use client";

import { useMemo, useState } from "react";
import { Plus, Save, Sparkles, Trash2 } from "lucide-react";

import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { calculateNormalizedQuoteTotals } from "@/server/services/quote-domain";
import { formatCurrency } from "@/lib/utils";
import type { QuoteRow } from "@/server/services/quotes";
import type { CurrencyCode, QuoteDiscountType } from "@/types/crm";

type QuotePartyOption = {
  id: string;
  label: string;
  subtitle: string;
};

type QuoteProductOption = {
  id: string;
  label: string;
  subtitle: string;
  sku: string;
  unit: string;
  currency: CurrencyCode;
  unit_price: number;
  active: boolean;
};

export type { QuoteProductOption };

type QuoteFormProps = {
  mode: "create" | "edit";
  action: (formData: FormData) => void;
  quote?: QuoteRow | null;
  leadOptions: QuotePartyOption[];
  customerOptions: QuotePartyOption[];
  productOptions: QuoteProductOption[];
  defaultQuoteNumber: string;
  canMutate: boolean;
  redirectTo: string;
  readOnlyMessage?: string;
};

type QuoteLineState = {
  id: string;
  product_id: string;
  name: string;
  description: string;
  sku: string;
  quantity: string;
  unit: string;
  unit_price: string;
  currency: CurrencyCode;
  discount_type: QuoteDiscountType;
  discount_value: string;
  tax_rate: string;
  sort_order: number;
};

function makeLine(id: string, currency: CurrencyCode, override: Partial<QuoteLineState> = {}): QuoteLineState {
  return {
    id,
    product_id: "",
    name: "",
    description: "",
    sku: "",
    quantity: "1",
    unit: "unit",
    unit_price: "0",
    currency,
    discount_type: "percentage",
    discount_value: "0",
    tax_rate: "20",
    sort_order: 0,
    ...override,
  };
}

function quoteToLine(quote: QuoteRow | null, currency: CurrencyCode, index: number): QuoteLineState {
  if (!quote?.items?.[index]) {
    return makeLine(`line-${index + 1}`, currency, { sort_order: index });
  }

  const item = quote.items[index];
  return makeLine(item.id ?? `line-${index + 1}`, (item.currency as CurrencyCode) ?? currency, {
    product_id: item.product_id ?? "",
    name: item.name ?? item.description ?? "",
    description: item.description ?? "",
    sku: item.sku ?? "",
    quantity: String(item.quantity ?? 1),
    unit: item.unit ?? "unit",
    unit_price: String(item.unit_price ?? 0),
    currency: (item.currency as CurrencyCode) ?? currency,
    discount_type: (item.discount_type ?? "percentage") as QuoteDiscountType,
    discount_value: String(item.discount_value ?? 0),
    tax_rate: String(item.tax_rate ?? 20),
    sort_order: item.sort_order ?? index,
  });
}

export function buildQuoteLineFromProduct(product: QuoteProductOption, fallbackCurrency: CurrencyCode, id = product.id) {
  return makeLine(id, product.currency ?? fallbackCurrency, {
    product_id: product.id,
    name: product.label,
    description: product.subtitle,
    sku: product.sku,
    unit: product.unit,
    unit_price: String(product.unit_price),
    currency: product.currency ?? fallbackCurrency,
  });
}

function buildInitialLines(quote: QuoteRow | null, currency: CurrencyCode) {
  const count = quote?.items?.length ?? 1;
  return Array.from({ length: count }, (_, index) => quoteToLine(quote, currency, index));
}

function asNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function QuoteForm({
  mode,
  action,
  quote,
  leadOptions,
  customerOptions,
  productOptions,
  defaultQuoteNumber,
  canMutate,
  redirectTo,
  readOnlyMessage,
}: QuoteFormProps) {
  const initialCurrency = (quote?.currency as CurrencyCode) ?? "TRY";
  const [lines, setLines] = useState<QuoteLineState[]>(() => buildInitialLines(quote ?? null, initialCurrency));

  const productMap = useMemo(() => new Map(productOptions.map((product) => [product.id, product])), [productOptions]);
  const serializedLines = lines.map((line, index) => ({
    product_id: line.product_id || null,
    name: line.name.trim(),
    description: line.description.trim(),
    sku: line.sku.trim(),
    quantity: asNumber(line.quantity),
    unit: line.unit.trim() || "unit",
    unit_price: asNumber(line.unit_price),
    currency: line.currency,
    discount_type: line.discount_type,
    discount_value: asNumber(line.discount_value),
    tax_rate: asNumber(line.tax_rate),
    sort_order: index,
  }));

  const totals = calculateNormalizedQuoteTotals(serializedLines, {
    currency: initialCurrency,
    shipping_total: asNumber(String(quote?.shipping_total ?? 0)),
    order_discount_type: (quote?.order_discount_type ?? "percentage") as QuoteDiscountType,
    order_discount_value: Number(quote?.order_discount_value ?? 0),
  });

  function updateLine(index: number, changes: Partial<QuoteLineState>) {
    setLines((current) => current.map((line, lineIndex) => (lineIndex === index ? { ...line, ...changes } : line)));
  }

  function addLine() {
    setLines((current) => [...current, makeLine(`line-${current.length + 1}`, initialCurrency, { sort_order: current.length })]);
  }

  function removeLine(index: number) {
    setLines((current) => (current.length === 1 ? current : current.filter((_, lineIndex) => lineIndex !== index)));
  }

  function applyProduct(index: number, productId: string) {
    const product = productMap.get(productId);
    if (!product) {
      updateLine(index, { product_id: "", currency: initialCurrency });
      return;
    }

    const currentLineId = lines[index]?.id ?? product.id;
    updateLine(index, buildQuoteLineFromProduct(product, initialCurrency, currentLineId));
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
      <SectionCard
        title={mode === "edit" ? "Edit quote" : "New quote"}
        description="Capture the commercial offer, including manual lines and product-linked pricing."
      >
        {!canMutate ? (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
            {readOnlyMessage ?? "This record is read-only."}
          </div>
        ) : null}

        <form action={action} className="space-y-6">
          <input type="hidden" name="quote_id" value={quote?.id ?? ""} />
          <input type="hidden" name="redirect_to" value={redirectTo} />
          <input type="hidden" name="items_json" value={JSON.stringify(serializedLines)} />

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Lead</span>
              <Select name="lead_id" defaultValue={quote?.lead_id ?? ""} disabled={!canMutate}>
                <option value="">Select a lead</option>
                {leadOptions.map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {lead.label} {lead.subtitle ? `- ${lead.subtitle}` : ""}
                  </option>
                ))}
              </Select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Customer</span>
              <Select name="customer_id" defaultValue={quote?.customer_id ?? ""} disabled={!canMutate}>
                <option value="">Select a customer</option>
                {customerOptions.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.label} {customer.subtitle ? `· ${customer.subtitle}` : ""}
                  </option>
                ))}
              </Select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Quote number</span>
              <Input name="quote_number" defaultValue={quote?.quote_number ?? defaultQuoteNumber} disabled={!canMutate} />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Status</span>
              <Select name="status" defaultValue={quote?.status ?? "draft"} disabled={!canMutate}>
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="viewed">Viewed</option>
                <option value="accepted">Accepted</option>
                <option value="rejected">Rejected</option>
                <option value="expired">Expired</option>
                <option value="cancelled">Cancelled</option>
              </Select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Issue date</span>
              <Input name="issue_date" type="date" defaultValue={quote?.issue_date ?? new Date().toISOString().slice(0, 10)} disabled={!canMutate} />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Valid until</span>
              <Input name="valid_until" type="date" defaultValue={quote?.valid_until ?? quote?.expiry_date ?? new Date().toISOString().slice(0, 10)} disabled={!canMutate} />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Currency</span>
              <Select name="currency" defaultValue={(quote?.currency as CurrencyCode) ?? "TRY"} disabled={!canMutate}>
                <option value="TRY">TRY</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </Select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Shipping total</span>
              <Input name="shipping_total" type="number" step="0.01" min="0" defaultValue={quote?.shipping_total ?? 0} disabled={!canMutate} />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Order discount type</span>
              <Select name="order_discount_type" defaultValue={quote?.order_discount_type ?? "percentage"} disabled={!canMutate}>
                <option value="percentage">Percentage</option>
                <option value="fixed">Fixed amount</option>
              </Select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Order discount value</span>
              <Input name="order_discount_value" type="number" step="0.01" min="0" defaultValue={quote?.order_discount_value ?? 0} disabled={!canMutate} />
            </label>
          </div>

          <div className="grid gap-4">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Payment terms</span>
              <Textarea name="payment_terms" defaultValue={quote?.payment_terms ?? ""} disabled={!canMutate} />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Delivery terms</span>
              <Textarea name="delivery_terms" defaultValue={quote?.delivery_terms ?? ""} disabled={!canMutate} />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Notes</span>
              <Textarea name="notes" defaultValue={quote?.notes ?? ""} disabled={!canMutate} />
            </label>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-950 dark:text-white">Line items</h3>
                <p className="mt-1 text-sm text-slate-500">Mix product-linked rows with manual lines.</p>
              </div>
              <button
                type="button"
                onClick={addLine}
                disabled={!canMutate}
                className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
              >
                <Plus className="h-4 w-4" />
                Add line
              </button>
            </div>

            <div className="space-y-4">
              {lines.map((line, index) => (
                <div key={line.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <StatusBadge tone="neutral">Line {index + 1}</StatusBadge>
                      {line.product_id ? <Badge variant="secondary">Product linked</Badge> : <Badge variant="secondary">Manual line</Badge>}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLine(index)}
                      disabled={!canMutate || lines.length === 1}
                      className="inline-flex h-9 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
                    >
                      <Trash2 className="h-4 w-4" />
                      Remove
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-3">
                    <label className="space-y-2 lg:col-span-1">
                      <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Product</span>
                      <Select
                        value={line.product_id}
                        onChange={(event) => applyProduct(index, event.target.value)}
                        disabled={!canMutate}
                      >
                        <option value="">Manual line</option>
                        {productOptions.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.label} {product.sku ? `- ${product.sku}` : ""}
                          </option>
                        ))}
                      </Select>
                    </label>

                    <label className="space-y-2 lg:col-span-2">
                      <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Name</span>
                      <Input value={line.name} onChange={(event) => updateLine(index, { name: event.target.value })} disabled={!canMutate} />
                    </label>

                    <label className="space-y-2">
                      <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">SKU</span>
                      <Input value={line.sku} onChange={(event) => updateLine(index, { sku: event.target.value })} disabled={!canMutate} />
                    </label>

                    <label className="space-y-2 lg:col-span-2">
                      <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Description</span>
                      <Input value={line.description} onChange={(event) => updateLine(index, { description: event.target.value })} disabled={!canMutate} />
                    </label>

                    <label className="space-y-2">
                      <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Unit</span>
                      <Input value={line.unit} onChange={(event) => updateLine(index, { unit: event.target.value })} disabled={!canMutate} />
                    </label>

                    <label className="space-y-2">
                      <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Quantity</span>
                      <Input type="number" step="0.01" min="0" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} disabled={!canMutate} />
                    </label>

                    <label className="space-y-2">
                      <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Unit price</span>
                      <Input type="number" step="0.01" min="0" value={line.unit_price} onChange={(event) => updateLine(index, { unit_price: event.target.value })} disabled={!canMutate} />
                    </label>

                    <label className="space-y-2">
                      <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Discount type</span>
                      <Select value={line.discount_type} onChange={(event) => updateLine(index, { discount_type: event.target.value as QuoteDiscountType })} disabled={!canMutate}>
                        <option value="percentage">Percentage</option>
                        <option value="fixed">Fixed amount</option>
                      </Select>
                    </label>

                    <label className="space-y-2">
                      <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Discount value</span>
                      <Input type="number" step="0.01" min="0" value={line.discount_value} onChange={(event) => updateLine(index, { discount_value: event.target.value })} disabled={!canMutate} />
                    </label>

                    <label className="space-y-2">
                      <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Tax rate</span>
                      <Input type="number" step="0.01" min="0" max="100" value={line.tax_rate} onChange={(event) => updateLine(index, { tax_rate: event.target.value })} disabled={!canMutate} />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              type="submit"
              disabled={!canMutate}
              className="inline-flex h-11 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950"
            >
              <Save className="h-4 w-4" />
              {mode === "edit" ? "Save quote" : "Create quote"}
            </button>
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Summary" description="Calculated from the current line-item model.">
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
            <p className="text-sm text-slate-500">Total status</p>
            <div className="mt-2 flex items-center gap-2">
              <StatusBadge tone={quote?.recordMode === "demo" ? "neutral" : "success"}>
                {quote?.record_badge.label ?? "Draft"}
              </StatusBadge>
              <Badge variant="secondary">{quote?.follow_up_state.label ?? "Scheduled"}</Badge>
            </div>
          </div>

          <div className="space-y-3 text-sm">
            <Row label="Subtotal" value={formatCurrency(totals.subtotal, initialCurrency)} />
            <Row label="Line discounts" value={formatCurrency(totals.line_discount_total, initialCurrency)} />
            <Row label="Order discount" value={formatCurrency(totals.order_discount_total, initialCurrency)} />
            <Row label="Shipping" value={formatCurrency(totals.shipping_total, initialCurrency)} />
            <Row label="Tax" value={formatCurrency(totals.tax_total, initialCurrency)} />
            <div className="flex items-center justify-between border-t border-slate-200 pt-3 text-base font-semibold text-slate-950 dark:border-white/10 dark:text-white">
              <span>Grand total</span>
              <span>{formatCurrency(totals.grand_total, initialCurrency)}</span>
            </div>
          </div>

          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-4 text-sm text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Product-linked lines can be edited manually without breaking the quote snapshot.
            </div>
          </div>
        </div>
      </SectionCard>
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
