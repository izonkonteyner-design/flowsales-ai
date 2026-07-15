import Link from "next/link";
import { ArrowRight, Filter, Plus, Search } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { LEAD_STATUSES } from "@/lib/constants";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { getLeads } from "@/server/services/crm-data";

export default function LeadsPage() {
  const leads = getLeads();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="CRM"
        title="Leads"
        description="Search, qualify, and advance opportunities through a structured pipeline."
        actions={
          <>
            <button className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10">
              <Filter className="h-4 w-4" />
              Filters
            </button>
            <button className="inline-flex h-10 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950">
              <Plus className="h-4 w-4" />
              New lead
            </button>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <SectionCard title="All leads" description="A responsive list with search, sort, and status context.">
          <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_auto_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input placeholder="Search leads, companies, city, or source" className="pl-10" />
            </div>
            <button className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10">
              Newest
            </button>
            <button className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10">
              <ArrowRight className="h-4 w-4" />
              Export
            </button>
          </div>

          <div className="overflow-hidden rounded-3xl border border-slate-200 dark:border-white/10">
            <div className="hidden grid-cols-[1.4fr_1fr_0.8fr_0.8fr_0.9fr_0.9fr] gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 lg:grid dark:border-white/10 dark:bg-white/5">
              <span>Lead</span>
              <span>Company</span>
              <span>Source</span>
              <span>Status</span>
              <span>Value</span>
              <span>Follow-up</span>
            </div>

            <div className="divide-y divide-slate-200 dark:divide-white/10">
              {leads.map((lead) => {
                const statusTone =
                  lead.status === "won"
                    ? "success"
                    : lead.status === "lost"
                      ? "danger"
                      : lead.status === "quote_sent" || lead.status === "negotiation"
                        ? "warning"
                        : "info";

                return (
                  <Link
                    key={lead.id}
                    href={`/leads/${lead.id}`}
                    className="block px-4 py-4 transition hover:bg-slate-50 dark:hover:bg-white/5"
                  >
                    <div className="hidden grid-cols-[1.4fr_1fr_0.8fr_0.8fr_0.9fr_0.9fr] gap-4 lg:grid">
                      <div>
                        <p className="font-medium text-slate-950 dark:text-white">{lead.full_name}</p>
                        <p className="mt-1 text-sm text-slate-500">{lead.email}</p>
                      </div>
                      <div>
                        <p className="font-medium text-slate-700 dark:text-slate-300">{lead.company}</p>
                        <p className="mt-1 text-sm text-slate-500">{lead.city}</p>
                      </div>
                      <div className="text-sm text-slate-600 dark:text-slate-400">{lead.source}</div>
                      <div>
                        <StatusBadge tone={statusTone}>{lead.status.replace("_", " ")}</StatusBadge>
                      </div>
                      <div className="text-sm font-medium text-slate-950 dark:text-white">
                        {formatCurrency(lead.estimated_value, lead.currency)}
                      </div>
                      <div className="text-sm text-slate-600 dark:text-slate-400">
                        {lead.next_follow_up_at ? formatDateTime(lead.next_follow_up_at) : "Not set"}
                      </div>
                    </div>

                    <div className="space-y-3 lg:hidden">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-medium text-slate-950 dark:text-white">{lead.full_name}</p>
                          <p className="mt-1 text-sm text-slate-500">{lead.company}</p>
                        </div>
                        <StatusBadge tone={statusTone}>{lead.status.replace("_", " ")}</StatusBadge>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary">{lead.source}</Badge>
                        <Badge variant="secondary">{lead.city}</Badge>
                        <Badge variant="secondary">{formatCurrency(lead.estimated_value, lead.currency)}</Badge>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </SectionCard>

        <div className="space-y-6">
          <SectionCard title="Lead intake" description="Fast form for new opportunities and follow-up planning.">
            <div className="grid gap-4">
              <Input placeholder="Full name" />
              <Input placeholder="Company" />
              <Input placeholder="Email" type="email" />
              <Input placeholder="Phone" />
              <select className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm dark:border-white/10 dark:bg-white/5">
                <option>Website</option>
                <option>WhatsApp</option>
                <option>Instagram</option>
                <option>Referral</option>
              </select>
              <div className="grid grid-cols-2 gap-4">
                <select className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm dark:border-white/10 dark:bg-white/5">
                  {LEAD_STATUSES.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
                <Input placeholder="Estimated value" />
              </div>
              <Input placeholder="Next follow-up date" type="date" />
              <button className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950">
                Save lead
              </button>
            </div>
          </SectionCard>

          <SectionCard title="Pipeline snapshot" description="Distribution of current lead statuses.">
            <div className="space-y-3">
              {LEAD_STATUSES.map((status) => {
                const count = leads.filter((lead) => lead.status === status.value).length;
                return (
                  <div key={status.value} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600 dark:text-slate-400">{status.label}</span>
                      <span className="font-medium text-slate-950 dark:text-white">{count}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                      <div
                        className="h-full rounded-full bg-slate-950 dark:bg-white"
                        style={{ width: `${Math.max((count / leads.length) * 100, 8)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </div>
      </div>

      {leads.length ? null : (
        <EmptyState
          title="No leads yet"
          description="Once the workspace starts receiving leads, they will appear in this list."
          actionHref="/dashboard"
          actionLabel="Open dashboard"
        />
      )}
    </div>
  );
}
