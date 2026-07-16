import assert from "node:assert/strict";
import test from "node:test";

import { quoteFormSchema, quoteStatusSchema } from "@/lib/validations/quote";
import {
  canManageQuotes,
  canMutateQuoteRecord,
  generateQuoteNumber,
  getQuoteRecordRestrictionMessage,
  getQuoteStatusLabel,
} from "@/server/services/quote-domain";

test("quote validation accepts manual lines without a product id", () => {
  const parsed = quoteFormSchema.parse({
    lead_id: "550e8400-e29b-41d4-a716-446655440000",
    customer_id: null,
    quote_number: "FSA-2026-0200",
    issue_date: "2026-07-16",
    valid_until: "2026-08-15",
    status: "draft",
    currency: "TRY",
    shipping_total: "0",
    order_discount_type: "percentage",
    order_discount_value: "0",
    notes: "Manual assembly service included.",
    payment_terms: "50% upfront",
    delivery_terms: "Delivery in 21 days",
    items: [
      {
        product_id: null,
        name: "Installation package",
        description: "Manual service line",
        sku: "",
        quantity: "1",
        unit: "service",
        unit_price: "25000",
        currency: "TRY",
        discount_type: "percentage",
        discount_value: "0",
        tax_rate: "20",
        sort_order: "0",
      },
    ],
  });

  assert.equal(parsed.items[0].product_id, null);
  assert.equal(parsed.items[0].name, "Installation package");
});

test("quote validation rejects an expiry date before the issue date", () => {
  assert.equal(
    quoteFormSchema.safeParse({
      lead_id: "550e8400-e29b-41d4-a716-446655440000",
      customer_id: null,
      quote_number: "FSA-2026-0201",
      issue_date: "2026-07-16",
      valid_until: "2026-07-15",
      status: "draft",
      currency: "TRY",
      shipping_total: "0",
      order_discount_type: "percentage",
      order_discount_value: "0",
      notes: "",
      payment_terms: "",
      delivery_terms: "",
      items: [
        {
          product_id: null,
          name: "Manual line",
          description: "",
          sku: "",
          quantity: "1",
          unit: "unit",
          unit_price: "100",
          currency: "TRY",
          discount_type: "percentage",
          discount_value: "0",
          tax_rate: "20",
          sort_order: "0",
        },
      ],
    }).success,
    false,
  );
});

test("quote permissions keep demo records and viewers read only", () => {
  assert.equal(canManageQuotes("owner"), true);
  assert.equal(canManageQuotes("viewer"), false);
  assert.equal(canMutateQuoteRecord("live", "owner"), true);
  assert.equal(canMutateQuoteRecord("live", "admin"), true);
  assert.equal(canMutateQuoteRecord("demo", "admin"), false);
  assert.equal(canMutateQuoteRecord("live", "sales"), true);
  assert.equal(canMutateQuoteRecord("live", "viewer"), false);
  assert.match(getQuoteRecordRestrictionMessage("demo", "admin"), /Connect live Supabase data/);
  assert.match(getQuoteRecordRestrictionMessage("live", "viewer"), /Viewer permissions/);
});

test("quote number generation increments the current year sequence", () => {
  const next = generateQuoteNumber(["FSA-2026-0012", "FSA-2026-0015", "FSA-2025-0099"], new Date("2026-07-16T00:00:00.000Z"));

  assert.equal(next, "FSA-2026-0016");
});

test("quote status labels include cancelled", () => {
  assert.equal(getQuoteStatusLabel("cancelled"), "Cancelled");
});

