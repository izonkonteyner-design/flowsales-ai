import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import { bootstrapWorkspaceFormSchema, forgotPasswordFormSchema, loginFormSchema, registerFormSchema, resetPasswordFormSchema, type BootstrapWorkspaceFormInput, type ForgotPasswordFormInput, type LoginFormInput, type RegisterFormInput, type ResetPasswordFormInput } from "@/lib/validations/auth";
import { createAuthActionState, flattenAuthValidationError, getAuthPublicMessageFromError } from "@/server/services/auth-domain";
import { getSiteUrl } from "@/server/env";
import type { Organization } from "@/types/crm";
import type { WorkspaceRole } from "@/server/services/workspace-context";

export type SupabaseServerClient = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

export type AuthRouteState =
  | {
      mode: "unconfigured";
    }
  | {
      mode: "signed-out";
    }
  | {
      mode: "bootstrap-required";
      userId: string;
      userEmail: string | null;
      fullName: string | null;
      workspaceName: string | null;
    }
  | {
      mode: "authenticated";
      userId: string;
      userEmail: string | null;
      organization: Organization;
      role: WorkspaceRole;
    }
  | {
      mode: "error";
      message: string;
    };

function normalizeSessionWorkspaceName(value: unknown) {
  const parsed = bootstrapWorkspaceFormSchema.shape.workspace_name.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function normalizeSessionFullName(value: unknown) {
  const parsed = bootstrapWorkspaceFormSchema.shape.full_name.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function getSupabaseOrigin() {
  return getSiteUrl();
}

function serializeAuthError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return error;
}

function logAuthDiagnostic(event: string, details: Record<string, unknown>) {
  console.error(`[auth] ${event}`, details);
}

export async function getAuthRouteState(client?: SupabaseServerClient): Promise<AuthRouteState> {
  if (!hasSupabaseConfig()) {
    return { mode: "unconfigured" };
  }

  const supabase = client ?? (await createSupabaseServerClient());
  if (!supabase) {
    return { mode: "error", message: "Unable to initialize authentication." };
  }

  const { data: userResponse, error: userError } = await supabase.auth.getUser();
  if (userError) {
    logAuthDiagnostic("getAuthRouteState user lookup error", {
      supabaseError: serializeAuthError(userError),
      returnedAuthError: "Unable to verify your session.",
    });
    return { mode: "error", message: "Unable to verify your session." };
  }

  const user = userResponse.user;
  if (!user) {
    return { mode: "signed-out" };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    logAuthDiagnostic("getAuthRouteState workspace membership lookup error", {
      supabaseError: serializeAuthError(membershipError),
      returnedAuthError: "Unable to load your workspace.",
      userId: user.id,
    });
    return { mode: "error", message: "Unable to load your workspace." };
  }

  if (!membership) {
    return {
      mode: "bootstrap-required",
      userId: user.id,
      userEmail: user.email ?? null,
      fullName: normalizeSessionFullName(user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.user_metadata?.display_name ?? user.email),
      workspaceName: normalizeSessionWorkspaceName(user.user_metadata?.workspace_name ?? user.user_metadata?.workspace ?? ""),
    };
  }

  const { data: organization, error: orgError } = await supabase
    .from("organizations")
    .select(
      "id, name, slug, currency, onboarding_completed_at, industry, logo_url, logo_path, legal_name, website, email, phone, secondary_phone, address_line_1, address_line_2, district, city, postal_code, country, tax_office, tax_number, trade_registry_number, mersis_number, bank_name, bank_branch, iban, account_holder, default_tax_rate, default_payment_terms, default_delivery_terms, default_quote_notes, default_quote_validity_days, quote_footer_text, signature_name, signature_title, company_slogan",
    )
    .eq("id", membership.organization_id)
    .maybeSingle();

  if (orgError || !organization) {
    logAuthDiagnostic("getAuthRouteState organization profile lookup error", {
      supabaseError: serializeAuthError(orgError),
      returnedAuthError: "Unable to load your workspace.",
      organizationId: membership.organization_id,
      userId: user.id,
    });
    return { mode: "error", message: "Unable to load your workspace." };
  }

  return {
    mode: "authenticated",
    userId: user.id,
    userEmail: user.email ?? null,
    organization: organization as Organization,
    role: membership.role as WorkspaceRole,
  };
}

export async function bootstrapWorkspaceForCurrentUser(
  client: SupabaseServerClient,
  input: BootstrapWorkspaceFormInput,
) {
  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser();

  if (userError || !user) {
    logAuthDiagnostic("bootstrapWorkspaceForCurrentUser auth error", {
      supabaseError: serializeAuthError(userError),
      returnedAuthError: "You must be signed in to complete workspace setup.",
    });
    throw new Error("You must be signed in to complete workspace setup.");
  }

  const { error } = await client.rpc("bootstrap_workspace", {
    workspace_name: input.workspace_name,
    full_name: input.full_name,
  });

  if (error) {
    logAuthDiagnostic("bootstrapWorkspaceForCurrentUser workspace bootstrap error", {
      supabaseError: serializeAuthError(error),
      returnedAuthError: error.message || "Unable to complete workspace setup.",
    });
    throw new Error(error.message || "Unable to complete workspace setup.");
  }

  return user;
}

export async function signOutCurrentUser(client: SupabaseServerClient) {
  const { error } = await client.auth.signOut();
  if (error) {
    throw new Error(error.message || "Unable to sign out.");
  }
}

export async function loginWithPassword(client: SupabaseServerClient, input: LoginFormInput) {
  const { error } = await client.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });

  if (error) {
    const returnedAuthError = getAuthPublicMessageFromError(error, "Invalid email or password.");
    logAuthDiagnostic("loginWithPassword auth error", {
      supabaseError: serializeAuthError(error),
      returnedAuthError,
    });
    throw new Error(returnedAuthError);
  }

  const routeState = await getAuthRouteState(client);
  if (routeState.mode === "error") {
    logAuthDiagnostic("loginWithPassword route state error", {
      returnedAuthError: routeState.message,
    });
  }

  return routeState;
}

