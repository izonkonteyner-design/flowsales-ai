type Numeric = number | string | null | undefined;
export type QuoteSnapshotInput = {
  subtotal?: Numeric; discount_total?: Numeric; line_discount_total?: Numeric;
  order_discount_total?: Numeric; taxable_subtotal?: Numeric; tax_total?: Numeric;
  shipping_total?: Numeric; grand_total?: Numeric; total?: Numeric;
};

function money(value: Numeric): number | undefined {
  if (value == null || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round((number + Number.EPSILON) * 100) / 100 : undefined;
}

/** Read-only compatibility for historical records after zero-default columns were added.
 * Stored positive totals are preserved; inconsistencies are reported, never written back.
 */
export function resolveQuoteSnapshot(raw: QuoteSnapshotInput) {
  const subtotal = money(raw.subtotal) ?? 0;
  const orderDiscount = money(raw.order_discount_total) ?? 0;
  const lineDiscount = money(raw.line_discount_total) || Math.max(0, (money(raw.discount_total) ?? 0) - orderDiscount);
  const discount = Math.round((lineDiscount + orderDiscount) * 100) / 100;
  const expectedTaxable = Math.round(Math.max(0, subtotal - discount) * 100) / 100;
  const taxable = money(raw.taxable_subtotal);
  const taxableSubtotal = taxable == null || (taxable === 0 && expectedTaxable > 0) ? expectedTaxable : taxable;
  const tax = money(raw.tax_total) ?? 0;
  const shipping = money(raw.shipping_total) ?? 0;
  const calculated = Math.round((taxableSubtotal + tax + shipping) * 100) / 100;
  const stored = money(raw.grand_total);
  const legacy = money(raw.total);
  const grandTotal = stored != null && (stored > 0 || calculated === 0) ? stored
    : legacy != null && legacy > 0 ? legacy : calculated;
  const issues: string[] = [];
  if (discount > subtotal) issues.push("İndirim toplamı ara toplamı aşıyor.");
  if (Math.abs(grandTotal - calculated) > 0.01) issues.push("Saklanan genel toplam, ara toplam, indirim ve vergiyle uyuşmuyor.");
  if (stored === 0 && calculated > 0 && !legacy) issues.push("Saklanan genel toplam eksik; gösterilen tutar mevcut özet alanlarından hesaplandı.");
  return {
    subtotal, line_discount_total: lineDiscount, order_discount_total: orderDiscount,
    discount_total: discount, taxable_subtotal: taxableSubtotal,
    tax_total: tax, shipping_total: shipping, grand_total: grandTotal, total: grandTotal,
    issues,
  };
}
