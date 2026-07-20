import { z } from "zod";

export const updateProfileFormSchema = z.object({
  full_name: z.string().min(2, "Name must be at least 2 characters").max(64, "Name is too long").trim(),
});

export type UpdateProfileFormInput = z.infer<typeof updateProfileFormSchema>;
