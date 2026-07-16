import assert from "node:assert/strict";
import test from "node:test";

import { productFormSchema, productSearchSchema } from "@/lib/validations/product";
import {
  canManageProducts,
  canMutateProductRecord,
  filterProducts,
  getProductRecordRestrictionMessage,
  normalizeProductRecord,
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
    short_description: "Premium modular field office.",
    brand: "FlowBuild",
    model: "FO-56",
    base_price: 420000,
    unit_price: 420000,
    currency: "TRY",
    tax_rate: 20,
    unit: "unit",
    width: 3,
    length: 7,
    height: 2.8,
    area_m2: 21,
    weight_kg: 5200,
    material: "Galvanized steel",
    color: "Anthracite gray",
    stock_quantity: 4,
    minimum_order_quantity: 1,
    lead_time_days: 21,
    warranty_months: 24,
    internal_code: "FLB-FO-56",
    barcode: "8691000000011",
    tags: ["container", "office", "field"],
    features: ["Steel frame", "Thermal insulation"],
    specifications: [{ key: "Width", value: "300 cm" }],
    image_url: "https://example.com/container.jpg",
    gallery_urls: ["https://example.com/container.jpg"],
    featured: true,
    notes: "Most requested catalog item for quick quotes.",
    active: true,
    created_at: "2026-07-14T08:30:00.000Z",
  },
  {
    id: "prod_002",
    organization_id: "org_001",
    sku: "TIN-HO-001",
    name: "Tiny House",
    category: "Residential",
    description: "Compact premium home with a modern living layout.",
    short_description: "Modern tiny house with luxury finishes.",
    brand: "FlowHome",
    model: "TH-42",
    base_price: 1350000,
    unit_price: 1350000,
    currency: "TRY",
    tax_rate: 20,
    unit: "unit",
    width: 4,
    length: 10,
    height: 3.2,
    area_m2: 42,
    weight_kg: 8600,
    material: "Wood and steel composite",
    color: "Warm walnut",
    stock_quantity: 2,
    minimum_order_quantity: 1,
    lead_time_days: 35,
    warranty_months: 36,
    internal_code: "FLH-TH-42",
    barcode: "8691000000028",
    tags: ["tiny house", "residential", "premium"],
    features: ["Open plan", "Kitchen module"],
    specifications: [{ key: "Width", value: "400 cm" }],
    image_url: "https://example.com/tiny-house.jpg",
    gallery_urls: ["https://example.com/tiny-house.jpg"],
    featured: true,
    notes: "Designed for premium residential and hospitality offers.",
    active: false,
    created_at: "2026-07-15T08:30:00.000Z",
  },
];

test("product schema accepts enriched catalog input and normalizes arrays", () => {
  const parsed = productFormSchema.parse({
    sku: "CON-OF-001",
    name: "Container Office",
    category: "Container",
    description: "Insulated modular office unit for field operations.",
    short_description: "Premium modular field office.",
    brand: "FlowBuild",
    model: "FO-56",
    unit_price: "420000",
    currency: "TRY",
    tax_rate: "20",
    unit: "unit",
    width: "3",
    length: "7",
    height: "2.8",
    area_m2: "21",
    weight_kg: "5200",
    material: "Galvanized steel",
    color: "Anthracite gray",
    stock_quantity: "4",
    minimum_order_quantity: "1",
    lead_time_days: "21",
    warranty_months: "24",
    internal_code: "FLB-FO-56",
    barcode: "8691000000011",
    tags: ["container", "container", "premium"],
    features: ["Steel frame", "Thermal insulation", "Steel frame"],
    specifications: [
      { key: "Width", value: "300 cm" },
      { key: "Insulation", value: "5 cm EPS" },
    ],
    image_url: "https://example.com/container.jpg",
    gallery_urls: ["https://example.com/container.jpg", "https://example.com/container.jpg"],
    featured: true,
    active: true,
    notes: "Most requested catalog item for quick quotes.",
  });

  assert.equal(parsed.unit_price, 420000);
  assert.deepEqual(parsed.tags, ["container", "premium"]);
  assert.deepEqual(parsed.features, ["Steel frame", "Thermal insulation"]);
  assert.deepEqual(parsed.gallery_urls, ["https://example.com/container.jpg"]);
  assert.equal(parsed.featured, true);
});

test("product search schema normalizes filters", () => {
  assert.deepEqual(
    productSearchSchema.parse({
      query: " office ",
      active: "active",
      sort: "price",
    }),
    {
      query: "office",
      active: "active",
      sort: "price",
    },
  );
});

