import { z } from "zod";

export const taskFormSchema = z.object({
  title: z.string().trim().min(2),
  lead_id: z.string().trim().optional().or(z.literal("")),
  due_at: z.string().trim().min(1),
  priority: z.enum(["low", "medium", "high"]),
  assigned_to: z.string().trim().optional().default(""),
});
