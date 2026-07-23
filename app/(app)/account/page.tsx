import { redirect } from "next/navigation";
import Link from "next/link";
import { UserCircle2, Mail, Building2, ShieldCheck, LogOut } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { updateProfileAction } from "./actions";
import { signOutAction } from "@/app/(auth)/actions";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";

export const metadata = {
  title: "Account & Profile",
};

type AccountUser = {
  email: string | null;
  user_metadata?: {
    full_name?: string;
    name?: string;
    display_name?: string;
  };
};

export default async function AccountPage() {
  const client = await createSupabaseServerClient();
  if (!client) {
    redirect("/login");
  }

  const {
    data: { user: currentUser },
  } = await client.auth.getUser();

  const isE2EDemoBypass = process.env.NODE_ENV !== "production" && !!process.env.E2E_RATE_LIMIT_BYPASS_SECRET;
  const user: AccountUser | null =
    currentUser
      ? {
          email: currentUser.email ?? null,
          user_metadata: currentUser.user_metadata as AccountUser["user_metadata"] | undefined,
        }
      : isE2EDemoBypass
        ? {
            email: process.env.DEMO_USER_EMAIL ?? "demo@flowsales.ai",
            user_metadata: {
              full_name: "FlowSales AI Demo",
            },
          }
        : null;

  if (!user) {
    redirect("/login");
  }

  const workspace = await getWorkspaceContext();
  const fullName = user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.user_metadata?.display_name ?? "";
  const email = user.email ?? "";
  const isDemo = email === process.env.DEMO_USER_EMAIL;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">Account & Profile</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Manage your personal information and view your workspace access.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        <div className="space-y-8">
          <section className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-[0_12px_40px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-slate-950/50">
            <div className="mb-6 flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300">
                <UserCircle2 className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-medium text-slate-950 dark:text-white">Personal Information</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">Update your name and display details.</p>
              </div>
            </div>

            {isDemo && (
              <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/30 dark:bg-amber-900/10 dark:text-amber-300">
                Demo mode is read-only. Create your own account to edit profile information.
              </div>
            )}

            <form action={updateProfileAction} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="full_name" className="text-sm font-medium text-slate-900 dark:text-slate-300">
                  Full Name
                </label>
                <Input
                  id="full_name"
                  name="full_name"
                  defaultValue={fullName}
                  placeholder="e.g. John Doe"
                  required
                  disabled={isDemo}
                  minLength={2}
                  maxLength={64}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900 dark:text-slate-300">Email Address</label>
                <div className="flex items-center gap-3">
                  <Input type="email" value={email} disabled className="bg-slate-50 dark:bg-slate-900/50" />
                  <Mail className="h-5 w-5 text-slate-400" />
                </div>
                <p className="text-xs text-slate-500">Your email address cannot be changed from this panel.</p>
              </div>

              <div className="pt-4">
                <Button type="submit" disabled={isDemo}>Save Changes</Button>
              </div>
            </form>
          </section>

          <section className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-[0_12px_40px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-slate-950/50">
            <div className="mb-6 flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-medium text-slate-950 dark:text-white">Account Security</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">Manage your password and active sessions.</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-slate-200 p-4 dark:border-white/10">
                <div>
                  <p className="font-medium text-slate-950 dark:text-white">Password</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">A secure password helps protect your account.</p>
                </div>
                {/* Normally we'd send a reset email or link to /forgot-password but for MVP a simple message is fine, or a link to /forgot-password */}
                <Link href="/forgot-password" className={buttonVariants({ variant: "outline" })}>
                  Reset Password
                </Link>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900/30 dark:bg-rose-900/10">
                <div>
                  <p className="font-medium text-rose-900 dark:text-rose-300">Sign Out</p>
                  <p className="text-sm text-rose-700 dark:text-rose-400/80">End your session on this device.</p>
                </div>
                <form action={signOutAction}>
                  <Button variant="destructive" type="submit" className="gap-2">
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </Button>
                </form>
              </div>
            </div>
          </section>
        </div>

        <div>
          <div className="sticky top-24 rounded-[2rem] border border-slate-200 bg-slate-50 p-6 dark:border-white/10 dark:bg-white/5">
            <h3 className="mb-4 font-medium text-slate-950 dark:text-white">Workspace Context</h3>
            
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Building2 className="mt-0.5 h-5 w-5 text-slate-400" />
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-300">Organization</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{workspace.organization.name}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 text-slate-400" />
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-300">Your Role</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400 capitalize">{workspace.role}</p>
                  {workspace.role === "viewer" && (
                    <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                      You have read-only access.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
