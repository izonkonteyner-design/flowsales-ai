"use client";

import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { QUOTE_STATUSES } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils";
import { calculateLineTotal, calculateQuoteTotals } from "@/server/services/quote-math";
import type { Lead, Product, Quote } from "@/types/crm";

type QuoteFormItem = {
  product_id: string;
  name: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  tax_rate: number;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  sort_order: number;
};

type QuoteFormProps = {
  action: (formData: FormData) => Promise<void>;
  redirectTo: string;
  leadOptions: Lead[];
  productOptions: Product[];
  quote?: Quote | null;
  quoteId?: string;
  nextQuoteNumber: string;
  submitLabel: string;
  editable?: boolean;
  restrictionMessage?: string;
};

function createEmptyItem(index = 0): QuoteFormItem {
  return {
    product_id: "",
    name: "",
    description: "",
    quantity: 1,
    unit: "unit",
    unit_price: 0,
    tax_rate: 20,
    discount_type: "fixed",
    discount_value: 0,
    sort_order: index,
  };
}

function normalizeInitialItems(quote?: Quote | null) {
  if (!quote?.items?.length) {
    return [createEmptyItem()];
  }

  return quote.items.map((item, index) => ({
    product_id: item.product_id || "",
    name: item.name ?? item.description,
    description: item.description,
    quantity: item.quantity,
    unit: item.unit ?? "unit",
    unit_price: item.unit_price,
    tax_rate: item.tax_rate,
    discount_type: item.discount_type ?? (item.discount > 0 ? "percentage" : "fixed"),
    discount_value: item.discount_value ?? item.discount ?? 0,
    sort_order: item.sort_order ?? index,
  }));
}

