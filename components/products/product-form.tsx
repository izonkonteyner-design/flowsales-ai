import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/utils";
import type { ProductRow } from "@/server/services/products";
import type { ReactNode } from "react";

const currencies = ["TRY", "USD", "EUR"];
const categories = ["Container", "Residential", "Commercial", "Construction", "Infrastructure", "Custom"];
const units = ["unit", "set", "sqm", "box", "service"];

type ProductFormProps = {
  action: (formData: FormData) => Promise<void>;
  redirectTo: string;
  product?: ProductRow | null;
  submitLabel: string;
  productId?: string;
  editable?: boolean;
  restrictionMessage?: string;
};

export function ProductForm({
  action,
  redirectTo,
  product,
  submitLabel,
  productId,
  editable = true,
  restrictionMessage,
}: ProductFormProps) {
  const priceValue = product?.unit_price ?? product?.base_price ?? 0;

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="redirect_to" value={redirectTo} />
      {productId ? <input type="hidden" name="product_id" value={productId} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="SKU">
          <Input name="sku" defaultValue={product?.sku ?? ""} required disabled={!editable} />
        </Field>
        <Field label="Name">
          <Input name="name" defaultValue={product?.name ?? ""} required disabled={!editable} />
        </Field>
        <Field label="Category">
          <Select name="category" defaultValue={product?.category ?? "Custom"} disabled={!editable}>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Unit">
          <Select name="unit" defaultValue={product?.unit ?? "unit"} disabled={!editable}>
            {units.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Currency">
          <Select name="currency" defaultValue={product?.currency ?? "TRY"} disabled={!editable}>
            {currencies.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Unit price">
          <Input
            name="unit_price"
            type="number"
            min="0"
            step="0.01"
            defaultValue={priceValue}
            required
            disabled={!editable}
          />
        </Field>
        <Field label="Tax rate">
          <Input
            name="tax_rate"
            type="number"
            min="0"
            max="100"
            step="0.01"
            defaultValue={product?.tax_rate ?? 20}
            required
            disabled={!editable}
          />
        </Field>
        <Field label="Status">
          <Select name="active" defaultValue={product?.active ? "true" : "false"} disabled={!editable}>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </Select>
        </Field>
      </div>

      <Field label="Description">
        <Textarea name="description" defaultValue={product?.description ?? ""} required disabled={!editable} />
      </Field>

      <Field label="Specifications">
        <Textarea
          name="specifications"
          defaultValue={(product?.specifications ?? []).join("\n")}
          placeholder="Steel frame\nThermal insulation\nPlug-and-play electrical pack"
          disabled={!editable}
        />
      </Field>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
        <p>
          {product ? (
            <>
              Current catalog price: <span className="font-medium text-slate-950 dark:text-white">{formatCurrency(priceValue, product.currency)}</span>
            </>
          ) : (
            "Products stay organization scoped and are validated on the server before saving."
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
