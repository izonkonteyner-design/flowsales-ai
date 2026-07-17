import { z } from "zod";

const controlCharacters = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const safeRedirectPattern = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

function hasControlCharacters(value: string) {
  return controlCharacters.test(value);
}

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeText(value: string) {
  const collapsed = collapseWhitespace(value);
  return collapsed.length > 0 ? collapsed : null;
}

function normalizeEmail(value: string) {
  const normalized = collapseWhitespace(value).toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function normalizeWorkspaceSlugValue(value: string) {
  const normalized = collapseWhitespace(value).toLowerCase();
  const slug = normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "workspace";
}

export function normalizeAuthFullNameValue(value: string) {
  return normalizeText(value);
}

export function normalizeAuthWorkspaceNameValue(value: string) {
  return normalizeText(value);
}

export function normalizeAuthEmailValue(value: string) {
  return normalizeEmail(value);
}

export function normalizeAuthWorkspaceSlugInput(value: string) {
  return normalizeWorkspaceSlugValue(value);
}

export function normalizeSafeRedirectPath(value: unknown, fallback = "/dashboard") {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  if (trimmed.startsWith("//")) {
    return fallback;
  }

  if (!trimmed.startsWith("/")) {
    return fallback;
  }

  if (trimmed.includes("\\") || safeRedirectPattern.test(trimmed) || hasControlCharacters(trimmed)) {
    return fallback;
  }

  return trimmed;
}

export const safeRedirectPathSchema = z
  .string()
  .optional()
  .default("")
  .transform((value) => normalizeSafeRedirectPath(value));

const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required.")
  .max(254, "Email is too long.")
  .email("Enter a valid email address.")
  .transform((value) => value.toLowerCase());

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(128, "Password is too long.")
  .refine((value) => !hasControlCharacters(value), {
    message: "Password contains unsupported characters.",
  });

const nameSchema = z
  .string()
  .trim()
  .min(2, "Full name is required.")
  .max(120, "Full name is too long.")
  .transform((value) => collapseWhitespace(value));

const workspaceNameSchema = z
  .string()
  .trim()
  .min(2, "Workspace name is required.")
  .max(120, "Workspace name is too long.")
  .transform((value) => collapseWhitespace(value));

export const loginFormSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  next: safeRedirectPathSchema,
});

export const registerFormSchema = z
  .object({
    full_name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirm_password: passwordSchema,
    workspace_name: workspaceNameSchema,
    next: safeRedirectPathSchema,
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirm_password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirm_password"],
        message: "Passwords must match.",
      });
    }
  });

export const bootstrapWorkspaceFormSchema = z.object({
  full_name: nameSchema,
  workspace_name: workspaceNameSchema,
  next: safeRedirectPathSchema,
});

export const forgotPasswordFormSchema = z.object({
  email: emailSchema,
  next: safeRedirectPathSchema,
});

export const resetPasswordFormSchema = z
  .object({
    new_password: passwordSchema,
    confirm_password: passwordSchema,
    next: safeRedirectPathSchema,
  })
  .superRefine((data, ctx) => {
    if (data.new_password !== data.confirm_password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirm_password"],
        message: "Passwords must match.",
      });
    }
  });

export type LoginFormInput = z.output<typeof loginFormSchema>;
export type RegisterFormInput = z.output<typeof registerFormSchema>;
export type BootstrapWorkspaceFormInput = z.output<typeof bootstrapWorkspaceFormSchema>;
export type ForgotPasswordFormInput = z.output<typeof forgotPasswordFormSchema>;
export type ResetPasswordFormInput = z.output<typeof resetPasswordFormSchema>;