export function QuoteForm({
  action,
  redirectTo,
  leadOptions,
  productOptions,
  quote,
  quoteId,
  nextQuoteNumber,
  submitLabel,
  editable = true,
  restrictionMessage,
}: QuoteFormProps) {
  const [items, setItems] = useState<QuoteFormItem[]>(normalizeInitialItems(quote));
  const [quoteDiscountType, setQuoteDiscountType] = useState<"percentage" | "fixed">(quote?.discount_type ?? "fixed");
  const [quoteDiscountValue, setQuoteDiscountValue] = useState<number>(quote?.discount_value ?? 0);
  const [shippingTotal, setShippingTotal] = useState<number>(quote?.shipping_total ?? 0);

  const totals = (() => {
    try {
      return items.length
        ? calculateQuoteTotals({
            items,
            discount_type: quoteDiscountType,
            discount_value: quoteDiscountValue,
            shipping_total: shippingTotal,
          })
        : {
            subtotal: 0,
            lineDiscountTotal: 0,
            quoteDiscountTotal: 0,
            discountTotal: 0,
            taxTotal: 0,
            shippingTotal,
            grandTotal: shippingTotal,
            total: shippingTotal,
          };
    } catch {
      return {
        subtotal: 0,
        lineDiscountTotal: 0,
        quoteDiscountTotal: 0,
        discountTotal: 0,
        taxTotal: 0,
        shippingTotal,
        grandTotal: shippingTotal,
        total: shippingTotal,
      };
    }
  })();

  function updateItem(index: number, patch: Partial<QuoteFormItem>) {
    setItems((current) =>
      current.map((item, currentIndex) => {
        if (currentIndex !== index) {
          return item;
        }

        return { ...item, ...patch };
      }),
    );
  }

  function moveItem(index: number, direction: -1 | 1) {
    setItems((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) {
        return current;
      }

      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next.map((entry, entryIndex) => ({ ...entry, sort_order: entryIndex }));
    });
  }

  function addItem() {
    setItems((current) => [...current, createEmptyItem(current.length)]);
  }

  function removeItem(index: number) {
    setItems((current) => {
      if (current.length === 1) {
        return [createEmptyItem()];
      }

      return current.filter((_, currentIndex) => currentIndex !== index).map((entry, entryIndex) => ({ ...entry, sort_order: entryIndex }));
    });
  }

  function selectProduct(index: number, productId: string) {
    const product = productOptions.find((entry) => entry.id === productId);
    if (!product) {
      updateItem(index, { product_id: "", name: "", description: "", unit_price: 0, tax_rate: 20, unit: "unit" });
      return;
    }

    updateItem(index, {
      product_id: product.id,
      name: product.name,
      description: product.description,
      unit_price: product.unit_price ?? product.base_price,
      tax_rate: product.tax_rate,
      unit: product.unit,
    });
  }

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="redirect_to" value={redirectTo} />
      {quoteId ? <input type="hidden" name="quote_id" value={quoteId} /> : null}
      <input type="hidden" name="items_json" value={JSON.stringify(items)} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Quote number">
          <Input name="quote_number" defaultValue={quote?.quote_number ?? nextQuoteNumber} required disabled={!editable} />
        </Field>
        <Field label="Status">
          <Select name="status" defaultValue={quote?.status ?? "draft"} disabled={!editable}>
            {QUOTE_STATUSES.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Lead">
          <Select name="lead_id" defaultValue={quote?.lead_id ?? ""} disabled={!editable}>
            <option value="">No lead</option>
            {leadOptions.map((lead) => (
              <option key={lead.id} value={lead.id}>
                {lead.full_name} {lead.company ? `- ${lead.company}` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Currency">
          <Select name="currency" defaultValue={quote?.currency ?? "TRY"} disabled={!editable}>
            {["TRY", "USD", "EUR"].map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Customer name">
          <Input name="customer_name" defaultValue={quote?.customer_name ?? ""} required disabled={!editable} />
        </Field>
        <Field label="Customer company">
          <Input name="customer_company" defaultValue={quote?.customer_company ?? ""} disabled={!editable} />
        </Field>
        <Field label="Customer email">
          <Input name="customer_email" type="email" defaultValue={quote?.customer_email ?? ""} disabled={!editable} />
        </Field>
        <Field label="Customer phone">
          <Input name="customer_phone" defaultValue={quote?.customer_phone ?? ""} disabled={!editable} />
        </Field>
        <Field label="Issue date">
          <Input name="issue_date" type="date" defaultValue={quote?.issue_date ?? new Date().toISOString().slice(0, 10)} required disabled={!editable} />
        </Field>
        <Field label="Expiry date">
          <Input name="expiry_date" type="date" defaultValue={quote?.expiry_date ?? ""} required disabled={!editable} />
        </Field>
        <Field label="Quote discount type">
          <Select name="discount_type" value={quoteDiscountType} onChange={(event) => setQuoteDiscountType(event.target.value as "percentage" | "fixed")} disabled={!editable}>
            <option value="fixed">Fixed</option>
            <option value="percentage">Percentage</option>
          </Select>
        </Field>
        <Field label="Quote discount value">
          <Input
            name="discount_value"
            type="number"
            min="0"
            step="0.01"
            value={quoteDiscountValue}
            onChange={(event) => setQuoteDiscountValue(Number(event.target.value || 0))}
            disabled={!editable}
          />
        </Field>
        <Field label="Shipping total">
          <Input
            name="shipping_total"
            type="number"
            min="0"
            step="0.01"
            value={shippingTotal}
            onChange={(event) => setShippingTotal(Number(event.target.value || 0))}
            disabled={!editable}
          />
        </Field>
      </div>

      <Field label="Notes">
        <Textarea name="notes" defaultValue={quote?.notes ?? ""} disabled={!editable} />
      </Field>

      <Field label="Payment terms">
        <Textarea name="payment_terms" defaultValue={quote?.payment_terms ?? ""} disabled={!editable} />
      </Field>

      <Field label="Delivery terms">
        <Textarea name="delivery_terms" defaultValue={quote?.delivery_terms ?? ""} disabled={!editable} />
      </Field>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-950 dark:text-white">Line items</h3>
            <p className="mt-1 text-sm text-slate-500">Select a product or add a manual line item. Totals are recalculated on the server.</p>
          </div>
          <button
            type="button"
            onClick={addItem}
            disabled={!editable}
            className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <Plus className="h-4 w-4" />
            Add item
          </button>
        </div>

        <div className="space-y-4">
          {items.map((item, index) => {
            const product = productOptions.find((entry) => entry.id === item.product_id);
            const lineTotal = (() => {
              try {
                return calculateLineTotal({
                  quantity: item.quantity,
                  unit_price: item.unit_price,
                  discount_type: item.discount_type,
                  discount_value: item.discount_value,
                  tax_rate: item.tax_rate,
                });
              } catch {
                return 0;
              }
            })();

            return (
              <div key={`${item.sort_order}-${index}`} className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-950 dark:text-white">Item {index + 1}</h4>
                    <p className="mt-1 text-xs text-slate-500">{product?.name ?? "Manual item"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => moveItem(index, -1)} disabled={!editable} className="inline-flex h-9 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-slate-950/60 dark:text-slate-300">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => moveItem(index, 1)} disabled={!editable} className="inline-flex h-9 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-slate-950/60 dark:text-slate-300">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => removeItem(index)} disabled={!editable} className="inline-flex h-9 items-center justify-center rounded-2xl border border-rose-200 bg-white px-3 text-xs font-medium text-rose-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <Field label="Product">
                    <Select value={item.product_id} onChange={(event) => selectProduct(index, event.target.value)} disabled={!editable}>
                      <option value="">Manual item</option>
                      {productOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Name">
                    <Input value={item.name} onChange={(event) => updateItem(index, { name: event.target.value })} disabled={!editable} />
                  </Field>
                  <Field label="Description">
                    <Input value={item.description} onChange={(event) => updateItem(index, { description: event.target.value })} disabled={!editable} />
                  </Field>
                  <Field label="Unit">
                    <Input value={item.unit} onChange={(event) => updateItem(index, { unit: event.target.value })} disabled={!editable} />
                  </Field>
                  <Field label="Quantity">
                    <Input type="number" min="1" step="1" value={item.quantity} onChange={(event) => updateItem(index, { quantity: Number(event.target.value || 1) })} disabled={!editable} />
                  </Field>
                  <Field label="Unit price">
                    <Input type="number" min="0" step="0.01" value={item.unit_price} onChange={(event) => updateItem(index, { unit_price: Number(event.target.value || 0) })} disabled={!editable} />
                  </Field>
                  <Field label="Discount type">
                    <Select value={item.discount_type} onChange={(event) => updateItem(index, { discount_type: event.target.value as "percentage" | "fixed" })} disabled={!editable}>
                      <option value="fixed">Fixed</option>
                      <option value="percentage">Percentage</option>
                    </Select>
                  </Field>
                  <Field label="Discount value">
                    <Input type="number" min="0" step="0.01" value={item.discount_value} onChange={(event) => updateItem(index, { discount_value: Number(event.target.value || 0) })} disabled={!editable} />
                  </Field>
                  <Field label="Tax rate">
                    <Input type="number" min="0" max="100" step="0.01" value={item.tax_rate} onChange={(event) => updateItem(index, { tax_rate: Number(event.target.value || 0) })} disabled={!editable} />
                  </Field>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600 dark:text-slate-400">
                  <p>Estimated line total: <span className="font-medium text-slate-950 dark:text-white">{formatCurrency(lineTotal, quote?.currency ?? "TRY")}</span></p>
                  <p>{restrictionMessage ? restrictionMessage : "Server recalculation will always take precedence."}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="Subtotal" value={formatCurrency(totals.subtotal, quote?.currency ?? "TRY")} />
        <SummaryCard label="Discounts" value={formatCurrency(totals.discountTotal, quote?.currency ?? "TRY")} />
        <SummaryCard label="Tax" value={formatCurrency(totals.taxTotal, quote?.currency ?? "TRY")} />
        <SummaryCard label="Grand total" value={formatCurrency(totals.grandTotal, quote?.currency ?? "TRY")} />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
        <p>
          {quote ? (
            <>
              Quote updates stay scoped to the current organization. Current number: <span className="font-medium text-slate-950 dark:text-white">{quote.quote_number}</span>
            </>
          ) : (
            "Quotes can be created with or without a lead. Server actions always recalculate totals before persistence."
          )}
        </p>
        {restrictionMessage ? <p className="mt-2">{restrictionMessage}</p> : null}
      </div>

      <button
        type="submit"
        disabled={!editable}
        title={restrictionMessage || undefined}
        className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
      >
        {submitLabel}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="space-y-2">
      <span className="block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
      {children}
    </label>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-slate-950/60">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-3 text-lg font-semibold text-slate-950 dark:text-white">{value}</p>
    </div>
  );
}
