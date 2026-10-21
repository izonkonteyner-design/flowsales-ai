import assert from "node:assert/strict";
import test from "node:test";
import { resolveQuoteSnapshot } from "@/lib/quote-snapshot";

test("legacy positive total is not hidden by newly added zero-default fields", () => {
  const result = resolveQuoteSnapshot({ subtotal: "1685000", discount_total: "84500", line_discount_total: 0, taxable_subtotal: 0, tax_total: "329900", grand_total: 0, total: "1930400" });
  assert.equal(result.grand_total, 1930400);
  assert.equal(result.taxable_subtotal, 1600500);
  assert.deepEqual(result.issues, []);
});
test("fully discounted and genuinely free quotes retain zero totals", () => {
  assert.equal(resolveQuoteSnapshot({ subtotal: 500, discount_total: 500, grand_total: 0 }).grand_total, 0);
  assert.equal(resolveQuoteSnapshot({ subtotal: 0, grand_total: 0 }).grand_total, 0);
});
test("modern historical positive snapshot is preserved but inconsistent values are flagged", () => {
  const result = resolveQuoteSnapshot({ subtotal: 100, tax_total: 20, grand_total: 125, total: 125 });
  assert.equal(result.grand_total, 125);
  assert.equal(result.issues.length, 1);
});
test("missing general total is derived without pretending the snapshot is valid", () => {
  const result = resolveQuoteSnapshot({ subtotal: "265000", tax_total: "53000", taxable_subtotal: 0, grand_total: 0 });
  assert.equal(result.grand_total, 318000);
  assert.equal(result.issues.length, 1);
});
test("numeric rounding and explicit line/order discounts are consistent", () => {
  const result = resolveQuoteSnapshot({ subtotal: "10.005", line_discount_total: "1", order_discount_total: "1", tax_total: "1.60", grand_total: "9.61" });
  assert.equal(result.subtotal, 10.01);
  assert.equal(result.grand_total, 9.61);
  assert.equal(result.discount_total, 2);
});
