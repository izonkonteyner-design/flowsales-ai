export type QuoteMathItem = {
  quantity: number;
  unit_price: number;
  discount: number;
  tax_rate: number;
};

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateLineTotal(item: QuoteMathItem) {
  const gross = item.quantity * item.unit_price;
  const discounted = gross - (gross * item.discount) / 100;
  const taxed = discounted + (discounted * item.tax_rate) / 100;
  return roundMoney(taxed);
}

export function calculateQuoteTotals(items: QuoteMathItem[]) {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const discountTotal = items.reduce(
    (sum, item) => sum + ((item.quantity * item.unit_price) * item.discount) / 100,
    0,
  );
  const taxable = subtotal - discountTotal;
  const taxTotal = items.reduce(
    (sum, item) => sum + (((item.quantity * item.unit_price) - ((item.quantity * item.unit_price) * item.discount) / 100) * item.tax_rate) / 100,
    0,
  );

  return {
    subtotal: roundMoney(subtotal),
    discountTotal: roundMoney(discountTotal),
    taxTotal: roundMoney(taxTotal),
    total: roundMoney(taxable + taxTotal),
  };
}
