import { z } from "zod";

const tokenPattern = /^[A-Za-z0-9_-]{32,256}$/;

export const invitationTokenSchema = z
  .string()
  .trim()
  .min(32, "Invitation token is required.")
  .max(256, "Invitation token is too long.")
  .refine((value) => tokenPattern.test(value), {
    message: "Invitation token is invalid.",
  });

export const invitationLookupSchema = z.object({
  token: invitationTokenSchema,
});

export const invitationAcceptanceSchema = z.object({
  token: invitationTokenSchema,
  next: z.string().optional().default("/settings/members"),
});

export type InvitationLookupInput = z.output<typeof invitationLookupSchema>;
export type InvitationAcceptanceInput = z.output<typeof invitationAcceptanceSchema>;

