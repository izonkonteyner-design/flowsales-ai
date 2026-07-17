import { z } from "zod";

export const leadConversionSchema = z.object({
  lead_id: z.string().uuid("Lead id is required."),
});

export type LeadConversionInput = z.infer<typeof leadConversionSchema>;
