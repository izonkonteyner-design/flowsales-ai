import Link from "next/link";
import { cookies } from "next/headers";
import { Plus } from "lucide-react";

import { FlashToast } from "@/components/shared/flash-toast";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatDateTime } from "@/lib/utils";
import { LOCALE_COOKIE, normalizeLocale } from "@/lib/i18n";
import { getProductPageData } from "@/server/services/products";
import { getProductRecordBadge, getProductRecordRestrictionMessage, normalizeProductSearchParams, type ProductFilterState } from "@/server/services/product-domain";
import { ProductDeleteDialog } from "@/components/products/product-delete-dialog";

type ProductsPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const copy = {
  tr: {
    eyebrow: "Katalog", title: "Ürünler", description: "Doğru teklifler ve YZ yanıtları için onaylı ürün kataloğunu yönetin.", newProduct: "Yeni ürün",
    total: "Toplam ürün", live: "Canlı katalog", active: "Aktif", inactive: "Pasif", filters: "Katalog filtreleri", filtersDesc: "SKU, ad veya kategori ile arayın ve aktif envanteri daraltın.",
    search: "Ara", searchPlaceholder: "Ad, SKU, kategori", status: "Durum", all: "Tümü", sort: "Sırala", name: "Ad", price: "Fiyat", newest: "En yeni", apply: "Uygula", reset: "Sıfırla",
    loadError: "Canlı ürünler yüklenemedi", retry: "Yeniden dene", catalog: "Ürün kataloğu", catalogDesc: "Canlı ve demo kayıt rozetleri bulunan duyarlı ürün listesi.",
    product: "Ürün", category: "Kategori", sku: "SKU", updated: "Güncellendi", actions: "İşlemler", view: "Görüntüle", edit: "Düzenle", noSku: "SKU yok", noProducts: "Henüz ürün yok", noProductsDesc: "Tekliflerde canlı fiyat kullanılabilmesi için ilk onaylı ürünü oluşturun.", liveRecord: "Canlı kayıt", demoRecord: "Demo kayıt",
  },
  en: {
    eyebrow: "Catalog", title: "Products", description: "Maintain the approved product catalog that powers accurate quotes and AI answers.", newProduct: "New product",
    total: "Total products", live: "Live catalog", active: "Active", inactive: "Inactive", filters: "Catalog filters", filtersDesc: "Search by SKU, name, or category and narrow the active inventory.",
    search: "Search", searchPlaceholder: "Name, SKU, category", status: "Status", all: "All", sort: "Sort", name: "Name", price: "Price", newest: "Newest", apply: "Apply", reset: "Reset",
    loadError: "Unable to load live products", retry: "Retry", catalog: "Product catalog", catalogDesc: "A responsive list with live and demo record badges.",
    product: "Product", category: "Category", sku: "SKU", updated: "Updated", actions: "Actions", view: "View", edit: "Edit", noSku: "No SKU", noProducts: "No products yet", noProductsDesc: "Create the first approved product so quotes can use live pricing.", liveRecord: "Live record", demoRecord: "Demo record",
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
  const toastTone = rawSearchParams.tone === "danger" || rawSearchParams.tone === "warning" || rawSearchParams.tone === "info" ? rawSearchParams.tone : "success";
  const currentHref = buildProductHref(filters);
  const createHref = `/products/new?redirect_to=${encodeURIComponent(currentHref)}`;

  return (
    <div className="space-y-6">
      {toastMessage ? <FlashToast message={toastMessage} tone={toastTone} /> : null}
      <PageHeader eyebrow={c.eyebrow} title={c.title} description={c.description} actions={<Link href={createHref} className="inline-flex h-10 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950"><Plus className="h-4 w-4" />{c.newProduct}</Link>} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label={c.total} value={String(data.total)} />
        <Metric label={c.live} value={String(data.products.filter((product) => product.recordMode === "live").length)} />
        <Metric label={c.active} value={String(data.products.filter((product) => product.active).length)} />
        <Metric label={c.inactive} value={String(data.products.filter((product) => !product.active).length)} />
      </div>

      <SectionCard title={c.filters} description={c.filtersDesc}>
        <form method="get" className="grid gap-3 xl:grid-cols-[1.8fr_0.8fr_0.8fr_auto]">
          <label className="space-y-2"><span className="text-sm font-medium text-slate-700 dark:text-slate-300">{c.search}</span><Input name="query" defaultValue={data.filters.query} placeholder={c.searchPlaceholder} /></label>
          <label className="space-y-2"><span className="text-sm font-medium text-slate-700 dark:text-slate-300">{c.status}</span><Select name="active" defaultValue={data.filters.active}><option value="all">{c.all}</option><option value="active">{c.active}</option><option value="inactive">{c.inactive}</option></Select></label>
          <label className="space-y-2"><span className="text-sm font-medium text-slate-700 dark:text-slate-300">{c.sort}</span><Select name="sort" defaultValue={data.filters.sort}><option value="name">{c.name}</option><option value="price">{c.price}</option><option value="newest">{c.newest}</option></Select></label>
          <div className="flex items-end gap-3"><button type="submit" className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950">{c.apply}</button><Link href="/products" className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10">{c.reset}</Link></div>
        </form>
      </SectionCard>

      {data.error ? <EmptyState title={c.loadError} description={data.error} actionHref="/products" actionLabel={c.retry} /> : data.products.length ? (
        <SectionCard title={c.catalog} description={c.catalogDesc}>
          <div className="overflow-hidden rounded-3xl border border-slate-200 dark:border-white/10">
            <div className="hidden grid-cols-[1.1fr_1.2fr_0.8fr_0.8fr_0.8fr_1fr_0.9fr] gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 lg:grid dark:border-white/10 dark:bg-white/5"><span>{c.product}</span><span>{c.category}</span><span>{c.sku}</span><span>{c.status}</span><span>{c.price}</span><span>{c.updated}</span><span>{c.actions}</span></div>
            <div className="divide-y divide-slate-200 dark:divide-white/10">
              {data.products.map((product) => {
                const badge = getProductRecordBadge(product.recordMode);
                const restriction = getProductRecordRestrictionMessage(product.recordMode, data.context.role);
                const localizedRestriction = locale === "tr" && restriction ? "Bu kayıt rolünüz veya demo sınırı nedeniyle düzenlenemez." : restriction;
                const recordLabel = product.recordMode === "live" ? c.liveRecord : c.demoRecord;
                return (
                  <article key={product.id} className="block px-4 py-4 transition hover:bg-slate-50 dark:hover:bg-white/5">
                    <div className="hidden grid-cols-[1.1fr_1.2fr_0.8fr_0.8fr_0.8fr_1fr_0.9fr] gap-4 lg:grid">
                      <div><Link href={`/products/${product.id}`} className="font-medium text-slate-950 underline-offset-4 hover:underline dark:text-white">{product.name}</Link><p className="mt-1 text-sm text-slate-500">{product.description}</p><div className="mt-2 flex flex-wrap items-center gap-2"><StatusBadge tone={badge.tone} title={badge.title}>{recordLabel}</StatusBadge></div></div>
                      <div className="text-sm text-slate-600 dark:text-slate-400">{product.category}</div><div className="text-sm text-slate-600 dark:text-slate-400">{product.sku ?? "—"}</div>
                      <div><StatusBadge tone={product.active ? "success" : "neutral"}>{product.active ? c.active : c.inactive}</StatusBadge></div>
                      <div className="text-sm font-medium text-slate-950 dark:text-white">{product.price_label}</div><div className="text-sm text-slate-600 dark:text-slate-400">{product.updated_at ? formatDateTime(product.updated_at) : "—"}</div>
                      <div className="flex flex-wrap gap-2"><Link href={`/products/${product.id}`} className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10">{c.view}</Link>{localizedRestriction ? <span title={localizedRestriction} className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">{c.edit}</span> : <Link href={`/products/${product.id}/edit?redirect_to=${encodeURIComponent(currentHref)}`} className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10">{c.edit}</Link>}<ProductDeleteDialog productId={product.id} productName={product.name} redirectTo={currentHref} recordMode={product.recordMode} role={data.context.role} /></div>
                    </div>
                    <div className="space-y-4 lg:hidden"><div className="flex items-start justify-between gap-4"><div><Link href={`/products/${product.id}`} className="font-medium text-slate-950 underline-offset-4 hover:underline dark:text-white">{product.name}</Link><p className="mt-1 text-sm text-slate-500">{product.category}</p></div><StatusBadge tone={product.active ? "success" : "neutral"}>{product.active ? c.active : c.inactive}</StatusBadge></div><div className="flex flex-wrap gap-2"><StatusBadge tone={badge.tone} title={badge.title}>{recordLabel}</StatusBadge><StatusBadge tone="neutral">{product.sku ?? c.noSku}</StatusBadge><StatusBadge tone="neutral">{product.price_label}</StatusBadge></div><p className="text-sm leading-6 text-slate-600 dark:text-slate-400">{product.description}</p>{localizedRestriction ? <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">{localizedRestriction}</p> : null}<div className="flex flex-wrap gap-2"><Link href={`/products/${product.id}`} className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10">{c.view}</Link>{localizedRestriction ? <span className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">{c.edit}</span> : <Link href={`/products/${product.id}/edit?redirect_to=${encodeURIComponent(currentHref)}`} className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10">{c.edit}</Link>}<ProductDeleteDialog productId={product.id} productName={product.name} redirectTo={currentHref} recordMode={product.recordMode} role={data.context.role} /></div></div>
                  </article>
                );
              })}
            </div>
          </div>
        </SectionCard>
      ) : <EmptyState title={c.noProducts} description={c.noProductsDesc} actionHref={createHref} actionLabel={c.newProduct} />}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-slate-950/60"><p className="text-sm text-slate-500">{label}</p><p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{value}</p></div>;
}
