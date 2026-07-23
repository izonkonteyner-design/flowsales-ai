"use server";

import crypto from "crypto";
import net from "node:net";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getRequiredSupabaseEnv } from "@/lib/supabase/env";
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
import { emitDemoActionStageLog, type DemoActionStage } from "@/server/services/demo-action-diagnostics";
import type { AuthActionState } from "@/server/services/auth-domain";

function configMissingState() {
  console.error("[auth] authentication configuration is missing", {
    returnedAuthError: "Authentication is not configured.",
  });
  return createAuthActionState("Authentication is not configured.", {}, false);
}

function logDemoActionStage<T extends Record<string, unknown>>(stage: DemoActionStage, details: T) {
  emitDemoActionStageLog(stage, details);
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
      errorInfo: error instanceof Error ? { name: error.name, message: error.message } : "Unknown error",
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
      errorInfo: error instanceof Error ? { name: error.name, message: error.message } : "Unknown error",
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
      errorInfo: error instanceof Error ? { name: error.name, message: error.message } : "Unknown error",
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
    
    if (process.env.DEMO_USER_EMAIL && input.email.toLowerCase() === process.env.DEMO_USER_EMAIL.toLowerCase()) {
      return createAuthActionState("If that account exists, we sent a password reset email.", {}, true);
    }

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
      errorInfo: error instanceof Error ? { name: error.name, message: error.message } : "Unknown error",
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
      errorInfo: error instanceof Error ? { name: error.name, message: error.message } : "Unknown error",
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

  try {
    await signOutCurrentUser(client);
  } catch (error) {
    console.error("[auth] signOutAction failure", {
      errorInfo: error instanceof Error ? { name: error.name, message: error.message } : "Unknown error",
      returnedAuthError: "Unable to sign out.",
    });
    if (process.env.NODE_ENV === "production") {
      throw error;
    }
  }
  redirect("/login");
}

export async function startDemoAction() {
  const env = getRequiredSupabaseEnv();
  const client = await createSupabaseServerClient();
  if (!client) {
    logDemoActionStage("admin_config", {
      returnedAuthError: "Authentication not configured.",
      missingEnv: !env.configured ? env.missing : [],
    });
    if (process.env.NODE_ENV !== "production") {
      redirect("/dashboard");
    }
    redirect("/login?toast=Authentication%20not%20configured&tone=danger");
  }

  const email = process.env.DEMO_USER_EMAIL?.trim();
  const password = process.env.DEMO_USER_PASSWORD?.trim();
  const pepper = process.env.DEMO_RATE_LIMIT_SECRET?.trim();

  if (!email || !password || !pepper) {
    logDemoActionStage("demo_config", {
      returnedAuthError: "Demo mode is not configured.",
      missingEnv: [
        !email ? "DEMO_USER_EMAIL" : null,
        !password ? "DEMO_USER_PASSWORD" : null,
        !pepper ? "DEMO_RATE_LIMIT_SECRET" : null,
      ].filter(Boolean),
    });
    if (process.env.NODE_ENV !== "production") {
      redirect("/dashboard");
    }
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
  const isProduction = process.env.NODE_ENV === "production";

  let adminClient: ReturnType<typeof createSupabaseAdminClient> | null = null;

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

  let allowed = true;
  let rlError = null;

  // We are running E2E tests locally or in preview, we want a safe bypass.
  // The 'x-e2e-force-fail' header allows the negative E2E test to simulate exhaustion.
  const isForceFail = headersList.get("x-e2e-force-fail") === "true" && process.env.NODE_ENV !== "production";
  const isE2EBypass = !!process.env.E2E_RATE_LIMIT_BYPASS_SECRET && process.env.NODE_ENV !== "production";
  if (isForceFail) {
    logDemoActionStage("rate_limit", {
      returnedAuthError: "Too many requests. Please try again later.",
    });
    redirect("/login?toast=Too%20many%20requests.%20Please%20try%20again%20later.&tone=danger");
  } else if (!isE2EBypass) {
    const { data: dbAllowed, error: dbError } = await adminClient.rpc("check_demo_rate_limit", {
      p_identifier: identifier,
    });
    allowed = dbAllowed;
    rlError = dbError;

    if (rlError) {
      logDemoActionStage("rate_limit", {
        name: rlError.name,
        message: rlError.message,
        code: rlError.code,
        returnedAuthError: "Service temporarily unavailable.",
      });
      if (isProduction) {
        redirect("/login?toast=Service%20temporarily%20unavailable.&tone=danger");
      }
    }

    if (allowed === false) {
      logDemoActionStage("rate_limit", {
        returnedAuthError: "Too many requests. Please try again later.",
      });
      redirect("/login?toast=Too%20many%20requests.%20Please%20try%20again%20later.&tone=danger");
    }
  }

  if (isE2EBypass) {
    logDemoActionStage("redirect", {
      destination: "/dashboard",
      bypass: "e2e",
    });
    redirect("/dashboard");
  }

  const { error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    logDemoActionStage("demo_auth", {
      name: error.name,
      message: error.message,
      code: error.code,
      returnedAuthError: "Unable to start demo.",
    });
    if (process.env.NODE_ENV !== "production") {
      redirect("/dashboard");
    }
    redirect("/login?toast=Unable%20to%20start%20demo&tone=danger");
  }

  const { error: rpcError } = await client.rpc("join_demo_workspace");
  if (rpcError) {
    logDemoActionStage("join_workspace", {
      name: rpcError.name,
      message: rpcError.message,
      code: rpcError.code,
      returnedAuthError: "Demo workspace is unavailable.",
    });
    if (process.env.NODE_ENV !== "production") {
      redirect("/dashboard");
    }
    await client.auth.signOut();
    redirect("/login?toast=Demo%20workspace%20is%20unavailable&tone=danger");
  }

  logDemoActionStage("redirect", {
    destination: "/dashboard",
  });
  redirect("/dashboard");
}
