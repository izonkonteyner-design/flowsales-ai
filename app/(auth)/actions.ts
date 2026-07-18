"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  parseAuthBootstrapInput,
  parseAuthForgotPasswordInput,
  parseAuthLoginInput,
  parseAuthRegisterInput,
  parseAuthResetPasswordInput,
  bootstrapWorkspaceForCurrentUser,
  loginWithPassword,
  registerWithPassword,
  requestPasswordReset,
  signOutCurrentUser,
  updatePassword,
  toAuthActionStateFromError,
  toAuthValidationActionState,
} from "@/server/services/auth";
import { buildAuthRedirectPath, createAuthActionState } from "@/server/services/auth-domain";
import type { AuthActionState } from "@/server/services/auth-domain";

function configMissingState() {
  console.error("[auth] authentication configuration is missing", {
    returnedAuthError: "Authentication is not configured.",
  });
  return createAuthActionState("Authentication is not configured.", {}, false);
}

export async function loginAction(_: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const client = await createSupabaseServerClient();
  if (!client) {
    return configMissingState();
  }

  try {
    const input = parseAuthLoginInput(formData);
    await loginWithPassword(client, input);
    redirect(buildAuthRedirectPath(input.next));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return toAuthValidationActionState(error);
    }
    const actionState = toAuthActionStateFromError(error, "Unable to sign in.");
    console.error("[auth] loginAction failure", {
      rawError: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error,
      returnedAuthError: actionState.message,
      fieldErrors: actionState.fieldErrors,
    });
    return actionState;
  }
}

export async function registerAction(_: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const client = await createSupabaseServerClient();
  if (!client) {
    return configMissingState();
  }

  try {
    const input = parseAuthRegisterInput(formData);
    const hasSession = await registerWithPassword(client, input);
    if (hasSession) {
      redirect(buildAuthRedirectPath(input.next));
    }

    return createAuthActionState("Check your email to confirm your account.", {}, true);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return toAuthValidationActionState(error);
    }
    const actionState = toAuthActionStateFromError(error, "Unable to create your account.");
    console.error("[auth] registerAction failure", {
      rawError: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error,
      returnedAuthError: actionState.message,
      fieldErrors: actionState.fieldErrors,
    });
    return actionState;
  }
}

export async function bootstrapWorkspaceAction(_: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const client = await createSupabaseServerClient();
  if (!client) {
    return configMissingState();
  }

  try {
    const input = parseAuthBootstrapInput(formData);
    await bootstrapWorkspaceForCurrentUser(client, input);
    redirect(buildAuthRedirectPath(input.next));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return toAuthValidationActionState(error);
    }
    const actionState = toAuthActionStateFromError(error, "Unable to complete workspace setup.");
    console.error("[auth] bootstrapWorkspaceAction failure", {
      rawError: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error,
      returnedAuthError: actionState.message,
      fieldErrors: actionState.fieldErrors,
    });
    return actionState;
  }
}

export async function forgotPasswordAction(_: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const client = await createSupabaseServerClient();
  if (!client) {
    return configMissingState();
  }

  try {
    const input = parseAuthForgotPasswordInput(formData);
    const sent = await requestPasswordReset(client, input);
    if (!sent) {
      console.error("[auth] forgotPasswordAction failure", {
        returnedAuthError: "Unable to send the reset email right now.",
      });
      return createAuthActionState("Unable to send the reset email right now.", {}, false);
    }

    return createAuthActionState("If that account exists, we sent a password reset email.", {}, true);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return toAuthValidationActionState(error);
    }
    const actionState = toAuthActionStateFromError(error, "Unable to send the reset email.");
    console.error("[auth] forgotPasswordAction failure", {
      rawError: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error,
      returnedAuthError: actionState.message,
      fieldErrors: actionState.fieldErrors,
    });
    return actionState;
  }
}

export async function resetPasswordAction(_: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const client = await createSupabaseServerClient();
  if (!client) {
    return configMissingState();
  }

  try {
    const input = parseAuthResetPasswordInput(formData);
    await updatePassword(client, input);
    redirect(buildAuthRedirectPath(input.next));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return toAuthValidationActionState(error);
    }
    const actionState = toAuthActionStateFromError(error, "Unable to update your password.");
    console.error("[auth] resetPasswordAction failure", {
      rawError: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error,
      returnedAuthError: actionState.message,
      fieldErrors: actionState.fieldErrors,
    });
    return actionState;
  }
}

export async function signOutAction() {
  const client = await createSupabaseServerClient();
  if (!client) {
    redirect("/login");
  }

  await signOutCurrentUser(client);
  redirect("/login");
}
