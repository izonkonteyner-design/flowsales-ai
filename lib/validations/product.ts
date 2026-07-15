import { z } from "zod";

export const productFormSchema = z.object({
  name: z.string().trim().min(2),
  category: z.string().trim().min(2),
  description: z.string().trim().min(10),
  base_price: z.coerce.number().nonnegative(),
  currency: z.string().trim().length(3),
  tax_rate: z.coerce.number().min(0).max(100),
  unit: z.string().trim().min(1),
  active: z.coerce.boolean().default(true),
  specifications: z.array(z.string().trim()).default([]),
});
