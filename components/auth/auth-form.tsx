"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/shared/status-badge";

type AuthMode = "login" | "signup" | "forgot" | "reset";

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const configured = hasSupabaseConfig();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!configured) {
      setMessage("Supabase environment variables are required to enable authentication.");
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    const client = getSupabaseBrowserClient();
    if (!client) {
      setMessage("Unable to create the Supabase browser client.");
      setIsSubmitting(false);
      return;
    }

    try {
      if (mode === "login") {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push(searchParams.get("next") ?? "/dashboard");
        router.refresh();
      } else if (mode === "signup") {
        if (password !== confirmPassword) {
          throw new Error("Passwords do not match.");
        }
        const { error } = await client.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/login`,
          },
        });
        if (error) throw error;
        setMessage("Check your email to confirm the workspace account.");
      } else if (mode === "forgot") {
        const { error } = await client.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setMessage("Password reset email sent.");
      } else if (mode === "reset") {
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        setMessage("Password updated successfully.");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Authentication failed.";
      setMessage(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
          {mode === "login"
            ? "Welcome back"
            : mode === "signup"
              ? "Start here"
              : mode === "forgot"
                ? "Recover access"
                : "Reset password"}
        </p>
        <h2 className="text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
          {mode === "login"
            ? "Sign in"
            : mode === "signup"
              ? "Create your account"
              : mode === "forgot"
                ? "Forgot password"
                : "Set a new password"}
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {mode === "login"
            ? "Access your tenant-safe CRM workspace."
            : mode === "signup"
              ? "Create your workspace and invite your team later."
              : mode === "forgot"
                ? "We’ll send a reset link if the account exists."
                : "Choose a strong password for your account."}
        </p>
      </div>

      <StatusBadge tone={configured ? "success" : "warning"}>
        {configured ? "Authentication ready" : "Configuration required"}
      </StatusBadge>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@company.com"
          required
        />

        {mode !== "forgot" ? (
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            required
          />
        ) : null}

        {mode === "signup" ? (
          <Input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Confirm password"
            required
          />
        ) : null}

        {mode === "reset" ? (
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="New password"
            required
          />
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
        >
          {isSubmitting
            ? "Working..."
            : mode === "login"
              ? "Sign in"
              : mode === "signup"
                ? "Create account"
                : mode === "forgot"
                  ? "Send reset email"
                  : "Update password"}
        </button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600 dark:text-slate-400">
        {mode === "login" ? (
          <>
            <Link href="/forgot-password" className="hover:text-slate-950 dark:hover:text-white">
              Forgot password?
            </Link>
            <Link href="/signup" className="hover:text-slate-950 dark:hover:text-white">
              Create account
            </Link>
          </>
        ) : mode === "signup" ? (
          <Link href="/login" className="hover:text-slate-950 dark:hover:text-white">
            Already have an account?
          </Link>
        ) : (
          <Link href="/login" className="hover:text-slate-950 dark:hover:text-white">
            Back to sign in
          </Link>
        )}
      </div>

      {message ? (
        <p className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
          {message}
        </p>
      ) : null}
    </div>
  );
}