export async function registerWithPassword(client: SupabaseServerClient, input: RegisterFormInput) {
  const { data, error } = await client.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        full_name: input.full_name,
        workspace_name: input.workspace_name,
      },
      emailRedirectTo: `${getSupabaseOrigin()}/auth/callback?next=${encodeURIComponent(input.next || "/dashboard")}`,
    },
  });

  if (error) {
    const returnedAuthError = getAuthPublicMessageFromError(error, "Unable to create your account.");
    logAuthDiagnostic("registerWithPassword auth error", {
      supabaseError: serializeAuthError(error),
      returnedAuthError,
    });
    throw new Error(returnedAuthError);
  }

  const hasActiveSession = Boolean(data.session);
  if (hasActiveSession) {
    await bootstrapWorkspaceForCurrentUser(client, {
      full_name: input.full_name,
      workspace_name: input.workspace_name,
      next: input.next,
    });
  }

  return hasActiveSession;
}

export async function requestPasswordReset(client: SupabaseServerClient, input: ForgotPasswordFormInput) {
  if (input.email === process.env.DEMO_USER_EMAIL) {
    // Act like it succeeded to avoid email enumeration, but don't actually send anything
    return true;
  }

  const { error } = await client.auth.resetPasswordForEmail(input.email, {
    redirectTo: `${getSupabaseOrigin()}/auth/callback?next=/reset-password`,
  });

  if (error) {
    logAuthDiagnostic("requestPasswordReset auth error", {
      supabaseError: serializeAuthError(error),
      returnedAuthError: false,
    });
    return false;
  }

  return true;
}

export async function updatePassword(client: SupabaseServerClient, input: ResetPasswordFormInput) {
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) {
    logAuthDiagnostic("updatePassword auth error", {
      supabaseError: serializeAuthError(userError),
      returnedAuthError: "This reset link is invalid or expired.",
    });
    throw new Error("This reset link is invalid or expired.");
  }

  if (userData.user.email === process.env.DEMO_USER_EMAIL) {
    throw new Error("Password resets are disabled for the demo account.");
  }

  const { error } = await client.auth.updateUser({
    password: input.new_password,
  });

  if (error) {
    const returnedAuthError = getAuthPublicMessageFromError(error, "Unable to update your password.");
    logAuthDiagnostic("updatePassword auth error", {
      supabaseError: serializeAuthError(error),
      returnedAuthError,
    });
    throw new Error(returnedAuthError);
  }

  return userData.user;
}

export function parseAuthLoginInput(formData: FormData): LoginFormInput {
  return loginFormSchema.parse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next"),
  });
}

export function parseAuthRegisterInput(formData: FormData): RegisterFormInput {
  return registerFormSchema.parse({
    full_name: formData.get("full_name"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirm_password: formData.get("confirm_password"),
    workspace_name: formData.get("workspace_name"),
    next: formData.get("next"),
  });
}

export function parseAuthBootstrapInput(formData: FormData): BootstrapWorkspaceFormInput {
  return bootstrapWorkspaceFormSchema.parse({
    full_name: formData.get("full_name"),
    workspace_name: formData.get("workspace_name"),
    next: formData.get("next"),
  });
}

export function parseAuthForgotPasswordInput(formData: FormData): ForgotPasswordFormInput {
  return forgotPasswordFormSchema.parse({
    email: formData.get("email"),
    next: formData.get("next"),
  });
}

export function parseAuthResetPasswordInput(formData: FormData): ResetPasswordFormInput {
  return resetPasswordFormSchema.parse({
    new_password: formData.get("new_password"),
    confirm_password: formData.get("confirm_password"),
    next: formData.get("next"),
  });
}

export function toAuthActionStateFromError(error: unknown, fallback: string) {
  return createAuthActionState(getAuthPublicMessageFromError(error, fallback), {});
}

export function toAuthValidationActionState(error: z.ZodError) {
  return createAuthActionState("Please fix the highlighted fields.", flattenAuthValidationError(error));
}
