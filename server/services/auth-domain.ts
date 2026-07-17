import { z } from "zod";

import {
  normalizeAuthEmailValue,
  normalizeAuthFullNameValue,
  normalizeAuthWorkspaceNameValue,
  normalizeAuthWorkspaceSlugInput,
  normalizeSafeRedirectPath,
} from "@/lib/validations/auth";

export type AuthFormField = "email" | "password" | "confirm_password" | "full_name" | "workspace_name" | "new_password";

export type AuthActionState = {
  success: boolean;
  message: string;
  fieldErrors: Partial<Record<AuthFormField, string>>;
};

export function createAuthActionState(
  message = "",
  fieldErrors: Partial<Record<AuthFormField, string>> = {},
  success = false,
): AuthActionState {
  return {
    success,
    message,
    fieldErrors,
  };
}

export function flattenAuthValidationError(error: z.ZodError) {
  const flattened = error.flatten().fieldErrors as Partial<Record<AuthFormField, string[]>>;
  const fieldErrors: Partial<Record<AuthFormField, string>> = {};

  for (const [key, messages] of Object.entries(flattened)) {
    const message = messages?.[0];
    if (!message) {
      continue;
    }

    if (key === "password" || key === "confirm_password" || key === "email" || key === "full_name" || key === "workspace_name" || key === "new_password") {
      fieldErrors[key] = message;
    }
  }

  return fieldErrors;
}

type SafeErrorLike = {
  code?: string;
  message?: string;
};

function hasErrorCode(error: unknown, code: string) {
  return typeof error === "object" && error !== null && "code" in error && String((error as SafeErrorLike).code ?? "") === code;
}

function hasErrorMessage(error: unknown, pattern: RegExp) {
  return error instanceof Error ? pattern.test(error.message) : false;
}

export function mapAuthProviderError(error: unknown, fallback: string) {
  if (hasErrorCode(error, "user_already_exists") || hasErrorMessage(error, /already registered|user already exists/i)) {
    return "An account with that email already exists. Try signing in or resetting your password.";
  }

  if (hasErrorCode(error, "invalid_credentials") || hasErrorMessage(error, /invalid login credentials|invalid email or password/i)) {
    return "Invalid email or password.";
  }

  if (hasErrorCode(error, "weak_password") || hasErrorMessage(error, /weak password/i)) {
    return "Choose a stronger password.";
  }

  if (hasErrorCode(error, "session_not_found") || hasErrorMessage(error, /session.*not found|expired/i)) {
    return "This reset link is invalid or expired.";
  }

  return fallback;
}

export function normalizeAuthLoginEmail(value: string) {
  return normalizeAuthEmailValue(value);
}

export function normalizeAuthRegisterFullName(value: string) {
  return normalizeAuthFullNameValue(value);
}

export function normalizeAuthRegisterWorkspaceName(value: string) {
  return normalizeAuthWorkspaceNameValue(value);
}

export function normalizeAuthWorkspaceSlug(value: string) {
  return normalizeAuthWorkspaceSlugInput(value);
}

export function buildAuthRedirectPath(value: unknown, fallback = "/dashboard") {
  return normalizeSafeRedirectPath(value, fallback);
}

export function getAuthPublicMessageFromError(error: unknown, fallback: string) {
  return mapAuthProviderError(error, fallback);
}
