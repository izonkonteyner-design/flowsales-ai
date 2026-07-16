import { Mail, MapPin, Phone, Users, type LucideIcon } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getCustomers } from "@/server/services/workspace-data";

export default function CustomersPage() {
  const customers = getCustomers();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="CRM"
        title="Customers"
        description="Track long-term accounts, lifetime value, and the next review milestone for each customer."
        actions={
          <button className="inline-flex h-10 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950">
            <Users className="h-4 w-4" />
            Add customer
          </button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
        <SectionCard title="Accounts" description="Customer records with commercial context and review timing.">
          <div className="space-y-3">
            {customers.map((customer) => (
              <article
                key={customer.id}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="font-medium text-slate-950 dark:text-white">{customer.name}</p>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{customer.company}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">{customer.segment}</Badge>
                    <Badge variant="secondary">{customer.city}</Badge>
                    <Badge variant="secondary">{formatCurrency(customer.lifetime_value, "TRY")}</Badge>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 text-sm text-slate-600 dark:text-slate-400 sm:grid-cols-3">
                  <Row icon={Mail} label={customer.email} />
                  <Row icon={Phone} label={customer.phone} />
                  <Row
                    icon={MapPin}
                    label={customer.next_review_at ? `Review ${formatDate(customer.next_review_at)}` : "No review scheduled"}
                  />
                </div>
              </article>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Retention view" description="Quick signals for account health.">
          <div className="space-y-4">
            <Metric label="High-value accounts" value="2" />
            <Metric label="Reviews due this week" value="3" />
            <Metric label="Repeat purchases" value="67%" />
            <Metric label="Churn risk" value="Low" />
          </div>
        </SectionCard>
      </div>

      {!customers.length ? (
        <EmptyState
          title="No customers yet"
          description="Customer accounts will appear here once the CRM starts capturing order history."
          actionHref="/dashboard"
          actionLabel="Back to dashboard"
        />
      ) : null}
    </div>
  );
}

function Row({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-slate-950/40">
      <Icon className="h-4 w-4 text-slate-400" />
      <span className="truncate">{label}</span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">{value}</p>
    </div>
  );
}
