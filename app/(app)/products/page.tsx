import Link from "next/link";
import { Plus } from "lucide-react";

import { FlashToast } from "@/components/shared/flash-toast";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatDateTime } from "@/lib/utils";
import { getProductPageData } from "@/server/services/products";
import {
  getProductRecordBadge,
  getProductRecordRestrictionMessage,
  normalizeProductSearchParams,
  type ProductFilterState,
} from "@/server/services/product-domain";
import { ProductDeleteDialog } from "@/components/products/product-delete-dialog";

type ProductsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function buildProductHref(filters: ProductFilterState, overrides: Partial<ProductFilterState> = {}) {
  const merged = { ...filters, ...overrides };
  const params = new URLSearchParams();

  if (merged.query) params.set("query", merged.query);
  if (merged.active !== "all") params.set("active", merged.active);
  if (merged.sort !== "name") params.set("sort", merged.sort);

  const query = params.toString();
  return query ? `/products?${query}` : "/products";
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const rawSearchParams = await searchParams;
  const data = await getProductPageData(rawSearchParams);
  const filters = normalizeProductSearchParams(rawSearchParams);
  const toastMessage = typeof rawSearchParams.toast === "string" ? rawSearchParams.toast : "";
  const toastTone =
    rawSearchParams.tone === "danger" || rawSearchParams.tone === "warning" || rawSearchParams.tone === "info"
      ? rawSearchParams.tone
      : "success";
  const currentHref = buildProductHref(filters);
  const createHref = `/products/new?redirect_to=${encodeURIComponent(currentHref)}`;

  return (
    <div className="space-y-6">
      {toastMessage ? <FlashToast message={toastMessage} tone={toastTone} /> : null}

      <PageHeader
        eyebrow="Catalog"
        title="Products"
        description="Maintain the approved product catalog that powers accurate quotes and AI answers."
        actions={
          <Link
            href={createHref}
            className="inline-flex h-10 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950"
          >
            <Plus className="h-4 w-4" />
            New product
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Total products" value={String(data.total)} />
        <Metric label="Live catalog" value={String(data.products.filter((product) => product.recordMode === "live").length)} />
        <Metric label="Active" value={String(data.products.filter((product) => product.active).length)} />
        <Metric label="Inactive" value={String(data.products.filter((product) => !product.active).length)} />
      </div>

      <SectionCard title="Catalog filters" description="Search by SKU, name, or category and narrow the active inventory.">
        <form method="get" className="grid gap-3 xl:grid-cols-[1.8fr_0.8fr_0.8fr_auto]">
          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Search</span>
            <Input name="query" defaultValue={data.filters.query} placeholder="Name, SKU, category" />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Status</span>
            <Select name="active" defaultValue={data.filters.active}>
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Sort</span>
            <Select name="sort" defaultValue={data.filters.sort}>
              <option value="name">Name</option>
              <option value="price">Price</option>
              <option value="newest">Newest</option>
            </Select>
          </label>

          <div className="flex items-end gap-3">
            <button
              type="submit"
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950"
            >
              Apply
            </button>
            <Link
              href="/products"
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
            >
              Reset
            </Link>
          </div>
        </form>
      </SectionCard>

      {data.error ? (
        <EmptyState
          title="Unable to load live products"
          description={data.error}
          actionHref="/products"
          actionLabel="Retry"
        />
      ) : data.products.length ? (
        <SectionCard title="Product catalog" description="A responsive list with live and demo record badges.">
          <div className="overflow-hidden rounded-3xl border border-slate-200 dark:border-white/10">
            <div className="hidden grid-cols-[1.1fr_1.2fr_0.8fr_0.8fr_0.8fr_1fr_0.9fr] gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 lg:grid dark:border-white/10 dark:bg-white/5">
              <span>Product</span>
              <span>Category</span>
              <span>SKU</span>
              <span>Status</span>
              <span>Price</span>
              <span>Updated</span>
              <span>Actions</span>
            </div>

            <div className="divide-y divide-slate-200 dark:divide-white/10">
              {data.products.map((product) => {
                const badge = getProductRecordBadge(product.recordMode);
                const restriction = getProductRecordRestrictionMessage(product.recordMode, data.context.role);
                return (
                  <article key={product.id} className="block px-4 py-4 transition hover:bg-slate-50 dark:hover:bg-white/5">
                    <div className="hidden grid-cols-[1.1fr_1.2fr_0.8fr_0.8fr_0.8fr_1fr_0.9fr] gap-4 lg:grid">
                      <div>
                        <Link href={`/products/${product.id}`} className="font-medium text-slate-950 underline-offset-4 hover:underline dark:text-white">
                          {product.name}
                        </Link>
                        <p className="mt-1 text-sm text-slate-500">{product.description}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <StatusBadge tone={badge.tone} title={badge.title}>
                            {badge.label}
                          </StatusBadge>
                        </div>
                      </div>
                      <div className="text-sm text-slate-600 dark:text-slate-400">{product.category}</div>
                      <div className="text-sm text-slate-600 dark:text-slate-400">{product.sku ?? "—"}</div>
                      <div>
                        <StatusBadge tone={product.active ? "success" : "neutral"}>{product.active ? "Active" : "Inactive"}</StatusBadge>
                      </div>
                      <div className="text-sm font-medium text-slate-950 dark:text-white">
                        {product.price_label}
                      </div>
                      <div className="text-sm text-slate-600 dark:text-slate-400">
                        {product.updated_at ? formatDateTime(product.updated_at) : "—"}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/products/${product.id}`}
                          className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
                        >
                          View
                        </Link>
                        {restriction ? (
                          <span title={restriction} className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
                            Edit
                          </span>
                        ) : (
                          <Link
                            href={`/products/${product.id}/edit?redirect_to=${encodeURIComponent(currentHref)}`}
                            className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
                          >
                            Edit
                          </Link>
                        )}
                        <ProductDeleteDialog
                          productId={product.id}
                          productName={product.name}
                          redirectTo={currentHref}
                          recordMode={product.recordMode}
                          role={data.context.role}
                        />
                      </div>
                    </div>

                    <div className="space-y-4 lg:hidden">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <Link href={`/products/${product.id}`} className="font-medium text-slate-950 underline-offset-4 hover:underline dark:text-white">
                            {product.name}
                          </Link>
                          <p className="mt-1 text-sm text-slate-500">{product.category}</p>
                        </div>
                        <StatusBadge tone={product.active ? "success" : "neutral"}>{product.active ? "Active" : "Inactive"}</StatusBadge>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <StatusBadge tone={badge.tone} title={badge.title}>{badge.label}</StatusBadge>
                        <StatusBadge tone="neutral">{product.sku ?? "No SKU"}</StatusBadge>
                        <StatusBadge tone="neutral">{product.price_label}</StatusBadge>
                      </div>

                      <p className="text-sm leading-6 text-slate-600 dark:text-slate-400">{product.description}</p>

                      {restriction ? (
                        <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">{restriction}</p>
                      ) : null}

                      <div className="flex flex-wrap gap-2">
                        <Link href={`/products/${product.id}`} className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10">
                          View
                        </Link>
                        {restriction ? (
                          <span className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
                            Edit
                          </span>
                        ) : (
                          <Link href={`/products/${product.id}/edit?redirect_to=${encodeURIComponent(currentHref)}`} className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10">
                            Edit
                          </Link>
                        )}
                        <ProductDeleteDialog
                          productId={product.id}
                          productName={product.name}
                          redirectTo={currentHref}
                          recordMode={product.recordMode}
                          role={data.context.role}
                        />
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </SectionCard>
      ) : (
        <EmptyState
          title="No products yet"
          description="Create the first approved product so quotes can use live pricing."
          actionHref={createHref}
          actionLabel="New product"
        />
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-slate-950/60">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{value}</p>
    </div>
  );
}
