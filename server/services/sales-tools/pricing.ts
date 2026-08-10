import { getTrustedProductById } from "./product-catalog";
import { resolveTrustedCatalogPrice, type TrustedPrice } from "./pricing-domain";

export {
  assertSpokenPriceMatchesTrustedSource,
  resolveTrustedCatalogPrice,
  trustedPriceSchema,
  TrustedPriceUnavailableError,
} from "./pricing-domain";
export type { TrustedPrice } from "./pricing-domain";

export async function getCurrentTrustedProductPrice(workspaceId: string, productId: string): Promise<TrustedPrice> {
  const product = await getTrustedProductById(workspaceId, productId);
  return resolveTrustedCatalogPrice(product);
}
