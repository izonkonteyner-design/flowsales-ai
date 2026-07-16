import assert from "node:assert/strict";
import test from "node:test";

import { productFormSchema, productSearchSchema } from "@/lib/validations/product";
import {
  canManageProducts,
  canMutateProductRecord,
  filterProducts,
  getProductRecordRestrictionMessage,
  normalizeProductSearchParams,
  sortProducts,
} from "@/server/services/product-domain";
import type { Product } from "@/types/crm";

const products: Product[] = [
  {
    id: "prod_001",
    organization_id: "org_001",
    sku: "CON-OF-001",
    name: "Container Office",
    category: "Container",
    description: "Insulated modular office unit for field operations.",
    base_price: 420000,
    unit_price: 420000,
    currency: "TRY",
    tax_rate: 20,
    unit: "unit",
    active: true,
    specifications: ["Steel frame"],
    created_at: "2026-07-14T08:30:00.000Z",
  },
  {
    id: "prod_002",
    organization_id: "org_001",
    sku: "SIT-CA-001",
    name: "Site Cabin",
    category: "Construction",
    description: "Durable cabin for site management and security teams.",
    base_price: 265000,
    unit_price: 265000,
    currency: "TRY",
    tax_rate: 20,
    unit: "unit",
    active: false,
    specifications: ["Portable"],
    created_at: "2026-07-15T08:30:00.000Z",
  },
];

test("product schema validation accepts catalog input", () => {
  const parsed = productFormSchema.parse({
    sku: "CON-OF-001",
    name: "Container Office",
    category: "Container",
    description: "Insulated modular office unit for field operations.",
    unit_price: "420000",
    currency: "TRY",
    tax_rate: "20",
    unit: "unit",
    active: true,
    specifications: ["Steel frame", "Thermal insulation"],
  });

  assert.equal(parsed.unit_price, 420000);
  assert.equal(parsed.active, true);
});

test("product search schema normalizes filters", () => {
  const parsed = productSearchSchema.parse({
    query: "office",
    active: "active",
    sort: "price",
  });

  assert.deepEqual(parsed, {
    query: "office",
    active: "active",
    sort: "price",
  });
});

test("product schema rejects negative prices", () => {
  assert.throws(() =>
    productFormSchema.parse({
      sku: "BAD-001",
      name: "Broken Product",
      category: "Custom",
      description: "This description is long enough.",
      unit_price: "-1",
      currency: "TRY",
      tax_rate: "20",
      unit: "unit",
      active: true,
      specifications: [],
    }),
  );
});

test("product search and sorting cover name, sku, category, and newest", () => {
  const filteredByName = filterProducts(products, normalizeProductSearchParams({ query: "office" }));
  const filteredBySku = filterProducts(products, normalizeProductSearchParams({ query: "SIT-CA" }));
  const filteredByCategory = filterProducts(products, normalizeProductSearchParams({ query: "construction" }));

  assert.equal(filteredByName.length, 1);
  assert.equal(filteredBySku.length, 1);
  assert.equal(filteredByCategory.length, 1);

  const priceSorted = sortProducts([...products], "price");
  const newestSorted = sortProducts([...products], "newest");

  assert.equal(priceSorted[0].name, "Container Office");
  assert.equal(newestSorted[0].name, "Site Cabin");
});

test("product permissions keep demo records and viewers read-only", () => {
  assert.equal(canManageProducts("viewer"), false);
  assert.equal(canManageProducts("sales"), false);
  assert.equal(canMutateProductRecord("demo", "admin"), false);
  assert.equal(canMutateProductRecord("live", "admin"), true);
  assert.match(getProductRecordRestrictionMessage("demo", "admin"), /Connect live Supabase data/);
});
