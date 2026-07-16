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

export function filterProducts<T extends Product>(products: T[], filters: ProductFilterState) {
  const query = filters.query.toLowerCase();
  return products.filter((product) => {
    const matchesQuery =
      !query ||
      [product.name, product.sku ?? "", product.category, product.description, product.unit]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query));

    const matchesActive =
      filters.active === "all" ||
      (filters.active === "active" ? product.active : !product.active);

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
