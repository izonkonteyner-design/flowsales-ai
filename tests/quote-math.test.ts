import test from "node:test";
import assert from "node:assert/strict";

import { calculateLineTotal, calculateQuoteTotals } from "@/server/services/quote-math";

test("quote math calculates a fixed discounted taxed line total", () => {
  const total = calculateLineTotal({
    quantity: 2,
    unit_price: 100,
    discount_type: "fixed",
    discount_value: 10,
    tax_rate: 20,
  });

  assert.equal(total, 228);
});

test("quote math calculates a percentage discounted taxed line total", () => {
  const total = calculateLineTotal({
    quantity: 2,
    unit_price: 100,
    discount_type: "percentage",
    discount_value: 10,
    tax_rate: 20,
  });

  assert.equal(total, 216);
});

test("quote math returns aggregate totals with quote discount and shipping", () => {
  const totals = calculateQuoteTotals({
    items: [
      { quantity: 2, unit_price: 100, discount_type: "percentage", discount_value: 10, tax_rate: 20 },
      { quantity: 1, unit_price: 50, discount_type: "fixed", discount_value: 0, tax_rate: 20 },
    ],
    discount_type: "fixed",
    discount_value: 5,
    shipping_total: 12,
  });

  assert.equal(totals.subtotal, 250);
  assert.equal(totals.lineDiscountTotal, 20);
  assert.equal(totals.quoteDiscountTotal, 5);
  assert.equal(totals.discountTotal, 25);
  assert.equal(totals.taxTotal, 46);
  assert.equal(totals.shippingTotal, 12);
  assert.equal(totals.grandTotal, 283);
});

test("quote math rejects empty quotes", () => {
  assert.throws(() =>
    calculateQuoteTotals({
      items: [],
      discount_type: "fixed",
      discount_value: 0,
      shipping_total: 0,
    }),
  );
});

test("quote math rejects invalid negative values", () => {
  assert.throws(() =>
    calculateLineTotal({
      quantity: -1,
      unit_price: 100,
      discount_type: "fixed",
      discount_value: 0,
      tax_rate: 20,
    }),
  );
});
