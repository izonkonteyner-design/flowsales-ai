import assert from "node:assert/strict";
import test from "node:test";

import { canManageProducts, canMutateProductRecord, getProductRecordRestrictionMessage } from "@/server/services/product-domain";
import { canManageQuotes, canMutateQuoteRecord, generateQuoteNumber } from "@/server/services/quote-domain";
import { productFormSchema } from "@/lib/validations/product";
import { quoteFormSchema } from "@/lib/validations/quote";

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

test("quote schema validation accepts customer and line items", () => {
  const parsed = quoteFormSchema.parse({
    lead_id: null,
    quote_number: "FSA-2026-0150",
    issue_date: "2026-07-16",
    expiry_date: "2026-08-15",
    status: "draft",
    currency: "TRY",
    customer_name: "Ahmet Yilmaz",
    customer_company: "Yilmaz Yapi",
    customer_email: "ahmet@yilmazyapi.com",
    customer_phone: "+90 532 000 0001",
    notes: "",
    payment_terms: "50% advance",
    delivery_terms: "Delivery in 30 days",
    discount_type: "fixed",
    discount_value: "0",
    shipping_total: "0",
    items: [
      {
        product_id: "prod_001",
        name: "Container Office",
        description: "Container Office - turnkey installation",
        quantity: "2",
        unit: "unit",
        unit_price: "420000",
        discount_type: "percentage",
        discount_value: "5",
        tax_rate: "20",
        sort_order: "0",
      },
    ],
  });

  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.customer_name, "Ahmet Yilmaz");
});

test("quote schema rejects missing customer name", () => {
  assert.throws(() =>
    quoteFormSchema.parse({
      lead_id: null,
      quote_number: "FSA-2026-0150",
      issue_date: "2026-07-16",
      expiry_date: "2026-08-15",
      status: "draft",
      currency: "TRY",
      customer_name: "",
      customer_company: "",
      customer_email: "",
      customer_phone: "",
      notes: "",
      payment_terms: "",
      delivery_terms: "",
      discount_type: "fixed",
      discount_value: "0",
      shipping_total: "0",
      items: [],
    }),
  );
});

test("product permissions keep demo records and viewers read-only", () => {
  assert.equal(canManageProducts("viewer"), false);
  assert.equal(canManageProducts("sales"), false);
  assert.equal(canMutateProductRecord("demo", "admin"), false);
  assert.equal(canMutateProductRecord("live", "admin"), true);
  assert.match(getProductRecordRestrictionMessage("demo", "admin"), /Connect live Supabase data/);
});

test("quote permissions keep viewers read-only and live sales mutable", () => {
  assert.equal(canManageQuotes("viewer"), false);
  assert.equal(canManageQuotes("sales"), true);
  assert.equal(canMutateQuoteRecord("demo", "sales"), false);
  assert.equal(canMutateQuoteRecord("live", "sales"), true);
});

test("quote number generation is deterministic", () => {
  assert.equal(generateQuoteNumber(7, 2026), "FSA-2026-0007");
});
