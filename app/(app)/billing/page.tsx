import { CreditCard, Crown, ReceiptText, ShieldCheck, type LucideIcon } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { SUBSCRIPTION_PLANS } from "@/lib/constants";

export default function BillingPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Commercial"
        title="Billing"
        description="Prepared for subscriptions, usage, and plan management without exposing live payments yet."
        actions={<StatusBadge tone="warning">Billing ready</StatusBadge>}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {SUBSCRIPTION_PLANS.map((plan) => (
          <SectionCard key={plan.id} title={plan.name} description={`${plan.seatLimit} seats, ${plan.aiMessageLimit} AI messages`}>
            <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
              {plan.features.map((feature) => (
                <div key={feature} className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>
          </SectionCard>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <SectionCard title="Billing checklist" description="Implementation guardrails before any live payment provider is enabled.">
          <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
            <Step icon={CreditCard} title="Stripe-ready checkout" detail="Add payment intents and hosted checkout only when the product is ready to sell." />
            <Step icon={ReceiptText} title="Invoices and receipts" detail="Expose invoice records from the database once subscription data is live." />
            <Step icon={Crown} title="Plan gates" detail="Keep seat and AI usage gates enforced at the application boundary." />
          </div>
        </SectionCard>

        <SectionCard title="Current state" description="The app is safe to ship as a demo and upgrade later.">
          <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
            <p>No live billing provider is connected.</p>
            <p>Plan metadata exists in code and migrations.</p>
            <p>User-facing purchase flows should stay disabled until Stripe is wired end to end.</p>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function Step({ icon: Icon, title, detail }: { icon: LucideIcon; title: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-slate-400" />
        <p className="font-medium text-slate-950 dark:text-white">{title}</p>
      </div>
      <p className="mt-1">{detail}</p>
    </div>
  );
}
