import { z } from "zod";

import { CURRENCY_CODES, QUOTE_DISCOUNT_TYPES, QUOTE_STATUSES } from "@/lib/constants";
import type { CurrencyCode, QuoteDiscountType } from "@/types/crm";

const quoteStatuses = QUOTE_STATUSES.map((status) => status.value) as [
  string,
  ...string[],
];

const quoteCurrencies = CURRENCY_CODES.map((currency) => currency.value) as [
  CurrencyCode,
  ...CurrencyCode[],
];

const quoteDiscountTypes = QUOTE_DISCOUNT_TYPES.map((discountType) => discountType.value) as [
  QuoteDiscountType,
  ...QuoteDiscountType[],
];

const nonNegativeText = z.string().trim().optional().default("");

export const quoteMoneyLineSchema = z.object({
  product_id: z.string().trim().min(1, "Product is required."),
  description: z.string().trim().min(1, "Description is required."),
  quantity: z.coerce.number().positive("Quantity must be greater than zero."),
  unit_price: z.coerce.number().nonnegative("Unit price cannot be negative."),
  discount: z.coerce.number().min(0, "Discount cannot be negative.").max(100, "Discount cannot exceed 100%.").default(0),
  discount_type: z.enum(quoteDiscountTypes).default("percentage"),
  discount_value: z.coerce.number().min(0, "Discount cannot be negative.").default(0),
  tax_rate: z.coerce.number().min(0, "Tax rate cannot be negative.").max(100, "Tax rate cannot exceed 100%.").default(20),
  currency: z.enum(quoteCurrencies).optional(),
});

export const quoteMoneySummarySchema = z.object({
  currency: z.enum(quoteCurrencies),
  shipping_total: z.coerce.number().min(0, "Shipping cannot be negative.").default(0),
  order_discount_type: z.enum(quoteDiscountTypes).default("percentage"),
  order_discount_value: z.coerce.number().min(0, "Order discount cannot be negative.").default(0),
});

export const quoteItemSchema = quoteMoneyLineSchema;

export const quoteFormSchema = z.object({
  lead_id: z.string().trim().min(1),
  quote_number: z.string().trim().min(1),
  issue_date: z.string().trim().min(1),
  expiry_date: z.string().trim().min(1),
  status: z.enum(quoteStatuses),
  currency: z.enum(quoteCurrencies),
  shipping_total: z.coerce.number().min(0, "Shipping cannot be negative.").default(0),
  order_discount_type: z.enum(quoteDiscountTypes).default("percentage"),
  order_discount_value: z.coerce.number().min(0, "Order discount cannot be negative.").default(0),
  notes: nonNegativeText,
  payment_terms: nonNegativeText,
  delivery_terms: nonNegativeText,
  items: z.array(quoteMoneyLineSchema).min(1, "Add at least one quote line."),
});