test("product schema rejects negative dimensions, stock, and invalid image URLs", () => {
  assert.throws(() =>
    productFormSchema.parse({
      sku: "BAD-001",
      name: "Broken Product",
      category: "Custom",
      description: "This description is long enough.",
      unit_price: "1",
      currency: "TRY",
      tax_rate: "20",
      unit: "unit",
      width: "-1",
      stock_quantity: "1",
      minimum_order_quantity: "1",
      lead_time_days: "0",
      warranty_months: "0",
      active: true,
      features: [],
      specifications: [],
      image_url: "",
      gallery_urls: [],
    }),
  );

  assert.throws(() =>
    productFormSchema.parse({
      sku: "BAD-002",
      name: "Broken Product",
      category: "Custom",
      description: "This description is long enough.",
      unit_price: "1",
      currency: "TRY",
      tax_rate: "20",
      unit: "unit",
      stock_quantity: "-1",
      minimum_order_quantity: "1",
      lead_time_days: "0",
      warranty_months: "0",
      active: true,
      features: [],
      specifications: [],
      image_url: "",
      gallery_urls: [],
    }),
  );

  assert.throws(() =>
    productFormSchema.parse({
      sku: "BAD-003",
      name: "Broken Product",
      category: "Custom",
      description: "This description is long enough.",
      unit_price: "1",
      currency: "TRY",
      tax_rate: "20",
      unit: "unit",
      active: true,
      features: [],
      specifications: [],
      image_url: "not-a-url",
      gallery_urls: [],
    }),
  );
});

test("product schema rejects empty features and duplicate specification keys", () => {
  assert.throws(() =>
    productFormSchema.parse({
      sku: "BAD-004",
      name: "Broken Product",
      category: "Custom",
      description: "This description is long enough.",
      unit_price: "1",
      currency: "TRY",
      tax_rate: "20",
      unit: "unit",
      active: true,
      features: [""],
      specifications: [],
      image_url: "",
      gallery_urls: [],
    }),
  );

  assert.throws(() =>
    productFormSchema.parse({
      sku: "BAD-005",
      name: "Broken Product",
      category: "Custom",
      description: "This description is long enough.",
      unit_price: "1",
      currency: "TRY",
      tax_rate: "20",
      unit: "unit",
      active: true,
      features: [],
      specifications: [
        { key: "Width", value: "300 cm" },
        { key: "width", value: "320 cm" },
      ],
      image_url: "",
      gallery_urls: [],
    }),
  );
});

test("legacy product records normalize into the enriched shape", () => {
  const legacyInput: Parameters<typeof normalizeProductRecord>[0] = {
    id: "legacy_product",
    organization_id: "org_001",
    name: "Legacy Container",
    category: "Container",
    description: "Legacy catalog item.",
    base_price: 250000,
    currency: "TRY",
    tax_rate: 20,
    unit: "unit",
    tags: ["legacy", "legacy"],
    features: ["Portable", "Portable"],
    specifications: ["Steel frame"],
    active: true,
  };

  const normalized = normalizeProductRecord(legacyInput);

  assert.equal(normalized.unit_price, 250000);
  assert.equal(normalized.short_description, "");
  assert.deepEqual(normalized.tags, ["legacy"]);
  assert.deepEqual(normalized.features, ["Portable"]);
  assert.deepEqual(normalized.specifications, [{ key: "Steel frame", value: "Steel frame" }]);
  assert.deepEqual(normalized.gallery_urls, []);
});

test("product search and sorting cover name, sku, category, brand, model, and inventory codes", () => {
  const filteredByName = filterProducts(products, normalizeProductSearchParams({ query: "office" }));
  const filteredBySku = filterProducts(products, normalizeProductSearchParams({ query: "TIN-HO" }));
  const filteredByCategory = filterProducts(products, normalizeProductSearchParams({ query: "residential" }));
  const filteredByBrand = filterProducts(products, normalizeProductSearchParams({ query: "flowbuild" }));
  const filteredByModel = filterProducts(products, normalizeProductSearchParams({ query: "th-42" }));
  const filteredByBarcode = filterProducts(products, normalizeProductSearchParams({ query: "8691000000028" }));

  assert.equal(filteredByName.length, 1);
  assert.equal(filteredBySku.length, 1);
  assert.equal(filteredByCategory.length, 1);
  assert.equal(filteredByBrand.length, 1);
  assert.equal(filteredByModel.length, 1);
  assert.equal(filteredByBarcode.length, 1);

  const priceSorted = sortProducts([...products], "price");
  const newestSorted = sortProducts([...products], "newest");

  assert.equal(priceSorted[0].name, "Tiny House");
  assert.equal(newestSorted[0].name, "Tiny House");
});

test("product permissions keep demo records and viewers read-only", () => {
  assert.equal(canManageProducts("viewer"), false);
  assert.equal(canManageProducts("sales"), false);
  assert.equal(canMutateProductRecord("demo", "admin"), false);
  assert.equal(canMutateProductRecord("live", "admin"), true);
  assert.equal(canMutateProductRecord("live", "viewer"), false);
  assert.match(getProductRecordRestrictionMessage("demo", "admin"), /Connect live Supabase data/);
  assert.match(getProductRecordRestrictionMessage("live", "viewer"), /only view products/);
});
