"use server";

import crypto from "crypto";
import net from "node:net";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
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

  let redirectPath = "";

  try {
    const input = parseAuthLoginInput(formData);
    await loginWithPassword(client, input);
    redirectPath = buildAuthRedirectPath(input.next);
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

  redirect(redirectPath);
}

export async function registerAction(_: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const client = await createSupabaseServerClient();
  if (!client) {
    return configMissingState();
  }

  let redirectPath = "";
  let confirmationState: AuthActionState | null = null;

  try {
    const input = parseAuthRegisterInput(formData);
    const hasSession = await registerWithPassword(client, input);
    if (hasSession) {
      redirectPath = buildAuthRedirectPath(input.next);
    } else {
      confirmationState = createAuthActionState("Check your email to confirm your account.", {}, true);
    }
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

  if (redirectPath) {
    redirect(redirectPath);
  }

  return confirmationState ?? createAuthActionState("Check your email to confirm your account.", {}, true);
}

export async function bootstrapWorkspaceAction(_: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const client = await createSupabaseServerClient();
  if (!client) {
    return configMissingState();
  }

  let redirectPath = "";

  try {
    const input = parseAuthBootstrapInput(formData);
    await bootstrapWorkspaceForCurrentUser(client, input);
    redirectPath = buildAuthRedirectPath(input.next);
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

  redirect(redirectPath);
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

  let redirectPath = "";

  try {
    const input = parseAuthResetPasswordInput(formData);
    await updatePassword(client, input);
    redirectPath = buildAuthRedirectPath(input.next);
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

  redirect(redirectPath);
}

export async function signOutAction() {
  const client = await createSupabaseServerClient();
  if (!client) {
    redirect("/login");
  }

  await signOutCurrentUser(client);
  redirect("/login");
}

export async function startDemoAction() {
  const client = await createSupabaseServerClient();
  if (!client) {
    redirect("/login?toast=Authentication%20not%20configured&tone=danger");
  }

  const email = process.env.DEMO_USER_EMAIL;
  const password = process.env.DEMO_USER_PASSWORD;
  const pepper = process.env.DEMO_RATE_LIMIT_SECRET;

  if (!email || !password || !pepper) {
    redirect("/login?toast=Demo%20mode%20is%20not%20configured&tone=danger");
  }

  const headersList = await headers();
  let rawIp = 
    headersList.get("x-vercel-forwarded-for")?.split(",")[0].trim() ||
    headersList.get("x-forwarded-for")?.split(",")[0].trim() ||
    headersList.get("x-real-ip")?.trim();
  
  if (!rawIp || !net.isIP(rawIp)) {
    rawIp = "fallback-demo-bucket";
  }

  const identifier = crypto.createHash("sha256").update(`${rawIp}:${pepper}`).digest("hex");

  let adminClient;
  try {
    adminClient = createSupabaseAdminClient();
  } catch (error) {
    console.error("[auth] admin client configuration failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Configuration failed",
    });
  }

  if (!adminClient) {
    redirect("/login?toast=Service%20temporarily%20unavailable.&tone=danger");
  }

  const { data: allowed, error: rlError } = await adminClient.rpc("check_demo_rate_limit", {
    p_identifier: identifier,
  });
  
  if (rlError) {
    console.error("[auth] check_demo_rate_limit failed", { name: rlError.name, message: rlError.message, code: rlError.code });
    redirect("/login?toast=Service%20temporarily%20unavailable.&tone=danger");
  } else if (allowed === false) {
    redirect("/login?toast=Too%20many%20requests.%20Please%20try%20again%20later.&tone=danger");
  }

  const { error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error("[auth] demo login failed", { name: error.name, message: error.message, code: error.code });
    redirect("/login?toast=Unable%20to%20start%20demo&tone=danger");
  }

  const { error: rpcError } = await client.rpc("join_demo_workspace");
  if (rpcError) {
    console.error("[auth] join_demo_workspace failed", { name: rpcError.name, message: rpcError.message, code: rpcError.code });
    await client.auth.signOut();
    redirect("/login?toast=Demo%20workspace%20is%20unavailable&tone=danger");
  }

  redirect("/dashboard");
}
