import type { CurrencyCode, QuoteDiscountType, QuoteMoneyLine, QuoteMoneyTotals } from "@/types/crm";

const MONEY_SCALE = 6;
const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const TEN = BigInt(10);
const HUNDRED = BigInt(100);
const MONEY_SCALE_FACTOR = TEN ** BigInt(MONEY_SCALE);
const DISPLAY_DECIMALS = 2;
const DISPLAY_SCALE_FACTOR = TEN ** BigInt(MONEY_SCALE - DISPLAY_DECIMALS);
const DEFAULT_CURRENCY: CurrencyCode = "TRY";

export type QuoteMathItem = QuoteMoneyLine;

export type QuoteMathLineBreakdown = {
  subtotal: number;
  line_discount: number;
  taxable_subtotal: number;
  tax_total: number;
  total: number;
  currency: CurrencyCode;
};

export type QuoteMathOptions = {
  currency?: CurrencyCode;
  shipping_total?: number;
  shipping?: number;
  order_discount?: number;
  order_discount_type?: QuoteDiscountType;
  order_discount_value?: number;
};

export type QuoteMathTotals = QuoteMoneyTotals & {
  line_discount_total: number;
  order_discount_total: number;
  line_items: QuoteMathLineBreakdown[];
};

function isCurrencyCode(value: unknown): value is CurrencyCode {
  return value === "TRY" || value === "USD" || value === "EUR";
}

