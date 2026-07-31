import assert from "node:assert/strict";
import test from "node:test";

import { normalizeQuoteRecord } from "@/server/services/quotes";
import type { QuoteItem } from "@/types/crm";

const emptyRelationships = {
  lead_name: null,
  lead_company: null,
  customer_name: null,
  customer_company: null,
};

const sampleItems: QuoteItem[] = [
  {
    id: "qi_001",
    quote_id: "q_001",
    product_id: null,
    name: "Container Office",
    description: "Turnkey installation",
    sku: "",
    unit: "piece",
    quantity: 2,
    unit_price: 420000,
    currency: "TRY",
    discount_type: "percentage",
    discount_value: 5,
    discount: 5,
    tax_rate: 20,
    line_subtotal: 840000,
    line_discount: 42000,
    taxable_subtotal: 798000,
    line_tax: 159600,
    line_total: 957600,
    sort_order: 0,
    created_at: "",
    updated_at: "",
  } as QuoteItem,
];

test("normalizeQuoteRecord trusts positive stored grand_total", () => {
  const normalized = normalizeQuoteRecord(
    {
      id: "q_repaired",
      organization_id: "org_1",
      currency: "TRY",
      subtotal: 840000,
      line_discount_total: 42000,
      order_discount_total: 0,
      tax_total: 159600,
      taxable_subtotal: 798000,
      shipping_total: 0,
      grand_total: 957600,
      total: 957600,
      discount_total: 42000,
      status: "draft",
    },
    "live",
    emptyRelationships,
    sampleItems,
  );

  assert.equal(normalized.grand_total, 957600);
  assert.equal(normalized.total, 957600);
});

test("normalizeQuoteRecord falls back to legacy total when grand_total is stuck at 0", () => {
  // This is exactly the state 0002_seed.sql + 0007 back-fill produced for the
  // seeded rows before 0019_fix_quote_grand_total_backfill.sql runs:
  // `grand_total = 0` (NOT NULL DEFAULT), `total = 1930400`.
  const normalized = normalizeQuoteRecord(
    {
      id: "q_seed_0142",
      organization_id: "org_1",
      currency: "TRY",
      subtotal: 1685000,
      line_discount_total: 0,
      order_discount_total: 0,
      tax_total: 329900,
      taxable_subtotal: 0,
      taxable_total: 0,
      shipping_total: 0,
      grand_total: 0,
      total: 1930400,
      discount_total: 84500,
      status: "sent",
    },
    "live",
    emptyRelationships,
    [],
  );

  assert.equal(
    normalized.grand_total,
    1930400,
    "grand_total must fall back to the legacy `total` column when the stored value is the literal 0 left by 0007",
  );
  assert.equal(normalized.total, 1930400);
});

test("normalizeQuoteRecord computes from parts when both grand_total and total are 0 but subtotal + tax are positive", () => {
  const normalized = normalizeQuoteRecord(
    {
      id: "q_orphan",
      organization_id: "org_1",
      currency: "TRY",
      subtotal: 1000,
      line_discount_total: 0,
      order_discount_total: 0,
      tax_total: 200,
      taxable_subtotal: 1000,
      shipping_total: 50,
      grand_total: 0,
      total: 0,
      discount_total: 0,
      status: "draft",
    },
    "live",
    emptyRelationships,
    [],
  );

  assert.equal(normalized.grand_total, 1250);
  assert.equal(normalized.total, 1250);
});

test("normalizeQuoteRecord returns 0 only when the quote is genuinely empty", () => {
  const normalized = normalizeQuoteRecord(
    {
      id: "q_empty",
      organization_id: "org_1",
      currency: "TRY",
      subtotal: 0,
      line_discount_total: 0,
      order_discount_total: 0,
      tax_total: 0,
      taxable_subtotal: 0,
      shipping_total: 0,
      grand_total: 0,
      total: 0,
      discount_total: 0,
      status: "draft",
    },
    "live",
    emptyRelationships,
    [],
  );

  assert.equal(normalized.grand_total, 0);
  assert.equal(normalized.total, 0);
});

test("normalizeQuoteRecord never produces grand_total = 0 when subtotal + tax + shipping is positive", () => {
  // Regression guard for the P1 bug. For any quote with arithmetic-positive
  // parts, the normalized grand total must be positive regardless of how
  // the DB columns were (mis)seeded.
  const cases = [
    { subtotal: 1685000, tax: 329900, shipping: 0, total: 1930400 },
    { subtotal: 265000, tax: 53000, shipping: 0, total: 318000 },
    { subtotal: 1350000, tax: 270000, shipping: 0, total: 1485000 },
  ];

  for (const c of cases) {
    const normalized = normalizeQuoteRecord(
      {
        id: "q_case",
        organization_id: "org_1",
        currency: "TRY",
        subtotal: c.subtotal,
        line_discount_total: 0,
        order_discount_total: 0,
        tax_total: c.tax,
        taxable_subtotal: 0,
        shipping_total: c.shipping,
        grand_total: 0,
        total: c.total,
        discount_total: 0,
        status: "draft",
      },
      "live",
      emptyRelationships,
      [],
    );
    assert.ok(
      (normalized.grand_total ?? 0) > 0,
      `grand_total must be positive when parts are positive (got ${normalized.grand_total})`,
    );
  }
});

test("normalized `taxable_subtotal` is repaired from legacy parts when stored as 0", () => {
  const normalized = normalizeQuoteRecord(
    {
      id: "q_taxable_stuck",
      organization_id: "org_1",
      currency: "TRY",
      subtotal: 1685000,
      line_discount_total: 0,
      order_discount_total: 0,
      tax_total: 329900,
      taxable_subtotal: 0,
      shipping_total: 0,
      grand_total: 0,
      total: 1930400,
      discount_total: 84500,
      status: "sent",
    },
    "live",
    emptyRelationships,
    [],
  );

  assert.equal(normalized.taxable_subtotal, 1685000 - 84500);
});
