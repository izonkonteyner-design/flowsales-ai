import test from "node:test";
import assert from "node:assert/strict";

import { calculateLineTotal, calculateQuoteTotals } from "@/server/services/quote-math";

test("quote math calculates a discounted taxed line total", () => {
  const total = calculateLineTotal({
    quantity: 2,
    unit_price: 100,
    discount: 10,
    tax_rate: 20,
  });

  assert.equal(total, 216);
});

test("quote math returns aggregate totals", () => {
  const totals = calculateQuoteTotals([
    { quantity: 2, unit_price: 100, discount: 10, tax_rate: 20 },
    { quantity: 1, unit_price: 50, discount: 0, tax_rate: 20 },
  ]);

  assert.equal(totals.subtotal, 250);
  assert.equal(totals.discountTotal, 20);
  assert.equal(totals.taxTotal, 46);
  assert.equal(totals.total, 276);
});
