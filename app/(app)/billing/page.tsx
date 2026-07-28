import { Crown, ExternalLink, ShieldCheck, Sparkles } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { SUBSCRIPTION_PLANS } from "@/lib/constants";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import { buildAdminClient, getSubscriptionUsage, listInvoices, getActiveSubscription, type SubscriptionUsage, type InvoiceRow, type SubscriptionRow } from "@/server/services/subscriptions";
import { hasStripeConfig } from "@/server/services/stripe";
import { StartCheckoutButton } from "@/components/billing/start-checkout-button";
import { OpenPortalButton } from "@/components/billing/open-portal-button";

export const dynamic = "force-dynamic";

type BillingData = {
  mode: "demo" | "live";
  stripeConfigured: boolean;
  usage: SubscriptionUsage | null;
  subscription: SubscriptionRow | null;
  invoices: InvoiceRow[];
  role: string | null;
};

async function loadBillingData(): Promise<BillingData> {
  if (!hasSupabaseConfig()) {
    return { mode: "demo", stripeConfigured: hasStripeConfig(), usage: null, subscription: null, invoices: [], role: null };
  }

  const serverClient = await createSupabaseServerClient();
  if (!serverClient) {
    return { mode: "demo", stripeConfigured: hasStripeConfig(), usage: null, subscription: null, invoices: [], role: null };
  }

  const { data: userData } = await serverClient.auth.getUser();
  if (!userData.user) {
    return { mode: "demo", stripeConfigured: hasStripeConfig(), usage: null, subscription: null, invoices: [], role: null };
  }

  const { data: membership } = await serverClient
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", userData.user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return { mode: "demo", stripeConfigured: hasStripeConfig(), usage: null, subscription: null, invoices: [], role: null };
  }

  const adminClient = buildAdminClient();
  const [usage, invoices, subscription] = await Promise.all([
    getSubscriptionUsage(adminClient, membership.organization_id),
    listInvoices(adminClient, membership.organization_id, 12),
    getActiveSubscription(adminClient, membership.organization_id),
  ]);

  return {
    mode: "live",
    stripeConfigured: hasStripeConfig(),
    usage,
    subscription,
    invoices,
    role: (membership as { role: string }).role,
  };
}

export default async function BillingPage() {
  const data = await loadBillingData();
  const canManage = data.role === "owner" || data.role === "admin";
  const usage = data.usage;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Commercial"
        title="Billing"
        description="Manage your subscription, usage, seats, and invoices."
        actions={<StatusBadge tone={usage?.status === "active" ? "success" : "warning"}>{usage ? `${usage.plan} — ${usage.status}` : "Billing ready"}</StatusBadge>}
      />

      {!data.stripeConfigured && (
        <SectionCard title="Live Stripe is not connected" description="Add STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to enable real subscriptions. Demo and data models are ready.">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Configure the Stripe keys in your environment, then refresh this page.
          </p>
        </SectionCard>
      )}

      {data.mode === "demo" && (
        <SectionCard title="Demo mode" description="Billing tables are available, but no signed-in workspace was detected.">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Sign in with a real workspace to subscribe and view usage.
          </p>
        </SectionCard>
      )}

      {usage && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SectionCard title="Plan" description="Current subscription plan">
            <div className="flex items-center gap-3">
              <Crown className="h-5 w-5 text-amber-500" />
              <div>
                <p className="text-2xl font-semibold capitalize">{usage.plan}</p>
                <p className="text-xs text-slate-500">{usage.status}</p>
              </div>
            </div>
          </SectionCard>
          <SectionCard title="Seats" description="Used / included">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-emerald-500" />
              <p className="text-2xl font-semibold">{usage.currentSeats} / {usage.seatLimit}</p>
            </div>
          </SectionCard>
          <SectionCard title="AI messages" description="This period">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-indigo-500" />
              <p className="text-2xl font-semibold">{usage.currentAiMessages} / {usage.aiMessageLimit}</p>
            </div>
          </SectionCard>
          <SectionCard title="Renews / Cancels" description={usage.cancelAtPeriodEnd ? "Cancels at period end" : "Next renewal"}>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {usage.currentPeriodEnd ? new Date(usage.currentPeriodEnd).toLocaleDateString() : "—"}
            </p>
          </SectionCard>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {SUBSCRIPTION_PLANS.map((plan) => {
          const isCurrent = usage?.plan === plan.id;
          return (
            <SectionCard
              key={plan.id}
              title={plan.name}
              description={`${plan.seatLimit} seats, ${plan.aiMessageLimit} AI messages`}
              actions={isCurrent ? <StatusBadge tone="success">Current</StatusBadge> : undefined}
            >
              <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
                {plan.features.map((feature) => (
                  <div key={feature} className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-500" />
                    <span>{feature}</span>
                  </div>
                ))}
                {data.mode === "live" && data.stripeConfigured && canManage && !isCurrent && (
                  <StartCheckoutButton plan={plan.id} seats={Math.max(1, usage?.currentSeats ?? 1)} />
                )}
              </div>
            </SectionCard>
          );
        })}
      </div>

      {data.mode === "live" && data.stripeConfigured && canManage && usage && (
        <div className="flex flex-wrap gap-3">
          <OpenPortalButton />
        </div>
      )}

      {data.invoices.length > 0 && (
        <SectionCard title="Recent invoices" description="Stripe invoices synced to your workspace.">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="p-2">Number</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Amount</th>
                  <th className="p-2">Paid</th>
                  <th className="p-2">PDF</th>
                </tr>
              </thead>
              <tbody>
                {data.invoices.map((invoice) => (
                  <tr key={invoice.id} className="border-t border-slate-100 dark:border-white/5">
                    <td className="p-2 font-mono">{invoice.number ?? invoice.stripe_invoice_id}</td>
                    <td className="p-2"><StatusBadge tone={invoice.status === "paid" ? "success" : invoice.status === "void" ? "danger" : "warning"}>{invoice.status}</StatusBadge></td>
                    <td className="p-2">{formatAmount(invoice.amount_due, invoice.currency)}</td>
                    <td className="p-2">{invoice.paid_at ? new Date(invoice.paid_at).toLocaleDateString() : "—"}</td>
                    <td className="p-2">
                      {invoice.hosted_invoice_url ? (
                        <a href={invoice.hosted_invoice_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-indigo-500 hover:underline">
                          <ExternalLink className="h-3.5 w-3.5" /> View
                        </a>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

function formatAmount(amount: number, currency: string) {
  const symbol = currency.toLowerCase() === "try" ? "₺" : currency === "usd" ? "$" : currency === "eur" ? "€" : "";
  return `${symbol}${(amount / 100).toFixed(2)}`;
}
