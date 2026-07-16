import { formatCurrency } from "@/lib/utils";
import type { Organization, Product } from "@/types/crm";
import type { WorkspaceRole } from "@/server/services/workspace-context";

export type ProductRecordMode = "demo" | "live";
export type ProductSortMode = "name" | "price" | "newest";

export type ProductFilterState = {
  query: string;
  active: "all" | "active" | "inactive";
  sort: ProductSortMode;
};

export type ProductWorkspaceContext = {
  mode: ProductRecordMode;
  organization: Organization;
  role: WorkspaceRole;
  userId: string | null;
};

export type ProductSpecificationInput = {
  key: string;
  value: string;
};

export type ProductRecordInput = Omit<Partial<Product>, "specifications" | "tags" | "features" | "gallery_urls"> & {
  specifications?: Array<ProductSpecificationInput | string>;
  features?: string[];
  tags?: string[];
  gallery_urls?: string[];
};

const productRoleLabels: Record<WorkspaceRole, string> = {
  owner: "Owner",
  admin: "Admin",
  sales: "Sales",
  viewer: "Viewer",
};

export function canManageProducts(role: WorkspaceRole | null | undefined) {
  return role === "owner" || role === "admin";
}

export function canMutateProductRecord(recordMode: ProductRecordMode, role: WorkspaceRole | null | undefined) {
  return recordMode === "live" && canManageProducts(role);
}

export function getProductRecordBadge(recordMode: ProductRecordMode) {
  if (recordMode === "demo") {
    return {
      label: "Demo data",
      tone: "neutral" as const,
      title: "Connect live Supabase data or create a real product to edit this record.",
    };
  }

  return {
    label: "Live data",
    tone: "success" as const,
    title: "This product is stored in live Supabase data.",
  };
}

export function getProductRecordRestrictionMessage(recordMode: ProductRecordMode, role: WorkspaceRole | null | undefined) {
  if (recordMode === "demo") {
    return "Connect live Supabase data or create a real product to edit this record.";
  }

  if (!canManageProducts(role)) {
    return `The ${role ? productRoleLabels[role] : "current"} role can only view products.`;
  }

  return "";
}

export function normalizeProductSearchParams(
  input: Partial<Record<string, string | string[] | undefined>>,
): ProductFilterState {
  const query = typeof input.query === "string" ? input.query.trim() : "";
  const active = input.active === "active" || input.active === "inactive" ? input.active : "all";
  const sort = input.sort === "price" || input.sort === "newest" ? input.sort : "name";

  return { query, active, sort };
}

export function getProductDisplayPrice(product: Pick<Product, "unit_price" | "base_price" | "currency">) {
  return formatCurrency(product.unit_price ?? product.base_price, product.currency);
}

export function getProductDimensionSummary(product: Pick<Product, "width" | "length" | "height" | "area_m2" | "weight_kg">) {
  const parts = [
    product.width ? `W ${product.width}` : "",
    product.length ? `L ${product.length}` : "",
    product.height ? `H ${product.height}` : "",
    product.area_m2 ? `Area ${product.area_m2}` : "",
    product.weight_kg ? `Weight ${product.weight_kg}` : "",
  ].filter(Boolean);

  return parts.join(" | ");
}

export function normalizeProductTags(tags: string[]) {
  return Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)));
}

export function normalizeProductFeatures(features: string[]) {
  return Array.from(new Set(features.map((feature) => feature.trim()).filter(Boolean)));
}

export function normalizeProductGalleryUrls(galleryUrls: string[]) {
  return Array.from(new Set(galleryUrls.map((value) => value.trim()).filter(Boolean)));
}

export function normalizeProductSpecifications(specifications: ProductSpecificationInput[]) {
  const seen = new Set<string>();
  return specifications
    .map((specification) => ({
      key: specification.key.trim(),
      value: specification.value.trim(),
    }))
    .filter((specification) => {
      if (!specification.key || !specification.value) {
        return false;
      }

      const normalizedKey = specification.key.toLowerCase();
      if (seen.has(normalizedKey)) {
        return false;
      }

      seen.add(normalizedKey);
      return true;
    });
}

export function normalizeProductRecord(product: ProductRecordInput): Product {
  const specifications = (product.specifications ?? []).map((entry) =>
    typeof entry === "string" ? { key: entry, value: entry } : entry,
  );

  return {
    id: product.id ?? "",
    organization_id: product.organization_id ?? "",
    sku: product.sku ?? "",
    name: product.name ?? "",
    category: product.category ?? "",
    description: product.description ?? "",
    short_description: product.short_description ?? "",
    brand: product.brand ?? "",
    model: product.model ?? "",
    base_price: product.base_price ?? 0,
    unit_price: product.unit_price ?? product.base_price ?? 0,
    currency: product.currency ?? "TRY",
    tax_rate: product.tax_rate ?? 0,
    unit: product.unit ?? "unit",
    width: product.width ?? 0,
    length: product.length ?? 0,
    height: product.height ?? 0,
    area_m2: product.area_m2 ?? 0,
    weight_kg: product.weight_kg ?? 0,
    material: product.material ?? "",
    color: product.color ?? "",
    stock_quantity: product.stock_quantity ?? 0,
    minimum_order_quantity: product.minimum_order_quantity ?? 1,
    lead_time_days: product.lead_time_days ?? 0,
    warranty_months: product.warranty_months ?? 0,
    internal_code: product.internal_code ?? "",
    barcode: product.barcode ?? "",
    tags: normalizeProductTags(product.tags ?? []),
    features: normalizeProductFeatures(product.features ?? []),
    specifications: normalizeProductSpecifications(specifications),
    image_url: product.image_url ?? "",
    gallery_urls: normalizeProductGalleryUrls(product.gallery_urls ?? []),
    featured: product.featured ?? false,
    notes: product.notes ?? "",
    active: product.active ?? true,
    created_by: product.created_by ?? "",
    created_at: product.created_at ?? "",
    updated_at: product.updated_at ?? "",
  };
}

export function filterProducts<T extends Product>(products: T[], filters: ProductFilterState) {
  const query = filters.query.toLowerCase();
  return products.filter((product) => {
    const matchesQuery =
      !query ||
      [
        product.name,
        product.sku ?? "",
        product.category,
        product.brand ?? "",
        product.model ?? "",
        product.internal_code ?? "",
        product.barcode ?? "",
      ]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query));

    const matchesActive = filters.active === "all" || (filters.active === "active" ? product.active : !product.active);

    return matchesQuery && matchesActive;
  });
}

export function sortProducts<T extends Product>(products: T[], sort: ProductSortMode) {
  return [...products].sort((a, b) => {
    if (sort === "price") {
      return (b.unit_price ?? b.base_price) - (a.unit_price ?? a.base_price);
    }

    if (sort === "newest") {
      return new Date(b.created_at ?? "").getTime() - new Date(a.created_at ?? "").getTime();
    }

    return a.name.localeCompare(b.name);
  });
}

export function getProductSourceLabels(products: Product[]) {
  return Array.from(new Set(products.map((product) => product.category))).sort((a, b) => a.localeCompare(b));
}