test("quote validation rejects malformed ids and bad line data", () => {
  assert.equal(
    quoteFormSchema.safeParse({
      lead_id: "not-a-uuid",
      customer_id: null,
      quote_number: "FSA-2026-0202",
      issue_date: "2026-07-16",
      valid_until: "2026-08-15",
      status: "draft",
      currency: "TRY",
      shipping_total: "0",
      order_discount_type: "percentage",
      order_discount_value: "0",
      notes: "",
      payment_terms: "",
      delivery_terms: "",
      items: [
        {
          product_id: null,
          name: "Valid line",
          description: "",
          sku: "",
          quantity: "1",
          unit: "unit",
          unit_price: "100",
          currency: "TRY",
          discount_type: "percentage",
          discount_value: "0",
          tax_rate: "20",
          sort_order: "0",
        },
      ],
    }).success,
    false,
  );

  assert.equal(
    quoteFormSchema.safeParse({
      lead_id: "550e8400-e29b-41d4-a716-446655440000",
      customer_id: null,
      quote_number: "FSA-2026-0203",
      issue_date: "2026-07-16",
      valid_until: "2026-08-15",
      status: "draft",
      currency: "TRY",
      shipping_total: "0",
      order_discount_type: "percentage",
      order_discount_value: "0",
      notes: "",
      payment_terms: "",
      delivery_terms: "",
      items: [],
    }).success,
    false,
  );

  assert.equal(
    quoteFormSchema.safeParse({
      lead_id: "550e8400-e29b-41d4-a716-446655440000",
      customer_id: null,
      quote_number: "FSA-2026-0204",
      issue_date: "2026-07-16",
      valid_until: "2026-08-15",
      status: "draft",
      currency: "TRY",
      shipping_total: "0",
      order_discount_type: "percentage",
      order_discount_value: "0",
      notes: "",
      payment_terms: "",
      delivery_terms: "",
      items: [
        {
          product_id: null,
          name: "Zero quantity",
          description: "",
          sku: "",
          quantity: "0",
          unit: "unit",
          unit_price: "100",
          currency: "TRY",
          discount_type: "percentage",
          discount_value: "0",
          tax_rate: "20",
          sort_order: "0",
        },
      ],
    }).success,
    false,
  );

  assert.equal(
    quoteFormSchema.safeParse({
      lead_id: "550e8400-e29b-41d4-a716-446655440000",
      customer_id: null,
      quote_number: "FSA-2026-0205",
      issue_date: "2026-07-16",
      valid_until: "2026-08-15",
      status: "draft",
      currency: "TRY",
      shipping_total: "0",
      order_discount_type: "percentage",
      order_discount_value: "0",
      notes: "",
      payment_terms: "",
      delivery_terms: "",
      items: [
        {
          product_id: null,
          name: "Negative price",
          description: "",
          sku: "",
          quantity: "1",
          unit: "unit",
          unit_price: "-1",
          currency: "TRY",
          discount_type: "percentage",
          discount_value: "0",
          tax_rate: "20",
          sort_order: "0",
        },
      ],
    }).success,
    false,
  );

  assert.equal(
    quoteFormSchema.safeParse({
      lead_id: "550e8400-e29b-41d4-a716-446655440000",
      customer_id: null,
      quote_number: "FSA-2026-0206",
      issue_date: "2026-07-16",
      valid_until: "2026-08-15",
      status: "draft",
      currency: "TRY",
      shipping_total: "0",
      order_discount_type: "percentage",
      order_discount_value: "0",
      notes: "",
      payment_terms: "",
      delivery_terms: "",
      items: [
        {
          product_id: null,
          name: "Big discount",
          description: "",
          sku: "",
          quantity: "1",
          unit: "unit",
          unit_price: "100",
          currency: "TRY",
          discount_type: "percentage",
          discount_value: "101",
          tax_rate: "20",
          sort_order: "0",
        },
      ],
    }).success,
    false,
  );

  assert.equal(
    quoteFormSchema.safeParse({
      lead_id: "550e8400-e29b-41d4-a716-446655440000",
      customer_id: null,
      quote_number: "FSA-2026-0207",
      issue_date: "2026-07-16",
      valid_until: "2026-08-15",
      status: "draft",
      currency: "TRY",
      shipping_total: "0",
      order_discount_type: "fixed",
      order_discount_value: "-1",
      notes: "",
      payment_terms: "",
      delivery_terms: "",
      items: [
        {
          product_id: null,
          name: "Fixed discount",
          description: "",
          sku: "",
          quantity: "1",
          unit: "unit",
          unit_price: "100",
          currency: "TRY",
          discount_type: "fixed",
          discount_value: "-1",
          tax_rate: "20",
          sort_order: "0",
        },
      ],
    }).success,
    false,
  );

  assert.equal(
    quoteFormSchema.safeParse({
      lead_id: "550e8400-e29b-41d4-a716-446655440000",
      customer_id: null,
      quote_number: "FSA-2026-0208",
      issue_date: "2026-07-16",
      valid_until: "2026-08-15",
      status: "draft",
      currency: "TRY",
      shipping_total: "0",
      order_discount_type: "percentage",
      order_discount_value: "0",
      notes: "",
      payment_terms: "",
      delivery_terms: "",
      items: [
        {
          product_id: null,
          name: "Tax too high",
          description: "",
          sku: "",
          quantity: "1",
          unit: "unit",
          unit_price: "100",
          currency: "TRY",
          discount_type: "percentage",
          discount_value: "0",
          tax_rate: "101",
          sort_order: "0",
        },
      ],
    }).success,
    false,
  );
});

test("quote status validation accepts the supported workflow only", () => {
  for (const status of ["draft", "sent", "viewed", "accepted", "rejected", "expired", "cancelled"]) {
    assert.equal(quoteStatusSchema.safeParse(status).success, true);
  }

  assert.equal(quoteStatusSchema.safeParse("archived").success, false);
});
