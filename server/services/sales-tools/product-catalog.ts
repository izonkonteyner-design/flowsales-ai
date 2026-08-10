import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  rankTrustedProducts,
  trustedProductSchema,
  type TrustedProduct,
  type TrustedProductSearch,
} from "./product-catalog-domain";

const selectColumns =
  "id, organization_id, sku, name, category, description, model, area_m2, unit_price, base_price, currency, features, specifications, active, updated_at";

export class TrustedProductCatalogUnavailableError extends Error {}
export class TrustedProductNotFoundError extends Error {}

function mapRow(row: Record<string, unknown>): TrustedProduct {
  return trustedProductSchema.parse({
    id: row.id,
    workspaceId: row.organization_id,
    sku: row.sku ?? null,
    name: row.name,
    category: row.category ?? null,
    description: row.description ?? null,
    model: row.model ?? null,
    areaM2: row.area_m2 ?? null,
    unitPrice: row.unit_price ?? null,
    basePrice: row.base_price ?? null,
    currency: row.currency ?? "TRY",
    features: Array.isArray(row.features) ? row.features : [],
    specifications: Array.isArray(row.specifications) ? row.specifications : [],
    active: row.active === true,
    updatedAt: row.updated_at,
  });
}

async function loadActiveProducts(workspaceId: string): Promise<TrustedProduct[]> {
  const client = await createSupabaseServerClient();
  if (!client) throw new TrustedProductCatalogUnavailableError("Trusted product catalog is unavailable.");

  const { data, error } = await client
    .from("products")
    .select(selectColumns)
    .eq("organization_id", workspaceId)
    .eq("active", true)
    .limit(250);

  if (error) throw new TrustedProductCatalogUnavailableError(error.message);
  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
}

export async function searchTrustedProducts(
  workspaceId: string,
  search: TrustedProductSearch,
): Promise<TrustedProduct[]> {
  const products = await loadActiveProducts(workspaceId);
  return rankTrustedProducts(products, search);
}

export async function getTrustedProductById(workspaceId: string, productId: string): Promise<TrustedProduct> {
  const client = await createSupabaseServerClient();
  if (!client) throw new TrustedProductCatalogUnavailableError("Trusted product catalog is unavailable.");

  const { data, error } = await client
    .from("products")
    .select(selectColumns)
    .eq("organization_id", workspaceId)
    .eq("id", productId)
    .eq("active", true)
    .maybeSingle();

  if (error) throw new TrustedProductCatalogUnavailableError(error.message);
  if (!data) throw new TrustedProductNotFoundError("No active product exists for this workspace and product id.");
  return mapRow(data as Record<string, unknown>);
}
