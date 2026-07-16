import { createSupabaseServerClient } from "@/lib/supabase/server";
import { demoProducts } from "@/server/services/crm-data";
import { createDemoWorkspaceContext, getWorkspaceContext, type WorkspaceRole } from "@/server/services/workspace-context";
import type { Product } from "@/types/crm";
import {
  canManageProducts,
  filterProducts,
  getProductDisplayPrice,
  getProductDimensionSummary,
  getProductRecordBadge,
  getProductRecordRestrictionMessage,
  normalizeProductRecord,
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
  features_text: string;
  tags_text: string;
  gallery_count: number;
  dimension_summary: string;
};

type ProductMutationInput = {
  sku: string;
  name: string;
  category: string;
  description: string;
  short_description: string;
  brand: string;
  model: string;
  unit_price: number;
  currency: string;
  tax_rate: number;
  unit: string;
  width: number;
  length: number;
  height: number;
  area_m2: number;
  weight_kg: number;
  material: string;
  color: string;
  stock_quantity: number;
  minimum_order_quantity: number;
  lead_time_days: number;
  warranty_months: number;
  internal_code: string;
  barcode: string;
  tags: string[];
  features: string[];
  specifications: Array<{ key: string; value: string }>;
  image_url: string;
  gallery_urls: string[];
  featured: boolean;
  notes: string;
  active: boolean;
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

const productSelectColumns =
  "id, organization_id, sku, name, category, description, short_description, brand, model, base_price, unit_price, currency, tax_rate, unit, width, length, height, area_m2, weight_kg, material, color, stock_quantity, minimum_order_quantity, lead_time_days, warranty_months, internal_code, barcode, tags, features, specifications, image_url, gallery_urls, featured, notes, active, created_by, created_at, updated_at";

function mapProductRow(product: Product, recordMode: ProductRecordMode): ProductRow {
  const normalized = normalizeProductRecord(product);

  return {
    ...normalized,
    recordMode,
    unit_price: normalized.unit_price ?? normalized.base_price,
    base_price: normalized.base_price ?? normalized.unit_price ?? 0,
    price_label: getProductDisplayPrice({
      unit_price: normalized.unit_price ?? normalized.base_price,
      base_price: normalized.base_price ?? normalized.unit_price ?? 0,
      currency: normalized.currency,
    }),
    specifications_text: normalized.specifications.map((entry) => `${entry.key}: ${entry.value}`).join(", "),
    features_text: normalized.features.join(", "),
    tags_text: normalized.tags.join(", "),
    gallery_count: normalized.gallery_urls.length,
    dimension_summary: getProductDimensionSummary(normalized),
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

  const { data, error } = await client.from("products").select(productSelectColumns).eq("organization_id", context.organization.id);

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
  const filtered = sortProducts(filterProducts(products, filters), filters.sort);
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

  const { data, error } = await client.from("products").select(productSelectColumns).eq("id", id).eq("organization_id", context.organization.id).maybeSingle();

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

function buildProductPayload(input: ProductMutationInput) {
  return {
    sku: input.sku,
    name: input.name,
    category: input.category,
    description: input.description,
    short_description: input.short_description,
    brand: input.brand,
    model: input.model,
    base_price: input.unit_price,
    unit_price: input.unit_price,
    currency: input.currency,
    tax_rate: input.tax_rate,
    unit: input.unit,
    width: input.width,
    length: input.length,
    height: input.height,
    area_m2: input.area_m2,
    weight_kg: input.weight_kg,
    material: input.material,
    color: input.color,
    stock_quantity: input.stock_quantity,
    minimum_order_quantity: input.minimum_order_quantity,
    lead_time_days: input.lead_time_days,
    warranty_months: input.warranty_months,
    internal_code: input.internal_code,
    barcode: input.barcode,
    tags: input.tags,
    features: input.features,
    specifications: input.specifications,
    image_url: input.image_url || null,
    gallery_urls: input.gallery_urls,
    featured: input.featured,
    notes: input.notes,
    active: input.active,
  };
}

export async function createProductRecord(input: ProductMutationInput) {
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
    .select(productSelectColumns)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to create product.");
  }

  return { product: mapProductRow(data as Product, "live") };
}

export async function updateProductRecord(productId: string, input: ProductMutationInput) {
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
    .select(productSelectColumns)
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

  const { error } = await mutation.client.from("products").delete().eq("id", productId).eq("organization_id", mutation.context.organization.id);

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
