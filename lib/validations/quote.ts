import { z } from "zod";

import { QUOTE_STATUSES } from "@/lib/constants";

const quoteStatuses = QUOTE_STATUSES.map((status) => status.value) as [
  string,
  ...string[],
];

export const quoteItemSchema = z.object({
  product_id: z.string().trim().min(1),
  description: z.string().trim().min(1),
  quantity: z.coerce.number().positive(),
  unit_price: z.coerce.number().nonnegative(),
  discount: z.coerce.number().min(0).max(100).default(0),
  tax_rate: z.coerce.number().min(0).max(100).default(20),
});

export const quoteFormSchema = z.object({
  lead_id: z.string().trim().min(1),
  quote_number: z.string().trim().min(1),
  issue_date: z.string().trim().min(1),
  expiry_date: z.string().trim().min(1),
  status: z.enum(quoteStatuses),
  currency: z.string().trim().length(3),
  notes: z.string().trim().optional().default(""),
  payment_terms: z.string().trim().optional().default(""),
  delivery_terms: z.string().trim().optional().default(""),
  items: z.array(quoteItemSchema).min(1),
});
