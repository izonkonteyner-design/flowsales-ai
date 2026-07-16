export type QuoteMathItem = {
  quantity: number;
  unit_price: number;
  discount_type?: "percentage" | "fixed";
  discount_value?: number;
  tax_rate: number;
};

export type QuoteMathInput = {
  items: QuoteMathItem[];
  discount_type?: "percentage" | "fixed";
  discount_value?: number;
  shipping_total?: number;
};

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toCents(value: number) {
  return Math.round(value * 100);
}

function fromCents(value: number) {
  return roundMoney(value / 100);
}

export function calculateLineTotal(item: QuoteMathItem) {
  if (item.quantity <= 0) {
    throw new Error("Quantity must be positive.");
  }

  if (item.unit_price < 0 || item.tax_rate < 0) {
    throw new Error("Money values cannot be negative.");
  }

  const gross = toCents(item.quantity * item.unit_price);
  const discountType = item.discount_type ?? "fixed";
  const discountValue = Math.max(0, item.discount_value ?? 0);
  const discountCents =
    discountType === "percentage"
      ? Math.min(gross, Math.round((gross * discountValue) / 100))
      : Math.min(gross, toCents(discountValue));
  const taxable = gross - discountCents;
  const taxCents = Math.round((taxable * item.tax_rate) / 100);

  return fromCents(taxable + taxCents);
}

export function calculateQuoteTotals({
  items,
  discount_type = "fixed",
  discount_value = 0,
  shipping_total = 0,
}: QuoteMathInput) {
  if (!items.length) {
    throw new Error("A quote requires at least one line item.");
  }

  const normalizedItems = items.map((item) => ({
    ...item,
    discount_type: item.discount_type ?? "fixed",
    discount_value: item.discount_value ?? 0,
  }));

  const lineResults = normalizedItems.map((item) => {
    const subtotal = toCents(item.quantity * item.unit_price);
    const discountCents =
      item.discount_type === "percentage"
        ? Math.min(subtotal, Math.round((subtotal * item.discount_value) / 100))
        : Math.min(subtotal, toCents(item.discount_value));
    const taxable = subtotal - discountCents;
    const taxCents = Math.round((taxable * item.tax_rate) / 100);

    return {
      subtotal,
      discountCents,
      taxCents,
      totalCents: taxable + taxCents,
    };
  });

  const subtotal = fromCents(lineResults.reduce((sum, item) => sum + item.subtotal, 0));
  const lineDiscountTotal = fromCents(lineResults.reduce((sum, item) => sum + item.discountCents, 0));
  const taxBase = Math.max(0, toCents(subtotal) - toCents(lineDiscountTotal));
  const quoteDiscountCents =
    discount_type === "percentage"
      ? Math.min(taxBase, Math.round((taxBase * discount_value) / 100))
      : Math.min(taxBase, toCents(discount_value));
  const taxableAfterDiscounts = taxBase - quoteDiscountCents;
  const taxTotal = fromCents(lineResults.reduce((sum, item) => sum + item.taxCents, 0));
  const shippingTotal = fromCents(Math.max(0, toCents(shipping_total)));
  const discountTotal = fromCents(toCents(lineDiscountTotal) + quoteDiscountCents);
  const grandTotal = fromCents(taxableAfterDiscounts + toCents(taxTotal) + toCents(shippingTotal));

  return {
    subtotal,
    lineDiscountTotal,
    quoteDiscountTotal: fromCents(quoteDiscountCents),
    discountTotal,
    taxTotal,
    shippingTotal,
    grandTotal,
    total: grandTotal,
  };
}
