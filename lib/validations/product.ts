import { z } from "zod";

export const productFormSchema = z.object({
  sku: z.string().trim().min(2, "SKU is required."),
  name: z.string().trim().min(2),
  category: z.string().trim().min(2),
  description: z.string().trim().min(10),
  unit_price: z.coerce.number().nonnegative("Unit price cannot be negative."),
  currency: z.string().trim().length(3),
  tax_rate: z.coerce.number().min(0).max(100),
  unit: z.string().trim().min(1),
  active: z.preprocess((value) => value === "true" || value === true, z.boolean()).default(true),
  specifications: z.array(z.string().trim()).default([]),
});

export const productSearchSchema = z.object({
  query: z.string().trim().optional().default(""),
  active: z.enum(["all", "active", "inactive"]).optional().default("all"),
  sort: z.enum(["name", "price", "newest"]).optional().default("name"),
});
