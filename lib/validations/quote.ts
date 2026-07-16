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

export const quoteStatusSchema = z.enum(quoteStatuses);

const nonNegativeText = z.string().trim().optional().default("");

export const quoteLineItemSchema = z.object({
  product_id: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1, "Line name is required."),
  description: z.string().trim().optional().default(""),
  sku: z.string().trim().optional().default(""),
  quantity: z.coerce.number().positive("Quantity must be greater than zero."),
  unit: z.string().trim().min(1, "Unit is required."),
  unit_price: z.coerce.number().nonnegative("Unit price cannot be negative."),
  currency: z.enum(quoteCurrencies),
  discount_type: z.enum(quoteDiscountTypes).default("percentage"),
  discount_value: z.coerce.number().min(0, "Discount cannot be negative.").default(0),
  tax_rate: z.coerce.number().min(0, "Tax rate cannot be negative.").max(100, "Tax rate cannot exceed 100%.").default(20),
  sort_order: z.coerce.number().int().min(0).default(0),
}).superRefine((data, ctx) => {
  if (data.discount_type === "percentage" && data.discount_value > 100) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["discount_value"],
      message: "Percentage discount cannot exceed 100%.",
    });
  }
});

export const quoteMoneyLineSchema = quoteLineItemSchema;

export const quoteMoneySummarySchema = z.object({
  currency: z.enum(quoteCurrencies),
  shipping_total: z.coerce.number().min(0, "Shipping cannot be negative.").default(0),
  order_discount_type: z.enum(quoteDiscountTypes).default("percentage"),
  order_discount_value: z.coerce.number().min(0, "Order discount cannot be negative.").default(0),
});

export const quoteItemSchema = quoteMoneyLineSchema;

export const quoteFormSchema = z.object({
  lead_id: z.string().uuid().nullable().optional(),
  customer_id: z.string().uuid().nullable().optional(),
  quote_number: z.string().trim().min(1),
  issue_date: z.string().trim().min(1),
  valid_until: z.string().trim().min(1),
  status: quoteStatusSchema,
  currency: z.enum(quoteCurrencies),
  shipping_total: z.coerce.number().min(0, "Shipping cannot be negative.").default(0),
  order_discount_type: z.enum(quoteDiscountTypes).default("percentage"),
  order_discount_value: z.coerce.number().min(0, "Order discount cannot be negative.").default(0),
  notes: nonNegativeText,
  payment_terms: nonNegativeText,
  delivery_terms: nonNegativeText,
  items: z.array(quoteMoneyLineSchema).min(1, "Add at least one quote line."),
}).superRefine((data, ctx) => {
  if (!data.lead_id && !data.customer_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["lead_id"],
      message: "Select a lead or customer.",
    });
  }

  if (new Date(data.valid_until).getTime() < new Date(data.issue_date).getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["valid_until"],
      message: "Valid until must be on or after the issue date.",
    });
  }

  const mismatchedCurrency = data.items.find((item) => item.currency !== data.currency);
  if (mismatchedCurrency) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["items"],
      message: "All quote lines must use the selected quote currency.",
    });
  }

  if (data.order_discount_type === "percentage" && data.order_discount_value > 100) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["order_discount_value"],
      message: "Order discount cannot exceed 100%.",
    });
  }
});

export function isQuoteStatus(value: unknown): value is z.infer<typeof quoteStatusSchema> {
  return quoteStatusSchema.safeParse(value).success;
}

export type QuoteFormInput = z.infer<typeof quoteFormSchema>;
export type QuoteLineItemInput = z.infer<typeof quoteLineItemSchema>;
