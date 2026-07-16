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
import { getProductRecordBadge, getProductRecordRestrictionMessage } from "@/server/services/product-domain";

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

  return (
    <div className="space-y-6">
      {toastMessage ? <FlashToast message={toastMessage} tone={toastTone} /> : null}

      <PageHeader
        eyebrow="Catalog"
        title={data.product.name}
        description="Review pricing, active state, and the current organization scope."
        actions={
          <>
            <Link href="/products" className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10">
              <ArrowLeft className="h-4 w-4" />
              Back to catalog
            </Link>
            {editable ? (
              <Link href={`/products/${data.product.id}/edit?redirect_to=/products/${data.product.id}`} className="inline-flex h-10 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950">
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
        <Metric label="Price" value={data.product.price_label} />
        <Metric label="SKU" value={data.product.sku ?? "—"} />
        <Metric label="Status" value={data.product.active ? "Active" : "Inactive"} />
        <Metric label="Updated" value={data.product.updated_at ? formatDateTime(data.product.updated_at) : "—"} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <SectionCard title="Product summary" description="Core catalog details and pricing context.">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {badge ? <StatusBadge tone={badge.tone} title={badge.title}>{badge.label}</StatusBadge> : null}
              <StatusBadge tone={data.product.active ? "success" : "neutral"}>{data.product.active ? "Active" : "Inactive"}</StatusBadge>
            </div>
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-400">{data.product.description}</p>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Stat label="Category" value={data.product.category} />
              <Stat label="Unit" value={data.product.unit} />
              <Stat label="Currency" value={data.product.currency} />
              <Stat label="Tax rate" value={`${data.product.tax_rate}%`} />
            </dl>
            {restriction ? <p className="text-sm text-slate-500 dark:text-slate-400">{restriction}</p> : null}
          </div>
        </SectionCard>

        <SectionCard title="Specifications" description="Used by quotes and catalog browsing.">
          <div className="flex flex-wrap gap-2">
            {data.product.specifications.length ? (
              data.product.specifications.map((spec) => (
                <StatusBadge key={spec} tone="neutral">{spec}</StatusBadge>
              ))
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">No specifications recorded.</p>
            )}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Actions" description="Manage the record if the workspace role allows it.">
        <div className="flex flex-wrap gap-3">
          {editable ? (
            <ProductDeleteDialog
              productId={data.product.id}
              productName={data.product.name}
              redirectTo="/products"
              recordMode={data.product.recordMode}
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