function ensureFiniteNumber(value: unknown, fieldName: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number.`);
  }
}

function decimalStringToUnits(value: string, scale = MONEY_SCALE) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Money values cannot be empty.");
  }

  const negative = trimmed.startsWith("-");
  const unsigned = negative || trimmed.startsWith("+") ? trimmed.slice(1) : trimmed;
  if (!/^\d+(\.\d+)?$/.test(unsigned)) {
    throw new Error("Money values must use plain decimal notation.");
  }

  const [integerPart, fractionPart = ""] = unsigned.split(".");
  const padded = `${fractionPart}${"0".repeat(scale + 1)}`;
  const precisionSlice = padded.slice(0, scale + 1);
  const roundDigit = Number(precisionSlice[scale] ?? "0");
  let units = BigInt(integerPart || "0") * (TEN ** BigInt(scale)) + BigInt(precisionSlice.slice(0, scale) || "0");

  if (roundDigit >= 5) {
    units += ONE;
  }

  return negative ? -units : units;
}

function toUnits(value: number | string, fieldName: string, allowNegative = false) {
  ensureFiniteNumber(typeof value === "number" ? value : Number(value), fieldName);
  const units = decimalStringToUnits(String(value), MONEY_SCALE);

  if (!allowNegative && units < ZERO) {
    throw new Error(`${fieldName} cannot be negative.`);
  }

  return units;
}

function toMinorUnits(units: bigint) {
  if (units === ZERO) {
    return ZERO;
  }

  const sign = units < ZERO ? -ONE : ONE;
  const absolute = units < ZERO ? -units : units;
  const rounded = (absolute + DISPLAY_SCALE_FACTOR / TWO) / DISPLAY_SCALE_FACTOR;
  return sign * rounded;
}

function toDisplayNumber(units: bigint) {
  const minorUnits = toMinorUnits(units);
  return Number(minorUnits) / 100;
}

function multiplyUnits(left: bigint, right: bigint) {
  return (left * right) / MONEY_SCALE_FACTOR;
}

function applyPercentage(baseUnits: bigint, percentage: bigint) {
  return (baseUnits * percentage) / (HUNDRED * MONEY_SCALE_FACTOR);
}

function clampToRange(value: bigint, minimum: bigint, maximum: bigint) {
  if (value < minimum) {
    return minimum;
  }

  if (value > maximum) {
    return maximum;
  }

  return value;
}

function resolveDiscountType(item: QuoteMathItem): QuoteDiscountType {
  if (item.discount_type === "fixed") {
    return "fixed";
  }

  if (item.discount_type === "percentage") {
    return "percentage";
  }

  if (typeof item.discount_value === "number" && item.discount_value > 0) {
    return "fixed";
  }

  return "percentage";
}

function resolveDiscountValue(item: QuoteMathItem) {
  if (typeof item.discount_value === "number") {
    return item.discount_value;
  }

  return typeof item.discount === "number" ? item.discount : 0;
}

function resolveCurrency(currency: CurrencyCode | undefined, items: QuoteMathItem[]) {
  const resolved = currency ?? items.find((item) => item.currency)?.currency ?? DEFAULT_CURRENCY;
  if (!isCurrencyCode(resolved)) {
    throw new Error("Unsupported currency.");
  }

  for (const item of items) {
    if (item.currency && item.currency !== resolved) {
      throw new Error("All quote items must use the same currency.");
    }
  }

  return resolved;
}

function buildLineBreakdown(item: QuoteMathItem, currency: CurrencyCode) {
  ensureFiniteNumber(item.quantity, "Quantity");
  ensureFiniteNumber(item.unit_price, "Unit price");

  if (item.quantity <= 0) {
    throw new Error("Quantity must be greater than zero.");
  }

  if (item.unit_price < 0) {
    throw new Error("Unit price cannot be negative.");
  }

  const taxRate = typeof item.tax_rate === "number" ? item.tax_rate : 0;
  ensureFiniteNumber(taxRate, "Tax rate");
  if (taxRate < 0 || taxRate > 100) {
    throw new Error("Tax rate must be between 0 and 100.");
  }

  const quantityUnits = toUnits(item.quantity, "Quantity");
  const unitPriceUnits = toUnits(item.unit_price, "Unit price");
  const grossUnits = multiplyUnits(quantityUnits, unitPriceUnits);

  const discountType = resolveDiscountType(item);
  const discountValue = resolveDiscountValue(item);
  ensureFiniteNumber(discountValue, "Discount");
  if (discountValue < 0) {
    throw new Error("Discount cannot be negative.");
  }

  let discountUnits = ZERO;
  if (discountType === "fixed") {
    discountUnits = clampToRange(toUnits(discountValue, "Discount"), ZERO, grossUnits);
  } else {
    const discountPercentUnits = toUnits(discountValue, "Discount");
    if (discountPercentUnits > HUNDRED * MONEY_SCALE_FACTOR) {
      throw new Error("Discount cannot exceed 100 percent.");
    }

    discountUnits = clampToRange(applyPercentage(grossUnits, discountPercentUnits), ZERO, grossUnits);
  }

  const taxableUnits = grossUnits - discountUnits;
  const taxUnits = applyPercentage(taxableUnits, toUnits(taxRate, "Tax rate"));
  const totalUnits = taxableUnits + taxUnits;

  return {
    currency,
    grossUnits,
    discountUnits,
    taxableUnits,
    taxUnits,
    totalUnits,
  };
}

export function calculateLineBreakdown(item: QuoteMathItem, currency: CurrencyCode = DEFAULT_CURRENCY): QuoteMathLineBreakdown {
  const breakdown = buildLineBreakdown(item, currency);

  return {
    subtotal: toDisplayNumber(breakdown.grossUnits),
    line_discount: toDisplayNumber(breakdown.discountUnits),
    taxable_subtotal: toDisplayNumber(breakdown.taxableUnits),
    tax_total: toDisplayNumber(breakdown.taxUnits),
    total: toDisplayNumber(breakdown.totalUnits),
    currency,
  };
}

export function calculateLineTotal(item: QuoteMathItem, currency: CurrencyCode = DEFAULT_CURRENCY) {
  return calculateLineBreakdown(item, currency).total;
}

function resolveOrderDiscountUnits(netBeforeOrderDiscountUnits: bigint, options: QuoteMathOptions) {
  const discountType = options.order_discount_type ?? "percentage";
  const discountValue = options.order_discount_value ?? options.order_discount ?? 0;
  ensureFiniteNumber(discountValue, "Order discount");

  if (discountValue < 0) {
    throw new Error("Order discount cannot be negative.");
  }

  if (discountType === "fixed") {
    return clampToRange(toUnits(discountValue, "Order discount"), ZERO, netBeforeOrderDiscountUnits);
  }

  const percentUnits = toUnits(discountValue, "Order discount");
  if (percentUnits > HUNDRED * MONEY_SCALE_FACTOR) {
    throw new Error("Order discount cannot exceed 100 percent.");
  }

  return clampToRange(applyPercentage(netBeforeOrderDiscountUnits, percentUnits), ZERO, netBeforeOrderDiscountUnits);
}

function resolveShippingUnits(options: QuoteMathOptions) {
  const shippingValue = options.shipping_total ?? options.shipping ?? 0;
  ensureFiniteNumber(shippingValue, "Shipping");

  if (shippingValue < 0) {
    throw new Error("Shipping cannot be negative.");
  }

  return toUnits(shippingValue, "Shipping");
}

function allocateOrderDiscount(netUnits: bigint[], orderDiscountUnits: bigint) {
  if (orderDiscountUnits === ZERO) {
    return netUnits.map(() => ZERO);
  }

  const totalNet = netUnits.reduce((sum, value) => sum + value, ZERO);
  if (totalNet === ZERO) {
    return netUnits.map(() => ZERO);
  }

  const allocations = netUnits.map((value, index) => {
    const numerator = value * orderDiscountUnits;
    return {
      index,
      allocation: numerator / totalNet,
      remainder: numerator % totalNet,
    };
  });

  const allocatedTotal = allocations.reduce((sum, entry) => sum + entry.allocation, ZERO);
  const remainderUnits = orderDiscountUnits - allocatedTotal;

  allocations.sort((left, right) => {
    if (left.remainder === right.remainder) {
      return left.index - right.index;
    }

    return right.remainder > left.remainder ? 1 : -1;
  });

  for (let index = 0; index < Number(remainderUnits); index += 1) {
    allocations[index].allocation += ONE;
  }

  return allocations
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.allocation);
}

export function calculateQuoteTotals(items: QuoteMathItem[], options: QuoteMathOptions = {}): QuoteMathTotals {
  const currency = resolveCurrency(options.currency, items);
  const lineUnits = items.map((item) => buildLineBreakdown(item, currency));

  const lineSubtotalUnits = lineUnits.reduce((sum, line) => sum + line.grossUnits, ZERO);
  const lineDiscountUnits = lineUnits.reduce((sum, line) => sum + line.discountUnits, ZERO);
  const netBeforeOrderDiscountUnits = lineUnits.reduce((sum, line) => sum + line.taxableUnits, ZERO);
  const shippingUnits = resolveShippingUnits(options);
  const orderDiscountUnits = resolveOrderDiscountUnits(netBeforeOrderDiscountUnits, options);
  const orderDiscountAllocations = allocateOrderDiscount(
    lineUnits.map((line) => line.taxableUnits),
    orderDiscountUnits,
  );

  const lineItems = lineUnits.map((line, index) => {
    const lineTaxableUnits = line.taxableUnits - orderDiscountAllocations[index];
    const taxUnits = applyPercentage(lineTaxableUnits, toUnits(items[index].tax_rate ?? 0, "Tax rate"));
    const totalUnits = lineTaxableUnits + taxUnits;

    return {
      subtotal: toDisplayNumber(line.grossUnits),
      line_discount: toDisplayNumber(line.discountUnits),
      taxable_subtotal: toDisplayNumber(lineTaxableUnits),
      tax_total: toDisplayNumber(taxUnits),
      total: toDisplayNumber(totalUnits),
      currency,
    };
  });

  const taxTotalUnits = lineUnits.reduce((sum, line, index) => {
    const lineTaxableUnits = line.taxableUnits - orderDiscountAllocations[index];
    return sum + applyPercentage(lineTaxableUnits, toUnits(items[index].tax_rate ?? 0, "Tax rate"));
  }, ZERO);
  const taxableSubtotalUnits = netBeforeOrderDiscountUnits - orderDiscountUnits;
  const grandTotalUnits = taxableSubtotalUnits + taxTotalUnits + shippingUnits;
  const discountTotalUnits = lineDiscountUnits + orderDiscountUnits;

  return {
    currency,
    subtotal: toDisplayNumber(lineSubtotalUnits),
    discount_total: toDisplayNumber(discountTotalUnits),
    taxable_subtotal: toDisplayNumber(taxableSubtotalUnits),
    shipping_total: toDisplayNumber(shippingUnits),
    tax_total: toDisplayNumber(taxTotalUnits),
    grand_total: toDisplayNumber(grandTotalUnits),
    line_discount_total: toDisplayNumber(lineDiscountUnits),
    order_discount_total: toDisplayNumber(orderDiscountUnits),
    line_items: lineItems,
  };
}
