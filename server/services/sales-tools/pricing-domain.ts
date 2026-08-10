import { z } from "zod";

import type { TrustedProduct } from "./product-catalog-domain";

export const trustedPriceSchema = z.object({
  amount: z.number().finite().positive(),
  currency: z.string().trim().length(3),
  source: z.literal("catalog"),
  sourceId: z.string().uuid(),
  productName: z.string().trim().min(1),
  productUpdatedAt: z.string().datetime(),
});

export type TrustedPrice = z.infer<typeof trustedPriceSchema>;

export class TrustedPriceUnavailableError extends Error {}

export function resolveTrustedCatalogPrice(product: TrustedProduct): TrustedPrice {
  if (!product.active) throw new TrustedPriceUnavailableError("Inactive products cannot be quoted.");

  const amount = product.unitPrice ?? product.basePrice;
  if (amount === null || amount <= 0) {
    throw new TrustedPriceUnavailableError("The product has no verified current catalog price.");
  }

  return trustedPriceSchema.parse({
    amount,
    currency: product.currency,
    source: "catalog",
    sourceId: product.id,
    productName: product.name,
    productUpdatedAt: product.updatedAt,
  });
}

export function assertSpokenPriceMatchesTrustedSource(input: {
  spokenAmount: number;
  spokenCurrency: string;
  trustedPrice: TrustedPrice;
}) {
  if (
    input.spokenAmount !== input.trustedPrice.amount ||
    input.spokenCurrency.toUpperCase() !== input.trustedPrice.currency.toUpperCase()
  ) {
    throw new TrustedPriceUnavailableError("Spoken price does not match the trusted catalog source.");
  }

  return input.trustedPrice;
}
