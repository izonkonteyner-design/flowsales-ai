import { Plus, Search, SlidersHorizontal } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { getProducts } from "@/server/services/crm-data";

export default function ProductsPage() {
  const products = getProducts();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Catalog"
        title="Products"
        description="Maintain the approved product catalog that powers accurate quotes and AI answers."
        actions={
          <>
            <button className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10">
              <SlidersHorizontal className="h-4 w-4" />
              Filters
            </button>
            <button className="inline-flex h-10 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950">
              <Plus className="h-4 w-4" />
              New product
            </button>
          </>
        }
      />

      <SectionCard title="Approved catalog" description="All price-sensitive items are stored as organized product records.">
        <div className="mb-4 relative max-w-xl">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Search products, categories, or specifications" className="pl-10" />
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {products.map((product) => (
            <article
              key={product.id}
              className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-slate-950 dark:text-white">{product.name}</p>
                  <p className="mt-1 text-sm text-slate-500">{product.category}</p>
                </div>
                <StatusBadge tone={product.active ? "success" : "neutral"}>
                  {product.active ? "Active" : "Inactive"}
                </StatusBadge>
              </div>

              <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-400">
                {product.description}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {product.specifications.map((spec) => (
                  <Badge key={spec} variant="secondary">
                    {spec}
                  </Badge>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-slate-500">Base price</span>
                <span className="font-medium text-slate-950 dark:text-white">
                  {formatCurrency(product.base_price, product.currency)}
                </span>
              </div>
            </article>
          ))}
        </div>

        {!products.length ? (
          <div className="mt-6">
            <EmptyState
              title="No products yet"
              description="Create approved products before generating quotes so pricing remains consistent."
            />
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}
