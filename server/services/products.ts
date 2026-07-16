import { createSupabaseServerClient } from "@/lib/supabase/server";
import { demoProducts } from "@/server/services/crm-data";
import { createDemoWorkspaceContext, getWorkspaceContext, type WorkspaceRole } from "@/server/services/workspace-context";
import type { Product } from "@/types/crm";
import {
  canManageProducts,
  filterProducts,
  getProductDisplayPrice,
  getProductRecordBadge,
  getProductRecordRestrictionMessage,
  normalizeProductSearchParams,
  sortProducts,
  type ProductFilterState,
  type ProductRecordMode,
  type ProductWorkspaceContext,
} from "@/server/services/product-domain";

export type ProductRow = Product & {
  recordMode: ProductRecordMode;
  price_label: string;
  specifications_text: string;
};

export type ProductPageData = {
  context: ProductWorkspaceContext;
  filters: ProductFilterState;
  total: number;
  products: ProductRow[];
  allProducts: ProductRow[];
  error: string | null;
};

export type ProductDetailData = {
  context: ProductWorkspaceContext;
  product: ProductRow | null;
  error: string | null;
};

function mapProductRow(product: Product, recordMode: ProductRecordMode): ProductRow {
  const specifications = Array.isArray(product.specifications) ? product.specifications : [];
  return {
    ...product,
    recordMode,
    unit_price: product.unit_price ?? product.base_price,
    base_price: product.base_price ?? product.unit_price ?? 0,
    price_label: getProductDisplayPrice({
      unit_price: product.unit_price ?? product.base_price,
      base_price: product.base_price ?? product.unit_price ?? 0,
      currency: product.currency,
    }),
    specifications_text: specifications.join(", "),
  };
}

async function loadLiveContext(): Promise<ProductWorkspaceContext | null> {
  const context = await getWorkspaceContext();
  if (context.mode === "demo") {
    return null;
  }

  return {
    mode: "live",
    organization: context.organization,
    role: context.role,
    userId: context.userId,
  };
}

async function loadLiveProducts(context: ProductWorkspaceContext) {
  const client = await createSupabaseServerClient();
  if (!client || context.mode === "demo") {
    return { error: null, products: null };
  }

  const { data, error } = await client
    .from("products")
    .select("id, organization_id, sku, name, category, description, base_price, unit_price, currency, tax_rate, unit, active, specifications, created_by, created_at, updated_at")
    .eq("organization_id", context.organization.id);

  if (error) {
    return { error: error.message, products: null };
  }

  return {
    error: null,
    products: (data ?? []).map((product) => mapProductRow(product as Product, "live")),
  };
}

async function buildProductContext(): Promise<ProductWorkspaceContext> {
  const liveContext = await loadLiveContext();
  if (liveContext) {
    return liveContext;
  }

  const demoContext = createDemoWorkspaceContext();
  return {
    mode: "demo",
    organization: demoContext.organization,
    role: demoContext.role,
    userId: null,
  };
}

function buildProductPageData(
  context: ProductWorkspaceContext,
  filters: ProductFilterState,
  products: ProductRow[],
  error: string | null,
): ProductPageData {
  const filtered = sortProducts(filterProducts(products, filters), filters.sort).map((product) => product);
  return {
    context,
    filters,
    total: filtered.length,
    products: filtered,
    allProducts: filtered,
    error,
  };
}

export async function getProductPageData(input: Partial<Record<string, string | string[] | undefined>>) {
  const context = await buildProductContext();
  const filters = normalizeProductSearchParams(input);

  if (context.mode === "demo") {
    const productRows = demoProducts.map((product) => mapProductRow(product, "demo"));
    return buildProductPageData(context, filters, productRows, null);
  }

  const liveProducts = await loadLiveProducts(context);
  if (liveProducts.error) {
    return buildProductPageData(context, filters, [], liveProducts.error);
  }

  return buildProductPageData(context, filters, liveProducts.products ?? [], null);
}

