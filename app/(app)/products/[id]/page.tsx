import Link from "next/link";
import { ArrowLeft, Pencil } from "lucide-react";

import { ProductDeleteDialog } from "@/components/products/product-delete-dialog";
import { FlashToast } from "@/components/shared/flash-toast";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDateTime } from "@/lib/utils";
import { getProductDetailData } from "@/server/services/products";
import {
  getProductDimensionSummary,
  getProductRecordBadge,
  getProductRecordRestrictionMessage,
} from "@/server/services/product-domain";

type ProductDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ProductDetailPage({ params, searchParams }: ProductDetailPageProps) {
  const [{ id }, rawSearchParams] = await Promise.all([params, searchParams]);
  const data = await getProductDetailData(id);
  const toastMessage = typeof rawSearchParams.toast === "string" ? rawSearchParams.toast : "";
  const toastTone =
    rawSearchParams.tone === "danger" || rawSearchParams.tone === "warning" || rawSearchParams.tone === "info"
      ? rawSearchParams.tone
      : "success";
  const badge = data.product ? getProductRecordBadge(data.product.recordMode) : null;
  const restriction = data.product ? getProductRecordRestrictionMessage(data.product.recordMode, data.context.role) : "";
  const editable = data.product ? !restriction : false;

  if (data.error && !data.product) {
    return (
      <div className="space-y-6">
        {toastMessage ? <FlashToast message={toastMessage} tone={toastTone} /> : null}
        <PageHeader
          eyebrow="Catalog"
          title="Product detail"
          description="Inspect the catalog record."
          actions={
            <Link href="/products" className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10">
              <ArrowLeft className="h-4 w-4" />
              Back to catalog
            </Link>
          }
        />
        <EmptyState title="Product not available" description={data.error} actionHref="/products" actionLabel="Back to catalog" />
      </div>
    );
  }

  if (!data.product) {
    return null;
  }

  const product = data.product;

  return (
    <div className="space-y-6">
      {toastMessage ? <FlashToast message={toastMessage} tone={toastTone} /> : null}

      <PageHeader
        eyebrow="Catalog"
        title={product.name}
        description="Review pricing, inventory, and product enrichment fields."
        actions={
          <>
            <Link href="/products" className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10">
              <ArrowLeft className="h-4 w-4" />
              Back to catalog
            </Link>
            {editable ? (
              <Link href={`/products/${product.id}/edit?redirect_to=/products/${product.id}`} className="inline-flex h-10 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950">
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
        <Metric label="Price" value={product.price_label} />
        <Metric label="SKU" value={product.sku || "N/A"} />
        <Metric label="Status" value={product.active ? "Active" : "Inactive"} />
        <Metric label="Updated" value={product.updated_at ? formatDateTime(product.updated_at) : "N/A"} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <SectionCard title="Product summary" description="Core catalog details, logistics, and pricing context.">
          <div className="space-y-5">
            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {badge ? <StatusBadge tone={badge.tone} title={badge.title}>{badge.label}</StatusBadge> : null}
                  <StatusBadge tone={product.active ? "success" : "neutral"}>{product.active ? "Active" : "Inactive"}</StatusBadge>
                  {product.featured ? <StatusBadge tone="neutral">Featured</StatusBadge> : null}
                </div>
                <p className="text-sm leading-6 text-slate-600 dark:text-slate-400">{product.description}</p>
                {product.short_description ? (
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{product.short_description}</p>
                ) : null}
                <dl className="grid gap-4 sm:grid-cols-2">
                  <Stat label="Category" value={product.category} />
                  <Stat label="Unit" value={product.unit} />
                  <Stat label="Currency" value={product.currency} />
                  <Stat label="Tax rate" value={`${product.tax_rate}%`} />
                  <Stat label="Brand" value={product.brand || "N/A"} />
                  <Stat label="Model" value={product.model || "N/A"} />
                  <Stat label="Internal code" value={product.internal_code || "N/A"} />
                  <Stat label="Barcode" value={product.barcode || "N/A"} />
                </dl>
              </div>

              <div className="space-y-4">
                <div className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/5">
                  {product.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.image_url} alt={product.name} className="h-56 w-full object-cover" />
                  ) : (
                    <div className="flex h-56 items-center justify-center px-4 text-sm text-slate-500 dark:text-slate-400">No main image available.</div>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Metric label="Stock" value={String(product.stock_quantity ?? 0)} />
                  <Metric label="Lead time" value={`${product.lead_time_days ?? 0} days`} />
                  <Metric label="Warranty" value={`${product.warranty_months ?? 0} months`} />
                  <Metric label="Gallery" value={String(product.gallery_count)} />
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <Stat label="Dimensions" value={getProductDimensionSummary(product)} />
              <Stat label="Weight" value={product.weight_kg ? `${product.weight_kg} kg` : "N/A"} />
              <Stat label="Material" value={product.material || "N/A"} />
              <Stat label="Color" value={product.color || "N/A"} />
              <Stat label="Minimum order" value={String(product.minimum_order_quantity ?? 1)} />
              <Stat label="Gallery images" value={String(product.gallery_count)} />
            </div>

            {product.tags.length ? (
              <div className="flex flex-wrap gap-2">
                {product.tags.map((tag) => (
                  <StatusBadge key={tag} tone="neutral">
                    {tag}
                  </StatusBadge>
                ))}
              </div>
            ) : null}

            {restriction ? <p className="text-sm text-slate-500 dark:text-slate-400">{restriction}</p> : null}
          </div>
        </SectionCard>

        <div className="space-y-6">
          <SectionCard title="Features" description="Selling points used in quotes and catalog browsing.">
            <div className="flex flex-wrap gap-2">
              {product.features.length ? (
                product.features.map((feature) => (
                  <StatusBadge key={feature} tone="neutral">
                    {feature}
                  </StatusBadge>
                ))
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">No features recorded.</p>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Specifications" description="Used by quotes and catalog browsing.">
            <div className="space-y-2">
              {product.specifications.length ? (
                product.specifications.map((spec) => (
                  <div key={`${spec.key}:${spec.value}`} className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-white/5">
                    <p className="text-sm font-medium text-slate-950 dark:text-white">{spec.key}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">{spec.value}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">No specifications recorded.</p>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Gallery" description="Additional catalog images.">
            {product.gallery_urls.length ? (
              <div className="grid grid-cols-2 gap-3">
                {product.gallery_urls.map((url, index) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={`${url}-${index}`} src={url} alt={`${product.name} gallery ${index + 1}`} className="h-32 w-full rounded-2xl object-cover" />
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">No gallery images available.</p>
            )}
          </SectionCard>
        </div>
      </div>

      <SectionCard title="Notes" description="Internal catalog notes and sales guidance.">
        {product.notes ? (
          <p className="text-sm leading-6 text-slate-600 dark:text-slate-400">{product.notes}</p>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">No internal notes recorded.</p>
        )}
      </SectionCard>

      <SectionCard title="Actions" description="Manage the record if the workspace role allows it.">
        <div className="flex flex-wrap gap-3">
          {editable ? (
            <ProductDeleteDialog
              productId={data.product.id}
              productName={product.name}
              redirectTo="/products"
              recordMode={product.recordMode}
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
