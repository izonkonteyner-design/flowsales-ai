import Link from "next/link";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getLemonSqueezyBillingConfigStatus } from "@/server/services/lemonsqueezy-billing";
import { openCustomerPortalAction, startCheckoutAction } from "./actions";

const allowedPlans = new Set(["starter", "growth", "pro"]);
type SearchParams = Promise<{ plan?: string; checkout?: string }>;

export const metadata = { title: "Upgrade | FlowSales AI" };

export default async function UpgradePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const plan = allowedPlans.has(params.plan ?? "") ? params.plan! : "growth";
  const client = await createSupabaseServerClient();
  if (!client) redirect(`/login?next=/upgrade?plan=${plan}`);
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect(`/login?next=/upgrade?plan=${plan}`);
  const { data: membership } = await client.from("organization_members").select("organization_id,role").eq("user_id", auth.user.id).limit(1).maybeSingle();
  if (!membership) redirect("/onboarding");
  const canManageBilling = ["owner", "admin"].includes(String(membership.role));
  const { data: entitlement } = await client.from("organization_entitlements").select("plan_key,subscription_status,billing_subscription_id").eq("organization_id", membership.organization_id).maybeSingle();
  const billingConfig = getLemonSqueezyBillingConfigStatus();

  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-slate-900/80">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-600 dark:text-violet-400">Workspace billing</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 dark:text-white">Selected plan: {plan}</h1>
        {params.checkout === "success" && (
          <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200">
            Checkout completed. Your subscription will update after the signed billing webhook is processed.
          </p>
        )}
        <p className="mt-4 text-slate-600 dark:text-slate-400">
          Current plan: <strong className="text-slate-900 dark:text-white">{entitlement?.plan_key ?? "trial"}</strong> · Status:{" "}
          <strong className="text-slate-900 dark:text-white">{entitlement?.subscription_status ?? "unknown"}</strong>
        </p>
        {canManageBilling ? (
          <div className="mt-6 space-y-3">
            {billingConfig.configured ? (
              <form action={startCheckoutAction}>
                <input type="hidden" name="plan" value={plan} />
                <button className="w-full rounded-xl bg-violet-700 px-4 py-3 font-semibold text-white transition hover:bg-violet-600" type="submit">
                  Continue to secure checkout
                </button>
              </form>
            ) : (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
                Live billing is not configured. Missing server variables: {billingConfig.missing.join(", ")}
              </div>
            )}
            {entitlement?.billing_subscription_id && (
              <form action={openCustomerPortalAction}>
                <button className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-semibold text-slate-800 transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700" type="submit">
                  Manage subscription and payment method
                </button>
              </form>
            )}
          </div>
        ) : (
          <p className="mt-4 text-red-600 dark:text-red-400">Only workspace owners and administrators can manage billing.</p>
        )}
        <div className="mt-8 flex gap-3">
          <Link href="/pricing" className="rounded-xl border border-slate-200 bg-white px-4 py-3 font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
            Compare plans
          </Link>
          <Link href="/usage" className="rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white transition hover:bg-slate-800 dark:bg-violet-600 dark:hover:bg-violet-500">
            Review usage
          </Link>
        </div>
      </section>
    </main>
  );
}
