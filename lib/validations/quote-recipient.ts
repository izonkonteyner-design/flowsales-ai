import { z } from "zod";

export const quoteRecipientSchema = z
  .object({
    lead_id: z.string().uuid().nullable().optional(),
    customer_id: z.string().uuid().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.lead_id && !data.customer_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lead_id"],
        message: "Select a lead or customer.",
      });
    }
  });

export const quoteRecipientTypeSchema = z.enum(["lead", "customer", "none"]);

export type QuoteRecipientInput = z.infer<typeof quoteRecipientSchema>;
export type QuoteRecipientType = z.infer<typeof quoteRecipientTypeSchema>;
