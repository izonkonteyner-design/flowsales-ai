import assert from "node:assert/strict";
import test from "node:test";

import { calculateLineBreakdown, calculateLineTotal, calculateQuoteTotals, type QuoteMathItem } from "@/server/services/quote-math";
import { calculateNormalizedQuoteTotals } from "@/server/services/quote-domain";

test("quote math handles a single line without tax", () => {
  const totals = calculateQuoteTotals([
    { quantity: 2, unit_price: 100, tax_rate: 0, currency: "TRY" },
  ], { currency: "TRY" });

  assert.equal(totals.subtotal, 200);
  assert.equal(totals.discount_total, 0);
  assert.equal(totals.taxable_subtotal, 200);
  assert.equal(totals.tax_total, 0);
  assert.equal(totals.shipping_total, 0);
  assert.equal(totals.grand_total, 200);
});

test("quote math handles a single line with tax", () => {
  const totals = calculateQuoteTotals([
    { quantity: 2, unit_price: 100, tax_rate: 20, currency: "TRY" },
  ], { currency: "TRY" });

  assert.equal(totals.subtotal, 200);
  assert.equal(totals.tax_total, 40);
  assert.equal(totals.grand_total, 240);
});

test("quote math handles multiple lines with line discounts", () => {
  const totals = calculateQuoteTotals([
    { quantity: 2, unit_price: 100, discount: 10, tax_rate: 20, currency: "TRY" },
    { quantity: 1, unit_price: 50, discount: 0, tax_rate: 20, currency: "TRY" },
  ], { currency: "TRY" });

  assert.equal(totals.subtotal, 250);
  assert.equal(totals.line_discount_total, 20);
  assert.equal(totals.discount_total, 20);
  assert.equal(totals.tax_total, 46);
  assert.equal(totals.grand_total, 276);
});

test("quote math handles decimal quantities and decimal prices", () => {
  const line = calculateLineBreakdown(
    { quantity: 1.5, unit_price: 199.99, tax_rate: 18, currency: "USD" },
    "USD",
  );

  assert.equal(line.subtotal, 299.99);
  assert.equal(line.taxable_subtotal, 299.99);
  assert.equal(line.tax_total, 54);
  assert.equal(calculateLineTotal({ quantity: 1.5, unit_price: 199.99, tax_rate: 18, currency: "USD" }, "USD"), 353.98);
});

test("quote math applies order discounts and shipping deterministically", () => {
  const totals = calculateQuoteTotals([
    { quantity: 2, unit_price: 100, tax_rate: 20, currency: "EUR" },
    { quantity: 1, unit_price: 50, tax_rate: 20, currency: "EUR" },
  ], {
    currency: "EUR",
    order_discount_type: "fixed",
    order_discount_value: 25,
    shipping_total: 15,
  });

  assert.equal(totals.subtotal, 250);
  assert.equal(totals.order_discount_total, 25);
  assert.equal(totals.discount_total, 25);
  assert.equal(totals.shipping_total, 15);
  assert.equal(totals.taxable_subtotal, 225);
  assert.equal(totals.tax_total, 45);
  assert.equal(totals.grand_total, 285);
});

test("quote math handles zero shipping and zero tax", () => {
  const totals = calculateQuoteTotals([
    { quantity: 1, unit_price: 75, tax_rate: 0, currency: "TRY" },
  ], { currency: "TRY", shipping_total: 0 });

  assert.equal(totals.shipping_total, 0);
  assert.equal(totals.tax_total, 0);
  assert.equal(totals.grand_total, 75);
});

test("quote math clamps a one hundred percent discount to zero total", () => {
  const totals = calculateQuoteTotals([
    { quantity: 1, unit_price: 100, discount: 100, tax_rate: 20, currency: "TRY" },
  ], { currency: "TRY" });

  assert.equal(totals.subtotal, 100);
  assert.equal(totals.discount_total, 100);
  assert.equal(totals.taxable_subtotal, 0);
  assert.equal(totals.tax_total, 0);
  assert.equal(totals.grand_total, 0);
});

test("quote math rejects invalid negative and zero values", () => {
  assert.throws(() =>
    calculateQuoteTotals([
      { quantity: 0, unit_price: 100, tax_rate: 20, currency: "TRY" },
    ], { currency: "TRY" }),
  );

  assert.throws(() =>
    calculateQuoteTotals([
      { quantity: 1, unit_price: -1, tax_rate: 20, currency: "TRY" },
    ], { currency: "TRY" }),
  );

  assert.throws(() =>
    calculateQuoteTotals([
      { quantity: 1, unit_price: 100, tax_rate: 20, currency: "TRY" },
    ], { currency: "TRY", shipping_total: -1 }),
  );
});

test("quote math handles rounding edge cases consistently", () => {
  const totals = calculateQuoteTotals([
    { quantity: 3, unit_price: 0.3333, tax_rate: 0, currency: "TRY" },
  ], { currency: "TRY" });

  assert.equal(totals.subtotal, 1);
  assert.equal(totals.grand_total, 1);

  const repeated = calculateQuoteTotals([
    { quantity: 3, unit_price: 0.3333, tax_rate: 0, currency: "TRY" },
  ], { currency: "TRY" });

  assert.deepEqual(repeated, totals);
});

test("quote math supports TRY, USD, and EUR consistently", () => {
  const tryTotals = calculateQuoteTotals([{ quantity: 1, unit_price: 10, tax_rate: 20, currency: "TRY" }], { currency: "TRY" });
  const usdTotals = calculateQuoteTotals([{ quantity: 1, unit_price: 10, tax_rate: 20, currency: "USD" }], { currency: "USD" });
  const eurTotals = calculateQuoteTotals([{ quantity: 1, unit_price: 10, tax_rate: 20, currency: "EUR" }], { currency: "EUR" });

  assert.equal(tryTotals.currency, "TRY");
  assert.equal(usdTotals.currency, "USD");
  assert.equal(eurTotals.currency, "EUR");
  assert.equal(tryTotals.grand_total, 12);
  assert.equal(usdTotals.grand_total, 12);
  assert.equal(eurTotals.grand_total, 12);
});

test("quote math rejects mixed currency line items", () => {
  assert.throws(() =>
    calculateNormalizedQuoteTotals(
      [
        { quantity: 1, unit_price: 10, tax_rate: 20, currency: "TRY" },
        { quantity: 1, unit_price: 10, tax_rate: 20, currency: "USD" },
      ],
      { currency: "TRY" },
    ),
  );
});

test("quote math is deterministic across repeated calculations", () => {
  const input: QuoteMathItem[] = [
    { quantity: 4, unit_price: 125.55, discount: 7.5, tax_rate: 18, currency: "USD" },
    { quantity: 2.25, unit_price: 89.99, discount_type: "fixed" as const, discount_value: 10, tax_rate: 18, currency: "USD" },
  ];

  const first = calculateQuoteTotals(input, {
    currency: "USD",
    shipping_total: 25.5,
    order_discount_type: "percentage",
    order_discount_value: 5,
  });
  const second = calculateQuoteTotals(input, {
    currency: "USD",
    shipping_total: 25.5,
    order_discount_type: "percentage",
    order_discount_value: 5,
  });

  assert.deepEqual(second, first);
});
