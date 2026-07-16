"use client";

import { useState, type ReactNode } from "react";
import { ImagePlus, GripVertical, Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/utils";
import type { ProductRow } from "@/server/services/products";
import type { ProductSpecification } from "@/types/crm";

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

type ProductFormState = {
  sku: string;
  name: string;
  category: string;
  description: string;
  short_description: string;
  brand: string;
  model: string;
  unit_price: string;
  currency: string;
  tax_rate: string;
  unit: string;
  width: string;
  length: string;
  height: string;
  area_m2: string;
  weight_kg: string;
  material: string;
  color: string;
  stock_quantity: string;
  minimum_order_quantity: string;
  lead_time_days: string;
  warranty_months: string;
  internal_code: string;
  barcode: string;
  tags: string;
  features: string[];
  specifications: ProductSpecification[];
  image_url: string;
  gallery_urls: string[];
  featured: boolean;
  active: boolean;
  notes: string;
};

function createInitialState(product?: ProductRow | null): ProductFormState {
  return {
    sku: product?.sku ?? "",
    name: product?.name ?? "",
    category: product?.category ?? "Custom",
    description: product?.description ?? "",
    short_description: product?.short_description ?? "",
    brand: product?.brand ?? "",
    model: product?.model ?? "",
    unit_price: String(product?.unit_price ?? product?.base_price ?? 0),
    currency: product?.currency ?? "TRY",
    tax_rate: String(product?.tax_rate ?? 20),
    unit: product?.unit ?? "unit",
    width: String(product?.width ?? ""),
    length: String(product?.length ?? ""),
    height: String(product?.height ?? ""),
    area_m2: String(product?.area_m2 ?? ""),
    weight_kg: String(product?.weight_kg ?? ""),
    material: product?.material ?? "",
    color: product?.color ?? "",
    stock_quantity: String(product?.stock_quantity ?? 0),
    minimum_order_quantity: String(product?.minimum_order_quantity ?? 1),
    lead_time_days: String(product?.lead_time_days ?? 0),
    warranty_months: String(product?.warranty_months ?? 0),
    internal_code: product?.internal_code ?? "",
    barcode: product?.barcode ?? "",
    tags: (product?.tags ?? []).join(", "),
    features: product?.features?.length ? product.features : [""],
    specifications: product?.specifications?.length ? product.specifications : [{ key: "", value: "" }],
    image_url: product?.image_url ?? "",
    gallery_urls: product?.gallery_urls?.length ? product.gallery_urls : [""],
    featured: product?.featured ?? false,
    active: product?.active ?? true,
    notes: product?.notes ?? "",
  };
}

function hiddenList(values: string[]) {
  return JSON.stringify(values.map((value) => value.trim()).filter(Boolean));
}

function hiddenSpecifications(values: ProductSpecification[]) {
  return JSON.stringify(
    values
      .map((value) => ({ key: value.key.trim(), value: value.value.trim() }))
      .filter((value) => value.key || value.value),
  );
}

function parseTagsPreview(value: string) {
  return Array.from(new Set(value.split(",").map((item) => item.trim()).filter(Boolean)));
}

export function ProductForm({
  action,
  redirectTo,
  product,
  submitLabel,
  productId,
  editable = true,
  restrictionMessage,
}: ProductFormProps) {
  const [state, setState] = useState<ProductFormState>(() => createInitialState(product));

  const updateField = <K extends keyof ProductFormState>(key: K, value: ProductFormState[K]) => {
    setState((current) => ({ ...current, [key]: value }));
  };

  const updateFeature = (index: number, value: string) => {
    setState((current) => {
      const next = [...current.features];
      next[index] = value;
      return { ...current, features: next };
    });
  };

  const addFeature = () => setState((current) => ({ ...current, features: [...current.features, ""] }));
  const removeFeature = (index: number) =>
    setState((current) => ({ ...current, features: current.features.filter((_, featureIndex) => featureIndex !== index) || [""] }));
  const moveFeature = (index: number, direction: -1 | 1) =>
    setState((current) => {
      const next = [...current.features];
      const target = index + direction;
      if (target < 0 || target >= next.length) {
        return current;
      }
      [next[index], next[target]] = [next[target], next[index]];
      return { ...current, features: next };
    });

  const updateSpecification = (index: number, key: "key" | "value", value: string) => {
    setState((current) => {
      const next = [...current.specifications];
      next[index] = { ...next[index], [key]: value };
      return { ...current, specifications: next };
    });
  };

  const addSpecification = () =>
    setState((current) => ({ ...current, specifications: [...current.specifications, { key: "", value: "" }] }));
  const removeSpecification = (index: number) =>
    setState((current) => ({
      ...current,
      specifications: current.specifications.filter((_, specificationIndex) => specificationIndex !== index) || [{ key: "", value: "" }],
    }));

  const updateGalleryUrl = (index: number, value: string) => {
    setState((current) => {
      const next = [...current.gallery_urls];
      next[index] = value;
      return { ...current, gallery_urls: next };
    });
  };

  const addGalleryUrl = () => setState((current) => ({ ...current, gallery_urls: [...current.gallery_urls, ""] }));
  const removeGalleryUrl = (index: number) =>
    setState((current) => ({ ...current, gallery_urls: current.gallery_urls.filter((_, urlIndex) => urlIndex !== index) || [""] }));
  const moveGalleryUrl = (index: number, direction: -1 | 1) =>
    setState((current) => {
      const next = [...current.gallery_urls];
      const target = index + direction;
      if (target < 0 || target >= next.length) {
        return current;
      }
      [next[index], next[target]] = [next[target], next[index]];
      return { ...current, gallery_urls: next };
    });

  const tagsPreview = parseTagsPreview(state.tags);
  const canEdit = editable;

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="redirect_to" value={redirectTo} />
      {productId ? <input type="hidden" name="product_id" value={productId} /> : null}
      <input type="hidden" name="active" value={state.active ? "true" : "false"} />
      <input type="hidden" name="featured" value={state.featured ? "true" : "false"} />
      <input type="hidden" name="features_json" value={hiddenList(state.features)} />
      <input type="hidden" name="specifications_json" value={hiddenSpecifications(state.specifications)} />
      <input type="hidden" name="gallery_urls_json" value={hiddenList(state.gallery_urls)} />

      <Section title="Basic information" description="SKU, naming, and descriptive copy for the catalog.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="SKU">
            <Input name="sku" defaultValue={state.sku} required disabled={!canEdit} onChange={(event) => updateField("sku", event.target.value)} />
          </Field>
          <Field label="Name">
            <Input name="name" defaultValue={state.name} required disabled={!canEdit} onChange={(event) => updateField("name", event.target.value)} />
          </Field>
          <Field label="Category">
            <Select name="category" value={state.category} disabled={!canEdit} onChange={(event) => updateField("category", event.target.value)}>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Unit">
            <Select name="unit" value={state.unit} disabled={!canEdit} onChange={(event) => updateField("unit", event.target.value)}>
              {units.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Brand">
            <Input name="brand" defaultValue={state.brand} disabled={!canEdit} onChange={(event) => updateField("brand", event.target.value)} />
          </Field>
          <Field label="Model">
            <Input name="model" defaultValue={state.model} disabled={!canEdit} onChange={(event) => updateField("model", event.target.value)} />
          </Field>
          <Field label="Short description">
            <Input name="short_description" defaultValue={state.short_description} disabled={!canEdit} onChange={(event) => updateField("short_description", event.target.value)} />
          </Field>
        </div>

        <Field label="Description">
          <Textarea name="description" defaultValue={state.description} required disabled={!canEdit} onChange={(event) => updateField("description", event.target.value)} />
        </Field>
      </Section>

      <Section title="Pricing and tax" description="Commercial numbers used in quotes and reporting.">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Currency">
            <Select name="currency" value={state.currency} disabled={!canEdit} onChange={(event) => updateField("currency", event.target.value)}>
              {currencies.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Unit price">
            <Input name="unit_price" type="number" min="0" step="0.01" value={state.unit_price} required disabled={!canEdit} onChange={(event) => updateField("unit_price", event.target.value)} />
          </Field>
          <Field label="Tax rate">
            <Input name="tax_rate" type="number" min="0" max="100" step="0.01" value={state.tax_rate} required disabled={!canEdit} onChange={(event) => updateField("tax_rate", event.target.value)} />
          </Field>
          <Field label="Status">
            <Select name="active" value={state.active ? "true" : "false"} disabled={!canEdit} onChange={(event) => updateField("active", event.target.value === "true")}>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </Select>
          </Field>
          <Field label="Featured">
            <Select name="featured" value={state.featured ? "true" : "false"} disabled={!canEdit} onChange={(event) => updateField("featured", event.target.value === "true")}>
              <option value="false">No</option>
              <option value="true">Yes</option>
            </Select>
          </Field>
          <Field label="Internal code">
            <Input name="internal_code" defaultValue={state.internal_code} disabled={!canEdit} onChange={(event) => updateField("internal_code", event.target.value)} />
          </Field>
          <Field label="Barcode">
            <Input name="barcode" defaultValue={state.barcode} disabled={!canEdit} onChange={(event) => updateField("barcode", event.target.value)} />
          </Field>
        </div>
      </Section>

      <Section title="Dimensions and logistics" description="Physical size, inventory, and planning information.">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Width">
            <Input name="width" type="number" min="0" step="0.01" value={state.width} disabled={!canEdit} onChange={(event) => updateField("width", event.target.value)} />
          </Field>
          <Field label="Length">
            <Input name="length" type="number" min="0" step="0.01" value={state.length} disabled={!canEdit} onChange={(event) => updateField("length", event.target.value)} />
          </Field>
          <Field label="Height">
            <Input name="height" type="number" min="0" step="0.01" value={state.height} disabled={!canEdit} onChange={(event) => updateField("height", event.target.value)} />
          </Field>
          <Field label="Area m2">
            <Input name="area_m2" type="number" min="0" step="0.01" value={state.area_m2} disabled={!canEdit} onChange={(event) => updateField("area_m2", event.target.value)} />
          </Field>
          <Field label="Weight kg">
            <Input name="weight_kg" type="number" min="0" step="0.01" value={state.weight_kg} disabled={!canEdit} onChange={(event) => updateField("weight_kg", event.target.value)} />
          </Field>
          <Field label="Material">
            <Input name="material" defaultValue={state.material} disabled={!canEdit} onChange={(event) => updateField("material", event.target.value)} />
          </Field>
          <Field label="Color">
            <Input name="color" defaultValue={state.color} disabled={!canEdit} onChange={(event) => updateField("color", event.target.value)} />
          </Field>
          <Field label="Stock quantity">
            <Input name="stock_quantity" type="number" min="0" step="1" value={state.stock_quantity} disabled={!canEdit} onChange={(event) => updateField("stock_quantity", event.target.value)} />
          </Field>
          <Field label="Minimum order quantity">
            <Input name="minimum_order_quantity" type="number" min="1" step="1" value={state.minimum_order_quantity} disabled={!canEdit} onChange={(event) => updateField("minimum_order_quantity", event.target.value)} />
          </Field>
          <Field label="Lead time days">
            <Input name="lead_time_days" type="number" min="0" step="1" value={state.lead_time_days} disabled={!canEdit} onChange={(event) => updateField("lead_time_days", event.target.value)} />
          </Field>
          <Field label="Warranty months">
            <Input name="warranty_months" type="number" min="0" step="1" value={state.warranty_months} disabled={!canEdit} onChange={(event) => updateField("warranty_months", event.target.value)} />
          </Field>
        </div>
      </Section>

      <Section title="Features" description="One feature per line with reorder support.">
        <div className="space-y-3">
          {state.features.map((feature, index) => (
            <div key={`${index}-${feature}`} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/5">
              <GripVertical className="h-4 w-4 shrink-0 text-slate-400" />
              <Input
                value={feature}
                placeholder="Steel frame"
                disabled={!canEdit}
                onChange={(event) => updateFeature(index, event.target.value)}
              />
              <div className="flex items-center gap-2">
                <IconButton label="Move up" disabled={!canEdit || index === 0} onClick={() => moveFeature(index, -1)}>
                  <ArrowUp className="h-4 w-4" />
                </IconButton>
                <IconButton label="Move down" disabled={!canEdit || index === state.features.length - 1} onClick={() => moveFeature(index, 1)}>
                  <ArrowDown className="h-4 w-4" />
                </IconButton>
                <IconButton label="Remove feature" disabled={!canEdit} onClick={() => removeFeature(index)}>
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </div>
            </div>
          ))}
          <button
            type="button"
            disabled={!canEdit}
            onClick={addFeature}
            className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <Plus className="h-4 w-4" />
            Add feature
          </button>
        </div>
      </Section>

      <Section title="Technical specifications" description="Key/value rows for measurable product attributes.">
        <div className="space-y-3">
          {state.specifications.map((specification, index) => (
            <div key={`${index}-${specification.key}`} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 sm:grid-cols-[1fr_1.4fr_auto] dark:border-white/10 dark:bg-white/5">
              <Input
                value={specification.key}
                placeholder="Width"
                disabled={!canEdit}
                onChange={(event) => updateSpecification(index, "key", event.target.value)}
              />
              <Input
                value={specification.value}
                placeholder="300 cm"
                disabled={!canEdit}
                onChange={(event) => updateSpecification(index, "value", event.target.value)}
              />
              <div className="flex items-center gap-2">
                <IconButton label="Remove specification" disabled={!canEdit} onClick={() => removeSpecification(index)}>
                  <Trash2 className="h-4 w-4" />
                </IconButton>
                <IconButton label="Move specification up" disabled={!canEdit || index === 0} onClick={() => {
                  setState((current) => {
                    const next = [...current.specifications];
                    const target = index - 1;
                    if (target < 0) return current;
                    [next[index], next[target]] = [next[target], next[index]];
                    return { ...current, specifications: next };
                  });
                }}>
                  <ArrowUp className="h-4 w-4" />
                </IconButton>
              </div>
            </div>
          ))}
          <button
            type="button"
            disabled={!canEdit}
            onClick={addSpecification}
            className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <Plus className="h-4 w-4" />
            Add specification
          </button>
        </div>
      </Section>

      <Section title="Images" description="Main image and gallery URLs without external upload services.">
        <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
          <div className="space-y-4">
            <Field label="Main image URL">
              <Input
                name="image_url"
                defaultValue={state.image_url}
                placeholder="https://example.com/product.jpg"
                disabled={!canEdit}
                onChange={(event) => updateField("image_url", event.target.value)}
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <StatusChip tone="neutral">{state.image_url ? "Main image set" : "No main image"}</StatusChip>
              <StatusChip tone="neutral">{state.gallery_urls.filter(Boolean).length} gallery images</StatusChip>
            </div>
            <PreviewImage src={state.image_url} label={state.name || "Product"} />
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Gallery URLs</p>
            {state.gallery_urls.map((url, index) => (
              <div key={`${index}-${url}`} className="flex items-center gap-3">
                <Input value={url} placeholder="https://example.com/gallery.jpg" disabled={!canEdit} onChange={(event) => updateGalleryUrl(index, event.target.value)} />
                <div className="flex items-center gap-2">
                  <IconButton label="Move gallery image up" disabled={!canEdit || index === 0} onClick={() => moveGalleryUrl(index, -1)}>
                    <ArrowUp className="h-4 w-4" />
                  </IconButton>
                  <IconButton label="Move gallery image down" disabled={!canEdit || index === state.gallery_urls.length - 1} onClick={() => moveGalleryUrl(index, 1)}>
                    <ArrowDown className="h-4 w-4" />
                  </IconButton>
                  <IconButton label="Remove gallery image" disabled={!canEdit} onClick={() => removeGalleryUrl(index)}>
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>
              </div>
            ))}
            <button
              type="button"
              disabled={!canEdit}
              onClick={addGalleryUrl}
              className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
            >
              <ImagePlus className="h-4 w-4" />
              Add gallery image
            </button>

            <div className="grid grid-cols-2 gap-3">
              {state.gallery_urls.filter(Boolean).map((url) => (
                <PreviewImage key={url} src={url} label="Gallery image" />
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Tags and notes" description="Search labels, internal notes, and sales context.">
        <div className="grid gap-4">
          <Field label="Tags">
            <Input
              name="tags"
              defaultValue={state.tags}
              placeholder="container, premium, modular"
              disabled={!canEdit}
              onChange={(event) => updateField("tags", event.target.value)}
            />
          </Field>
          {tagsPreview.length ? (
            <div className="flex flex-wrap gap-2">
              {tagsPreview.map((tag) => (
                <StatusChip key={tag} tone="neutral">
                  {tag}
                </StatusChip>
              ))}
            </div>
          ) : null}
          <Field label="Notes">
            <Textarea name="notes" defaultValue={state.notes} placeholder="Internal notes for the sales team." disabled={!canEdit} onChange={(event) => updateField("notes", event.target.value)} />
          </Field>
        </div>
      </Section>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
        <p>
          {product ? (
            <>
              Current catalog price:{" "}
              <span className="font-medium text-slate-950 dark:text-white">{formatCurrency(state.unit_price ? Number(state.unit_price) : 0, state.currency)}</span>
            </>
          ) : (
            "Products stay organization scoped and are validated on the server before saving."
          )}
        </p>
        {restrictionMessage ? <p className="mt-2">{restrictionMessage}</p> : null}
      </div>

      <button
        type="submit"
        disabled={!canEdit}
        title={restrictionMessage || undefined}
        className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
      >
        {submitLabel}
      </button>
    </form>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-950/60">
      <div>
        <h3 className="text-base font-semibold text-slate-950 dark:text-white">{title}</h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
      </div>
      {children}
    </section>
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

function StatusChip({ tone, children }: { tone: "neutral" | "success"; children: ReactNode }) {
  return (
    <span
      className={
        tone === "success"
          ? "inline-flex items-center rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300"
          : "inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300"
      }
    >
      {children}
    </span>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
    >
      {children}
    </button>
  );
}

function PreviewImage({ src, label }: { src: string; label: string }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className="flex min-h-48 items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
        Preview unavailable
      </div>
    );
  }

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={label} onError={() => setFailed(true)} className="h-48 w-full rounded-3xl object-cover" />
    </>
  );
}
