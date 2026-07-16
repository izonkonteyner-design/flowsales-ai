import { z } from "zod";

import { LEAD_STATUSES } from "@/lib/constants";

const leadStatuses = LEAD_STATUSES.map((status) => status.value) as [
  string,
  ...string[],
];

const optionalText = z.string().trim().optional().default("");
const optionalUrlText = z.preprocess((value) => (value == null ? "" : value), z.string().trim().optional().default(""));

export const leadFormSchema = z.object({
  full_name: z.string().trim().min(2, "Full name is required."),
  company: optionalText,
  email: z.string().trim().email("Enter a valid email address.").optional().or(z.literal("")),
  phone: optionalText,
  city: optionalText,
  source: z.string().trim().min(1, "Source is required."),
  status: z.enum(leadStatuses),
  estimated_value: z.preprocess(
    (value) => (value === "" || value == null ? Number.NaN : value),
    z.coerce.number().nonnegative("Estimated value cannot be negative."),
  ),
  currency: z.string().trim().min(3).max(3),
  notes: optionalText,
  assigned_to: optionalText,
  next_follow_up_at: optionalUrlText,
});

export type LeadFormInput = z.infer<typeof leadFormSchema>;

export const leadSearchSchema = z.object({
  query: z.string().trim().optional().default(""),
  status: z.enum(leadStatuses).optional(),
  source: z.string().trim().optional().default(""),
  assignedTo: z.string().trim().optional().default(""),
  sort: z.enum(["newest", "oldest", "value", "follow_up"]).optional(),
  view: z.enum(["table", "pipeline"]).optional().default("table"),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).optional().default(8),
});

export const leadStatusChangeSchema = z.object({
  lead_id: z.string().uuid("Lead id is required."),
  status: z.enum(leadStatuses),
  redirect_to: z.string().optional(),
});

export const leadNoteSchema = z.object({
  lead_id: z.string().uuid("Lead id is required."),
  note: z.string().trim().min(2, "Note is required."),
  redirect_to: z.string().optional(),
});

export const leadFollowUpSchema = z.object({
  lead_id: z.string().uuid("Lead id is required."),
  next_follow_up_at: z.string().trim().min(1, "Follow-up date is required."),
  redirect_to: z.string().optional(),
});

export const leadTaskSchema = z.object({
  lead_id: z.string().uuid("Lead id is required."),
  title: z.string().trim().min(2, "Task title is required."),
  due_at: z.string().trim().min(1, "Due date is required."),
  priority: z.enum(["low", "medium", "high"]),
  assigned_to: z.string().trim().optional().default(""),
  redirect_to: z.string().optional(),
});
