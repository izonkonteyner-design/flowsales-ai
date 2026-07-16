import { CURRENCY_CODES, QUOTE_DISCOUNT_TYPES } from "@/lib/constants";
import type { CurrencyCode, QuoteDiscountType } from "@/types/crm";

import {
  calculateQuoteTotals,
  type QuoteMathItem,
  type QuoteMathOptions,
  type QuoteMathTotals,
} from "@/server/services/quote-math";

const currencySet = new Set(CURRENCY_CODES.map((currency) => currency.value));
const discountTypeSet = new Set(QUOTE_DISCOUNT_TYPES.map((discountType) => discountType.value));

function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === "string" && currencySet.has(value as CurrencyCode);
}

function isDiscountType(value: unknown): value is QuoteDiscountType {
  return typeof value === "string" && discountTypeSet.has(value as QuoteDiscountType);
}

export function normalizeQuoteCurrency(value: unknown, fallback: CurrencyCode = "TRY"): CurrencyCode {
  return isCurrencyCode(value) ? value : fallback;
}

export function normalizeQuoteDiscountType(value: unknown, fallback: QuoteDiscountType = "percentage"): QuoteDiscountType {
  return isDiscountType(value) ? value : fallback;
}

export function normalizeQuoteMathItem(
  item: Partial<QuoteMathItem> & {
    unitPrice?: number;
    discountType?: QuoteDiscountType;
    discountValue?: number;
    taxRate?: number;
    currency?: unknown;
  },
  fallbackCurrency: CurrencyCode = "TRY",
): QuoteMathItem {
  return {
    quantity: typeof item.quantity === "number" ? item.quantity : 0,
    unit_price: typeof item.unit_price === "number" ? item.unit_price : typeof item.unitPrice === "number" ? item.unitPrice : 0,
    discount:
      typeof item.discount === "number"
        ? item.discount
        : typeof item.discountValue === "number" && item.discountType !== "fixed"
          ? item.discountValue
          : 0,
    discount_type: normalizeQuoteDiscountType(item.discount_type ?? item.discountType ?? "percentage"),
    discount_value:
      typeof item.discount_value === "number"
        ? item.discount_value
        : typeof item.discountValue === "number"
          ? item.discountValue
          : undefined,
    tax_rate: typeof item.tax_rate === "number" ? item.tax_rate : typeof item.taxRate === "number" ? item.taxRate : 0,
    currency: normalizeQuoteCurrency(item.currency, fallbackCurrency),
  };
}

export function normalizeQuoteMathItems(items: Array<Partial<QuoteMathItem> & { unitPrice?: number }>, fallbackCurrency: CurrencyCode = "TRY") {
  return items.map((item) => normalizeQuoteMathItem(item, fallbackCurrency));
}

export function assertQuoteCurrencyConsistency(items: QuoteMathItem[], currency?: CurrencyCode) {
  const resolvedCurrency = normalizeQuoteCurrency(currency ?? items.find((item) => item.currency)?.currency, "TRY");

  for (const item of items) {
    if (item.currency && item.currency !== resolvedCurrency) {
      throw new Error("All quote items must use the same currency.");
    }
  }

  return resolvedCurrency;
}

export function calculateNormalizedQuoteTotals(
  items: Array<Partial<QuoteMathItem> & { unitPrice?: number }>,
  options: QuoteMathOptions & { currency?: unknown } = {},
): QuoteMathTotals {
  const normalizedItems = normalizeQuoteMathItems(items, normalizeQuoteCurrency(options.currency, "TRY"));
  const currency = assertQuoteCurrencyConsistency(normalizedItems, normalizeQuoteCurrency(options.currency, "TRY"));
  return calculateQuoteTotals(normalizedItems, { ...options, currency });
}
