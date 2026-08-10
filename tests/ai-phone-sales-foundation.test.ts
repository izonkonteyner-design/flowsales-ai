import assert from "node:assert/strict";
import test from "node:test";

import { buildAiSalesContext, type AiContextRepository } from "@/server/services/ai-sales-agent/context";
import { createSalesSession, updateSalesSessionQualification } from "@/server/services/sales-session/domain";
import { rankTrustedProducts, type TrustedProduct } from "@/server/services/sales-tools/product-catalog-domain";
import {
  assertSpokenPriceMatchesTrustedSource,
  resolveTrustedCatalogPrice,
  TrustedPriceUnavailableError,
} from "@/server/services/sales-tools/pricing-domain";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
const leadId = "33333333-3333-4333-8333-333333333333";
const productId = "44444444-4444-4444-8444-444444444444";

function product(overrides: Partial<TrustedProduct> = {}): TrustedProduct {
  return {
    id: productId,
    workspaceId,
    sku: "IZON-56-21",
    name: "56 m² 2+1 Konteyner Ev",
    category: "Konteyner Ev",
    description: "İki oda, salon ve yaşam alanı",
    model: "IZON 56",
    areaM2: 56,
    unitPrice: 675000,
    basePrice: 675000,
    currency: "TRY",
    features: ["2+1", "Mutfak", "WC Duş"],
    specifications: [{ key: "Oda", value: "2+1" }],
    active: true,
    updatedAt: "2026-08-10T10:00:00.000Z",
    ...overrides,
  };
}

test("Unified Sales Session supports phone qualification without creating a second AI model", () => {
  const session = createSalesSession({
    id: "55555555-5555-4555-8555-555555555555",
    workspaceId,
    channel: "phone",
    channelSessionId: "call-123",
    now: new Date("2026-08-10T10:00:00.000Z"),
  });

  const updated = updateSalesSessionQualification(
    session,
    {
      productInterest: "56 m² 2+1",
      areaM2: 56,
      roomCount: "2+1",
      location: "Torbalı, İzmir",
      landReady: true,
      purchaseTiming: "Bu ay",
    },
    new Date("2026-08-10T10:01:00.000Z"),
  );

  assert.equal(updated.channel, "phone");
  assert.equal(updated.qualification.areaM2, 56);
  assert.equal(updated.qualification.landReady, true);
  assert.equal(updated.qualification.purchaseTiming, "Bu ay");
});

test("Trusted Product Catalog matches current active product by area and room count", () => {
  const results = rankTrustedProducts(
    [product(), product({ id: "66666666-6666-4666-8666-666666666666", name: "42 m² 1+1", areaM2: 42, features: ["1+1"] })],
    { areaM2: 56, roomCount: "2+1" },
  );

  assert.equal(results.length, 1);
  assert.equal(results[0]?.id, productId);
});

test("Trusted Pricing Resolver only returns catalog-backed current price", () => {
  const trustedPrice = resolveTrustedCatalogPrice(product());
  assert.equal(trustedPrice.amount, 675000);
  assert.equal(trustedPrice.currency, "TRY");
  assert.equal(trustedPrice.source, "catalog");
  assert.equal(trustedPrice.sourceId, productId);

  assert.doesNotThrow(() =>
    assertSpokenPriceMatchesTrustedSource({
      spokenAmount: 675000,
      spokenCurrency: "TRY",
      trustedPrice,
    }),
  );

  assert.throws(
    () =>
      assertSpokenPriceMatchesTrustedSource({
        spokenAmount: 650000,
        spokenCurrency: "TRY",
        trustedPrice,
      }),
    TrustedPriceUnavailableError,
  );
});

test("Trusted Pricing Resolver blocks products without a verified price", () => {
  assert.throws(
    () => resolveTrustedCatalogPrice(product({ unitPrice: null, basePrice: null })),
    TrustedPriceUnavailableError,
  );
});

test("AI Sales Agent context carries phone channel and remains backwards compatible", async () => {
  const repository: AiContextRepository = {
    actorCanAccessWorkspace: async () => true,
    isDemoWorkspace: async () => false,
    getLead: async () => ({
      id: leadId,
      name: "Ahmet",
      status: "new",
      source: "phone",
      assignedTo: null,
      estimatedValue: null,
      currency: "TRY",
      createdAt: "2026-08-10T09:00:00.000Z",
      updatedAt: "2026-08-10T09:00:00.000Z",
    }),
    listLeadActivities: async () => [],
    listActiveProducts: async () => [{ id: productId, name: "56 m² 2+1", active: true, price: 675000, currency: "TRY" }],
    listWorkspaceRules: async () => [],
  };

  const phoneContext = await buildAiSalesContext(repository, {
    workspaceId,
    actorId,
    leadId,
    capability: "product_recommendation",
    channel: "phone",
    salesSessionId: "55555555-5555-4555-8555-555555555555",
  });
  assert.equal(phoneContext.channel, "phone");

  const legacyContext = await buildAiSalesContext(repository, {
    workspaceId,
    actorId,
    leadId,
    capability: "lead_scoring",
  });
  assert.equal(legacyContext.channel, "web_chat");
  assert.equal(legacyContext.salesSessionId, null);
});
