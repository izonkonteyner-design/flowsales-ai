import { z } from "zod";

export const trustedProductSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  sku: z.string().trim().nullable(),
  name: z.string().trim().min(1),
  category: z.string().trim().nullable(),
  description: z.string().trim().nullable(),
  model: z.string().trim().nullable(),
  areaM2: z.number().finite().nonnegative().nullable(),
  unitPrice: z.number().finite().nonnegative().nullable(),
  basePrice: z.number().finite().nonnegative().nullable(),
  currency: z.string().trim().length(3),
  features: z.array(z.string()),
  specifications: z.array(z.object({ key: z.string(), value: z.string() })),
  active: z.boolean(),
  updatedAt: z.string().datetime(),
});

export type TrustedProduct = z.infer<typeof trustedProductSchema>;

export type TrustedProductSearch = {
  query?: string;
  areaM2?: number;
  roomCount?: string;
  limit?: number;
};

function normalizeText(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9+]+/g, " ")
    .trim();
}

function searchableProductText(product: TrustedProduct) {
  return normalizeText([
    product.name,
    product.sku ?? "",
    product.category ?? "",
    product.description ?? "",
    product.model ?? "",
    ...product.features,
    ...product.specifications.flatMap((item) => [item.key, item.value]),
  ].join(" "));
}

export function matchesTrustedProduct(product: TrustedProduct, search: TrustedProductSearch) {
  if (!product.active) return false;

  if (search.areaM2 !== undefined) {
    if (product.areaM2 === null || Math.abs(product.areaM2 - search.areaM2) > 0.5) return false;
  }

  const text = searchableProductText(product);

  if (search.roomCount) {
    const room = normalizeText(search.roomCount);
    if (!text.includes(room)) return false;
  }

  if (search.query) {
    const terms = normalizeText(search.query).split(/\s+/).filter(Boolean);
    if (!terms.every((term) => text.includes(term))) return false;
  }

  return true;
}

export function rankTrustedProducts(products: TrustedProduct[], search: TrustedProductSearch) {
  const limit = Math.min(Math.max(search.limit ?? 10, 1), 25);
  return products
    .filter((product) => matchesTrustedProduct(product, search))
    .sort((a, b) => {
      if (search.areaM2 !== undefined) {
        const aDelta = a.areaM2 === null ? Number.POSITIVE_INFINITY : Math.abs(a.areaM2 - search.areaM2);
        const bDelta = b.areaM2 === null ? Number.POSITIVE_INFINITY : Math.abs(b.areaM2 - search.areaM2);
        if (aDelta !== bDelta) return aDelta - bDelta;
      }
      return a.name.localeCompare(b.name, "tr-TR");
    })
    .slice(0, limit);
}
