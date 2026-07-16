import Link from "next/link";
import { BadgeCheck, CalendarClock, Coins, LayoutGrid, Users2 } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { getCustomerPageData } from "@/server/services/customers";
import { getCustomerRecordInfo, getCustomerRestrictionMessage } from "@/server/services/customers";

export default async function CustomersPage() {
  const data = await getCustomerPageData();
  const totalValue = data.customers.reduce((sum, customer) => sum + Number(customer.lifetime_value ?? 0), 0);
  const convertedCount = data.customers.filter((customer) => customer.source_lead_id).length;
  const recentReviews = data.customers.filter((customer) => customer.next_review_at).length;
  const liveMode = data.context.mode === "live";
  const restriction = getCustomerRestrictionMessage(liveMode ? "live" : "demo", data.context.role);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="CRM"
        title="Customers"
        description="Track converted accounts, source leads, and quote history in one place."
        actions={
          <Link
            href="/leads"
            className="inline-flex h-10 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950"
          >
            <Users2 className="h-4 w-4" />
            Convert a lead
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Customers" value={String(data.total)} delta={data.context.mode === "live" ? "Live workspace" : "Demo workspace"} icon={LayoutGrid} />
        <Metric label="Converted leads" value={String(convertedCount)} delta="Linked source records" icon={BadgeCheck} />
        <Metric label="Customer value" value={formatCurrency(totalValue, data.context.organization.currency)} delta="Derived from quotes and demo data" icon={Coins} />
        <Metric label="Reviews due" value={String(recentReviews)} delta="Next review milestones" icon={CalendarClock} />
      </div>

      {data.error ? (
        <EmptyState title="Unable to load customers" description={data.error} actionHref="/leads" actionLabel="Back to leads" />
      ) : data.customers.length ? (
        <SectionCard title="Accounts" description="Converted customer records with source-lead and quote context.">
          <div className="space-y-3">
            {data.customers.map((customer) => {
              const recordInfo = getCustomerRecordInfo(customer.recordMode);
              return (
                <article
                  key={customer.id}
                  className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/customers/${customer.id}`} className="font-medium text-slate-950 underline-offset-4 hover:underline dark:text-white">
                          {customer.name}
                        </Link>
                        <StatusBadge tone={recordInfo.tone} title={recordInfo.title}>
                          {recordInfo.label}
                        </StatusBadge>
                        <Badge variant="secondary">{customer.segment}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{customer.company || "No company"}</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">{customer.city || "No city"}</Badge>
                      <Badge variant="secondary">{formatCurrency(customer.lifetime_value, data.context.organization.currency)}</Badge>
                      <Badge variant="secondary">{customer.quote_count ?? 0} quotes</Badge>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 text-sm text-slate-600 dark:text-slate-400 sm:grid-cols-4">
                    <Info label="Email" value={customer.email || "Not set"} />
                    <Info label="Phone" value={customer.phone || "Not set"} />
                    <Info label="Source lead" value={customer.source_lead_name ?? "No linked lead"} />
                    <Info
                      label="Last quote"
                      value={customer.last_quote_at ? formatDateTime(customer.last_quote_at) : "No quote yet"}
                    />
                  </div>
                </article>
              );
            })}
          </div>
          {restriction ? <p className="mt-4 text-xs leading-5 text-slate-500 dark:text-slate-400">{restriction}</p> : null}
        </SectionCard>
      ) : (
        <EmptyState
          title="No customers yet"
          description="Convert a qualified lead to create the first live customer record."
          actionHref="/leads"
          actionLabel="Open leads"
        />
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  delta,
  icon: Icon,
}: {
  label: string;
  value: string;
  delta: string;
  icon: typeof LayoutGrid;
}) {
  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-slate-950/60">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{label}</p>
        <Icon className="h-4 w-4 text-slate-300" />
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{value}</p>
      <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">{delta}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-slate-950/40">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm text-slate-700 dark:text-slate-300">{value}</p>
    </div>
  );
}