export async function getProductDetailData(id: string) {
  const context = await buildProductContext();

  if (context.mode === "demo") {
    const product = demoProducts.find((item) => item.id === id) ?? null;
    return {
      context,
      product: product ? mapProductRow(product, "demo") : null,
      error: null,
    } satisfies ProductDetailData;
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    return {
      context,
      product: null,
      error: "Unable to load products from Supabase.",
    } satisfies ProductDetailData;
  }

  const { data, error } = await client
    .from("products")
    .select("id, organization_id, sku, name, category, description, base_price, unit_price, currency, tax_rate, unit, active, specifications, created_by, created_at, updated_at")
    .eq("id", id)
    .eq("organization_id", context.organization.id)
    .maybeSingle();

  if (error || !data) {
    return {
      context,
      product: null,
      error: error?.message ?? "Product not found.",
    } satisfies ProductDetailData;
  }

  return {
    context,
    product: mapProductRow(data as Product, "live"),
    error: null,
  } satisfies ProductDetailData;
}

async function getMutationContext() {
  const context = await buildProductContext();
  const client = await createSupabaseServerClient();

  if (!client || context.mode === "demo") {
    return null;
  }

  return { context, client };
}

function ensureCanManage(context: ProductWorkspaceContext) {
  if (!canManageProducts(context.role)) {
    throw new Error("You do not have permission to manage products.");
  }
}

function buildProductPayload(input: {
  sku: string;
  name: string;
  category: string;
  description: string;
  unit_price: number;
  currency: string;
  tax_rate: number;
  unit: string;
  active: boolean;
  specifications: string[];
}) {
  return {
    sku: input.sku,
    name: input.name,
    category: input.category,
    description: input.description,
    base_price: input.unit_price,
    unit_price: input.unit_price,
    currency: input.currency,
    tax_rate: input.tax_rate,
    unit: input.unit,
    active: input.active,
    specifications: input.specifications,
  };
}

export async function createProductRecord(input: {
  sku: string;
  name: string;
  category: string;
  description: string;
  unit_price: number;
  currency: string;
  tax_rate: number;
  unit: string;
  active: boolean;
  specifications: string[];
}) {
  const mutation = await getMutationContext();
  if (!mutation) {
    throw new Error("Product creation requires a live Supabase session.");
  }

  ensureCanManage(mutation.context);

  const { data, error } = await mutation.client
    .from("products")
    .insert({
      organization_id: mutation.context.organization.id,
      created_by: mutation.context.userId,
      ...buildProductPayload(input),
    })
    .select("id, organization_id, sku, name, category, description, base_price, unit_price, currency, tax_rate, unit, active, specifications, created_by, created_at, updated_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to create product.");
  }

  return { product: mapProductRow(data as Product, "live") };
}

export async function updateProductRecord(
  productId: string,
  input: {
    sku: string;
    name: string;
    category: string;
    description: string;
    unit_price: number;
    currency: string;
    tax_rate: number;
    unit: string;
    active: boolean;
    specifications: string[];
  },
) {
  const mutation = await getMutationContext();
  if (!mutation) {
    throw new Error("Product updates require a live Supabase session.");
  }

  ensureCanManage(mutation.context);

  const { data, error } = await mutation.client
    .from("products")
    .update(buildProductPayload(input))
    .eq("id", productId)
    .eq("organization_id", mutation.context.organization.id)
    .select("id, organization_id, sku, name, category, description, base_price, unit_price, currency, tax_rate, unit, active, specifications, created_by, created_at, updated_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to update product.");
  }

  return { product: mapProductRow(data as Product, "live") };
}

export async function deleteProductRecord(productId: string) {
  const mutation = await getMutationContext();
  if (!mutation) {
    throw new Error("Product deletion requires a live Supabase session.");
  }

  ensureCanManage(mutation.context);

  const { error } = await mutation.client
    .from("products")
    .delete()
    .eq("id", productId)
    .eq("organization_id", mutation.context.organization.id);

  if (error) {
    throw new Error(error.message ?? "Unable to delete product.");
  }
}

export function getProductStatusBadge(product: ProductRow) {
  return getProductRecordBadge(product.recordMode);
}

export function getProductStatusRestriction(product: ProductRow, role: WorkspaceRole | null | undefined) {
  return getProductRecordRestrictionMessage(product.recordMode, role);
}
