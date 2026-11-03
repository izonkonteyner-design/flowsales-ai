import Link from "next/link";
import { cookies } from "next/headers";
import { Layers, Package, PackageCheck, PackageX, Plus } from "lucide-react";

import { FlashToast } from "@/components/shared/flash-toast";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { MetricCard } from "@/components/shared/metric-card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatDateTime } from "@/lib/utils";
import { LOCALE_COOKIE, normalizeLocale } from "@/lib/i18n";
import { getProductPageData } from "@/server/services/products";
import {
  getProductRecordBadge,
  getProductRecordRestrictionMessage,
  normalizeProductSearchParams,
  type ProductFilterState,
} from "@/server/services/product-domain";
import { ProductDeleteDialog } from "@/components/products/product-delete-dialog";

type ProductsPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const copy = {
  tr: {
    eyebrow: "Katalog & Envanter",
    title: "Ürün ve Hizmetler",
    description: "Doğru teklifler ve satış operasyonları için onaylı ürün kataloğunu yönetin.",
    newProduct: "Yeni Ürün Ekle",
    total: "Toplam Ürün",
    live: "Canlı Katalog",
    active: "Aktif Ürünler",
    inactive: "Pasif Ürünler",
    filters: "Katalog Filtreleri",
    filtersDesc: "SKU, ad veya kategori bazında filtreleme yapın.",
    search: "Arama",
    searchPlaceholder: "Ürün adı, SKU, kategori...",
    status: "Durum",
    all: "Tümü",
    sort: "Sıralama",
    name: "Ada Göre",
    price: "Fiyata Göre",
    newest: "En Yeni",
    apply: "Uygula",
    reset: "Sıfırla",
    loadError: "Canlı ürünler yüklenemedi",
    retry: "Yeniden Dene",
    catalog: "Ürün Kataloğu Listesi",
    catalogDesc: "Canlı katalog verilerini ve birim fiyatları gösteren kurumsal tablo.",
    product: "Ürün / Hizmet",
    category: "Kategori",
    sku: "SKU Kodu",
    updated: "Son Güncelleme",
    actions: "İşlemler",
    view: "Görüntüle",
    edit: "Düzenle",
    noSku: "SKU Yok",
    noProducts: "Henüz ürün bulunmuyor",
    noProductsDesc: "Tekliflerde gerçek fiyatların kullanılabilmesi için ilk onaylı ürünü ekleyin.",
    liveRecord: "Canlı",
    demoRecord: "Demo",
  },
  en: {
    eyebrow: "Catalog & Inventory",
    title: "Products & Services",
    description: "Maintain the approved product catalog that powers accurate quotes and sales operations.",
    newProduct: "Add Product",
    total: "Total Products",
    live: "Live Catalog",
    active: "Active Products",
    inactive: "Inactive Products",
    filters: "Catalog Filters",
    filtersDesc: "Search by SKU, name, or category and narrow active inventory.",
    search: "Search",
    searchPlaceholder: "Name, SKU, category...",
    status: "Status",
    all: "All",
    sort: "Sort",
    name: "By Name",
    price: "By Price",
    newest: "Newest",
    apply: "Apply",
    reset: "Reset",
    loadError: "Unable to load products",
    retry: "Retry",
    catalog: "Product Catalog Directory",
    catalogDesc: "Corporate catalog list displaying unit prices and inventory status.",
    product: "Product / Service",
    category: "Category",
    sku: "SKU",
    updated: "Updated",
    actions: "Actions",
    view: "View",
    edit: "Edit",
    noSku: "No SKU",
    noProducts: "No products yet",
    noProductsDesc: "Create your first approved product so quotes can use verified pricing.",
    liveRecord: "Live",
    demoRecord: "Demo",
  },
} as const;

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
  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get(LOCALE_COOKIE)?.value);
  const c = copy[locale];
  const toastMessage = typeof rawSearchParams.toast === "string" ? rawSearchParams.toast : "";
  const toastTone =
    rawSearchParams.tone === "danger" || rawSearchParams.tone === "warning" || rawSearchParams.tone === "info"
      ? rawSearchParams.tone
      : "success";
  const currentHref = buildProductHref(filters);
  const createHref = `/products/new?redirect_to=${encodeURIComponent(currentHref)}`;

  return (
    <div className="space-y-5">
      {toastMessage ? <FlashToast message={toastMessage} tone={toastTone} /> : null}

      <PageHeader
        eyebrow={c.eyebrow}
        title={c.title}
        description={c.description}
        actions={
          <Link
            href={createHref}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            {c.newProduct}
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label={c.total} value={String(data.total)} icon={Package} tone="blue" />
        <MetricCard
          label={c.live}
          value={String(data.products.filter((p) => p.recordMode === "live").length)}
          icon={Layers}
          tone="emerald"
        />
        <MetricCard
          label={c.active}
          value={String(data.products.filter((p) => p.active).length)}
          icon={PackageCheck}
          tone="emerald"
        />
        <MetricCard
          label={c.inactive}
          value={String(data.products.filter((p) => !p.active).length)}
          icon={PackageX}
          tone="amber"
        />
      </div>

      <SectionCard title={c.filters} description={c.filtersDesc}>
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-end">
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{c.search}</span>
            <Input name="query" defaultValue={data.filters.query} placeholder={c.searchPlaceholder} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{c.status}</span>
            <Select name="active" defaultValue={data.filters.active}>
              <option value="all">{c.all}</option>
              <option value="active">{c.active}</option>
              <option value="inactive">{c.inactive}</option>
            </Select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{c.sort}</span>
            <Select name="sort" defaultValue={data.filters.sort}>
              <option value="name">{c.name}</option>
              <option value="price">{c.price}</option>
              <option value="newest">{c.newest}</option>
            </Select>
          </label>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="inline-flex h-9 flex-1 items-center justify-center rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-colors"
            >
              {c.apply}
            </button>
            <Link
              href="/products"
              className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-3 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              {c.reset}
            </Link>
          </div>
        </form>
      </SectionCard>

      {data.error ? (
        <EmptyState title={c.loadError} description={data.error} actionHref="/products" actionLabel={c.retry} />
      ) : data.products.length ? (
        <SectionCard title={c.catalog} description={c.catalogDesc}>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-muted/50 font-semibold text-muted-foreground">
                <tr>
                  <th className="px-3.5 py-2.5">{c.product}</th>
                  <th className="px-3 py-2.5">{c.category}</th>
                  <th className="px-3 py-2.5">{c.sku}</th>
                  <th className="px-3 py-2.5">{c.status}</th>
                  <th className="px-3 py-2.5">{c.price}</th>
                  <th className="px-3 py-2.5">{c.updated}</th>
                  <th className="px-3.5 py-2.5 text-right">{c.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.products.map((product) => {
                  const badge = getProductRecordBadge(product.recordMode);
                  const restriction = getProductRecordRestrictionMessage(product.recordMode, data.context.role);
                  const localizedRestriction =
                    locale === "tr" && restriction
                      ? "Bu kayıt rolünüz veya demo sınırı nedeniyle düzenlenemez."
                      : restriction;
                  const recordLabel = product.recordMode === "live" ? c.liveRecord : c.demoRecord;

                  return (
                    <tr key={product.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3.5 py-2.5">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <Link
                              href={`/products/${product.id}`}
                              className="font-semibold text-foreground hover:underline"
                            >
                              {product.name}
                            </Link>
                            <StatusBadge tone={badge.tone} title={badge.title}>
                              {recordLabel}
                            </StatusBadge>
                          </div>
                          <p className="line-clamp-1 text-[11px] text-muted-foreground">{product.description}</p>
                        </div>
                      </td>

                      <td className="px-3 py-2.5 text-muted-foreground font-medium">{product.category}</td>

                      <td className="px-3 py-2.5 text-muted-foreground font-mono text-[11px]">
                        {product.sku ?? "—"}
                      </td>

                      <td className="px-3 py-2.5">
                        <StatusBadge tone={product.active ? "success" : "neutral"}>
                          {product.active ? c.active : c.inactive}
                        </StatusBadge>
                      </td>

                      <td className="px-3 py-2.5 font-bold text-foreground">{product.price_label}</td>

                      <td className="px-3 py-2.5 text-muted-foreground text-[11px]">
                        {product.updated_at ? formatDateTime(product.updated_at) : "—"}
                      </td>

                      <td className="px-3.5 py-2.5 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <Link
                            href={`/products/${product.id}`}
                            className="inline-flex h-7 items-center rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                          >
                            {c.view}
                          </Link>
                          {localizedRestriction ? (
                            <span
                              title={localizedRestriction}
                              className="inline-flex h-7 items-center rounded-md border border-border bg-background px-2 text-xs font-medium text-muted-foreground opacity-50 cursor-not-allowed"
                            >
                              {c.edit}
                            </span>
                          ) : (
                            <Link
                              href={`/products/${product.id}/edit?redirect_to=${encodeURIComponent(currentHref)}`}
                              className="inline-flex h-7 items-center rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                            >
                              {c.edit}
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
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      ) : (
        <EmptyState
          title={c.noProducts}
          description={c.noProductsDesc}
          actionHref={createHref}
          actionLabel={c.newProduct}
        />
      )}
    </div>
  );
}
