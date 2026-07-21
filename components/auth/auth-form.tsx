"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import {
  bootstrapWorkspaceAction,
  forgotPasswordAction,
  loginAction,
  registerAction,
  resetPasswordAction,
  startDemoAction,
} from "@/app/(auth)/actions";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/shared/status-badge";
import type { AuthActionState } from "@/server/services/auth-domain";

type AuthMode = "login" | "register" | "bootstrap" | "forgot" | "reset";

type AuthFormProps = {
  mode: AuthMode;
  next?: string;
};

const initialAuthState: AuthActionState = {
  success: false,
  message: "",
  fieldErrors: {},
};

const actionMap = {
  login: loginAction,
  register: registerAction,
  bootstrap: bootstrapWorkspaceAction,
  forgot: forgotPasswordAction,
  reset: resetPasswordAction,
} as const;

const submitLabels = {
  login: "Sign in",
  register: "Create account",
  bootstrap: "Complete setup",
  forgot: "Send reset email",
  reset: "Update password",
} as const;

const headingLabels = {
  login: "Sign in",
  register: "Create your account",
  bootstrap: "Complete workspace setup",
  forgot: "Reset your password",
  reset: "Set a new password",
} as const;

const eyebrowLabels = {
  login: "Welcome back",
  register: "Start here",
  bootstrap: "Workspace setup",
  forgot: "Recover access",
  reset: "Recovery link",
} as const;

const descriptionLabels = {
  login: "Access your tenant-safe CRM workspace.",
  register: "Create your workspace and confirm your account securely.",
  bootstrap: "Finish the workspace that was created for your account.",
  forgot: "We’ll send a reset link if the account exists.",
  reset: "Choose a strong password for your account.",
} as const;

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) {
    return null;
  }

  return (
    <p id={id} className="text-sm text-rose-600 dark:text-rose-300">
      {message}
    </p>
  );
}

function AuthInput({
  label,
  name,
  type,
  placeholder,
  autoComplete,
  required,
  defaultValue,
  error,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  defaultValue?: string;
  error?: string;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
      <Input
        name={name}
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        defaultValue={defaultValue}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${name}-error` : undefined}
      />
      <FieldError id={`${name}-error`} message={error} />
    </label>
  );
}

export function AuthForm({ mode, next = "/dashboard" }: AuthFormProps) {
  const configured = hasSupabaseConfig();
  const [state, formAction, isPending] = useActionState(actionMap[mode], initialAuthState);

  const showPasswordFields = mode === "login" || mode === "register" || mode === "reset";
  const showRegisterFields = mode === "register" || mode === "bootstrap";

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
          {eyebrowLabels[mode]}
        </p>
        <h2 className="text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
          {headingLabels[mode]}
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">{descriptionLabels[mode]}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <StatusBadge tone={configured ? "success" : "warning"}>
          {configured ? "Authentication ready" : "Configuration required"}
        </StatusBadge>
        {mode === "bootstrap" ? <StatusBadge tone="info">Workspace bootstrap</StatusBadge> : null}
      </div>

      {!configured ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
          Supabase environment variables are required to enable authentication.
        </p>
      ) : null}

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="next" value={next} />

        {showRegisterFields ? (
          <>
            <AuthInput
              label="Full name"
              name="full_name"
              placeholder="Selin Kaya"
              autoComplete="name"
              required
              error={state.fieldErrors.full_name}
            />

            <AuthInput
              label="Workspace name"
              name="workspace_name"
              placeholder="FlowSales AI"
              autoComplete="organization"
              required
              error={state.fieldErrors.workspace_name}
            />
          </>
        ) : null}

        {mode === "login" || mode === "register" || mode === "forgot" ? (
          <AuthInput
            label="Email"
            name="email"
            type="email"
            placeholder="you@company.com"
            autoComplete="email"
            required
            error={state.fieldErrors.email}
          />
        ) : null}

        {showPasswordFields ? (
          <AuthInput
            label={mode === "reset" ? "New password" : "Password"}
            name={mode === "reset" ? "new_password" : "password"}
            type="password"
            placeholder={mode === "reset" ? "Create a strong password" : "Password"}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            error={mode === "reset" ? state.fieldErrors.new_password : state.fieldErrors.password}
          />
        ) : null}

        {mode === "register" || mode === "reset" ? (
          <AuthInput
            label={mode === "register" ? "Confirm password" : "Confirm new password"}
            name="confirm_password"
            type="password"
            placeholder="Confirm password"
            autoComplete="new-password"
            required
            error={state.fieldErrors.confirm_password}
          />
        ) : null}

        <button
          type="submit"
          disabled={isPending || !configured}
          className={cn(
            "inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200",
            !configured && "pointer-events-none opacity-60",
          )}
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {submitLabels[mode]}
        </button>
      </form>

      {mode === "login" && (
        <form action={startDemoAction}>
          <button
            type="submit"
            className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
          >
            Start Demo
          </button>
        </form>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600 dark:text-slate-400">
        {mode === "login" ? (
          <>
            <Link href="/forgot-password" className="hover:text-slate-950 dark:hover:text-white">
              Forgot password?
            </Link>
            <Link href="/register" className="hover:text-slate-950 dark:hover:text-white">
              Create account
            </Link>
          </>
        ) : mode === "register" || mode === "bootstrap" ? (
          <Link href="/login" className="hover:text-slate-950 dark:hover:text-white">
            Already have an account?
          </Link>
        ) : (
          <Link href="/login" className="hover:text-slate-950 dark:hover:text-white">
            Back to sign in
          </Link>
        )}
      </div>

      {state.message ? (
        <p
          className={cn(
            "rounded-2xl border p-4 text-sm",
            state.success
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200"
              : "border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300",
          )}
        >
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
