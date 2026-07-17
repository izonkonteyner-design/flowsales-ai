import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required.")
  .max(254, "Email is too long.")
  .email("Enter a valid email address.")
  .transform((value) => value.toLowerCase());

const roleSchema = z.enum(["owner", "admin", "sales", "viewer"]);

const uuidSchema = z.string().uuid("Enter a valid UUID.");

function normalizeQuery(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().replace(/\s+/g, " ");
}

export const inviteMemberSchema = z.object({
  email: emailSchema,
  role: roleSchema,
  next: z.string().optional().default("/settings/members"),
});

export const updateMemberRoleSchema = z.object({
  member_id: uuidSchema,
  role: roleSchema,
  next: z.string().optional().default("/settings/members"),
});

export const removeMemberSchema = z.object({
  member_id: uuidSchema,
  next: z.string().optional().default("/settings/members"),
});

export const memberSearchSchema = z.object({
  query: z.string().optional().default("").transform(normalizeQuery),
});

export type InviteMemberInput = z.output<typeof inviteMemberSchema>;
export type UpdateMemberRoleInput = z.output<typeof updateMemberRoleSchema>;
export type RemoveMemberInput = z.output<typeof removeMemberSchema>;
export type MemberSearchInput = z.output<typeof memberSearchSchema>;
export type WorkspaceMemberRole = z.output<typeof roleSchema>;

export function normalizeMemberEmailValue(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeMemberSearchValue(value: string) {
  return normalizeQuery(value);
}

