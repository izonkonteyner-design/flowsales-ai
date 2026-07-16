import { z } from "zod";

import { LEAD_STATUSES } from "@/lib/constants";

const leadStatuses = LEAD_STATUSES.map((status) => status.value) as [
  string,
  ...string[],
];

export const leadFormSchema = z.object({
  full_name: z.string().trim().min(2, "Full name is required."),
  company: z.string().trim().optional().default(""),
  email: z.string().trim().email("Enter a valid email address.").optional().or(z.literal("")),
  phone: z.string().trim().optional().default(""),
  city: z.string().trim().optional().default(""),
  source: z.string().trim().min(1, "Source is required."),
  status: z.enum(leadStatuses),
  estimated_value: z.coerce.number().nonnegative("Estimated value cannot be negative."),
  currency: z.string().trim().min(3).max(3),
  notes: z.string().trim().optional().default(""),
  assigned_to: z.string().trim().optional().default(""),
  next_follow_up_at: z.string().trim().optional().or(z.literal("")),
});

export type LeadFormInput = z.infer<typeof leadFormSchema>;

export const leadSearchSchema = z.object({
  query: z.string().trim().optional().default(""),
  status: z.enum(leadStatuses).optional(),
  sort: z.enum(["newest", "oldest", "value", "follow_up"]).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
});
