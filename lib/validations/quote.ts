import { z } from "zod";

import { QUOTE_STATUSES } from "@/lib/constants";

const quoteStatuses = QUOTE_STATUSES.map((status) => status.value) as [
  string,
  ...string[],
];
const discountTypes = ["percentage", "fixed"] as const;

export const quoteItemSchema = z.object({
  product_id: z.string().trim().optional().default(""),
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
  quantity: z.coerce.number().positive(),
  unit_price: z.coerce.number().nonnegative(),
  unit: z.string().trim().optional().default("unit"),
  discount_type: z.enum(discountTypes).default("fixed"),
  discount_value: z.coerce.number().min(0).default(0),
  tax_rate: z.coerce.number().min(0).max(100).default(20),
  sort_order: z.coerce.number().int().min(0).default(0),
});

export const quoteFormSchema = z.object({
  lead_id: z.string().trim().uuid("Lead id must be a valid UUID.").nullable().optional(),
  quote_number: z.string().trim().min(1),
  issue_date: z.string().trim().min(1),
  expiry_date: z.string().trim().min(1),
  status: z.enum(quoteStatuses),
  currency: z.string().trim().length(3),
  customer_name: z.string().trim().min(2, "Customer name is required."),
  customer_company: z.string().trim().optional().default(""),
  customer_email: z.string().trim().email("Enter a valid email address.").optional().or(z.literal("")),
  customer_phone: z.string().trim().optional().default(""),
  notes: z.string().trim().optional().default(""),
  payment_terms: z.string().trim().optional().default(""),
  delivery_terms: z.string().trim().optional().default(""),
  discount_type: z.enum(discountTypes).default("fixed"),
  discount_value: z.coerce.number().min(0).default(0),
  shipping_total: z.coerce.number().min(0).default(0),
  items: z.array(quoteItemSchema).min(1),
});

export type QuoteFormInput = z.infer<typeof quoteFormSchema>;
