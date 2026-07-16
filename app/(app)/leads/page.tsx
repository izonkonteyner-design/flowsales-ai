import Link from "next/link";
import type { ReactNode } from "react";
import { Filter, LayoutGrid, List, Plus, Search } from "lucide-react";

import { LEAD_STATUSES } from "@/lib/constants";
import { EmptyState } from "@/components/shared/empty-state";
import { FlashToast } from "@/components/shared/flash-toast";
import { MetricCard } from "@/components/shared/metric-card";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { LeadDeleteDialog } from "@/components/leads/lead-delete-dialog";
import { LeadStatusMenu } from "@/components/leads/lead-status-menu";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { getLeadPageData } from "@/server/services/leads";
import {
  formatLeadFollowUpState,
  getLeadStatusLabel,
  getLeadStatusTone,
  type LeadFilterState,
} from "@/server/services/lead-domain";

type LeadsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function buildLeadHref(filters: LeadFilterState, overrides: Partial<LeadFilterState> = {}) {
  const merged = { ...filters, ...overrides };
  const params = new URLSearchParams();

  if (merged.query) params.set("query", merged.query);
  if (merged.status) params.set("status", merged.status);
  if (merged.source) params.set("source", merged.source);
  if (merged.assignedTo) params.set("assignedTo", merged.assignedTo);
  if (merged.sort !== "newest") params.set("sort", merged.sort);
  if (merged.view !== "table") params.set("view", merged.view);
  if (merged.page > 1) params.set("page", String(merged.page));
  if (merged.pageSize !== 8) params.set("pageSize", String(merged.pageSize));

  const query = params.toString();
  return query ? `/leads?${query}` : "/leads";
}

function buildRedirectTo(filters: LeadFilterState) {
  return buildLeadHref(filters);
}

export default async function LeadsPage({ searchParams }: LeadsPageProps) {
  const rawSearchParams = await searchParams;
  const data = await getLeadPageData(rawSearchParams);
  const toastMessage = typeof rawSearchParams.toast === "string" ? rawSearchParams.toast : "";
  const toastTone =
    rawSearchParams.tone === "danger" || rawSearchParams.tone === "warning" || rawSearchParams.tone === "info"
      ? rawSearchParams.tone
      : "success";
  const currentHref = buildRedirectTo(data.filters);
  const createLeadHref = `/leads/new?redirect_to=${encodeURIComponent(currentHref)}`;
  const toggleViewHref = buildLeadHref(data.filters, {
    view: data.filters.view === "table" ? "pipeline" : "table",
    page: 1,
  });
  const resetHref = "/leads";
  const hasFilters =
    Boolean(data.filters.query || data.filters.status || data.filters.source || data.filters.assignedTo) ||
    data.filters.sort !== "newest" ||
    data.filters.pageSize !== 8;

  return (
    <div className="space-y-6">
      {toastMessage ? <FlashToast message={toastMessage} tone={toastTone} /> : null}

      <PageHeader
        eyebrow="CRM"
        title="Leads"
        description="Search, qualify, and advance opportunities through a structured pipeline."
        actions={
          <>
            <Link
              href={toggleViewHref}
              className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
            >
              {data.filters.view === "table" ? <LayoutGrid className="h-4 w-4" /> : <List className="h-4 w-4" />}
              {data.filters.view === "table" ? "Pipeline view" : "Table view"}
            </Link>
            <Link
              href={createLeadHref}
              className="inline-flex h-10 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950"
            >
              <Plus className="h-4 w-4" />
              New lead
            </Link>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total leads"
          value={String(data.summary.totalLeads)}
          delta="Organization scoped"
          icon={Filter}
          tone="blue"
        />
        <MetricCard
          label="New leads"
          value={String(data.summary.newLeads)}
          delta="Ready for qualification"
          icon={Search}
          tone="emerald"
        />
        <MetricCard
          label="Pipeline value"
          value={formatCurrency(data.summary.pipelineValue, data.context.organization.currency)}
          delta="Active opportunities"
          icon={Plus}
          tone="amber"
        />
        <MetricCard
          label="Follow-ups due"
          value={String(data.summary.followUpsDue + data.summary.overdueFollowUps)}
          delta={`${data.summary.overdueFollowUps} overdue`}
          icon={LayoutGrid}
          tone="violet"
        />
      </div>

      <SectionCard
        title="Lead workspace"
        description="Use search, filters, and sort to keep the pipeline clean."
      >
        <form method="get" className="grid gap-3 xl:grid-cols-[1.8fr_0.8fr_0.8fr_0.8fr_0.8fr_auto]">
          <input type="hidden" name="view" value={data.filters.view} />
          <input type="hidden" name="page" value="1" />

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Search</span>
            <Input name="query" defaultValue={data.filters.query} />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Status</span>
            <Select name="status" defaultValue={data.filters.status}>
              <option value="">All statuses</option>
              {LEAD_STATUSES.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </Select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Source</span>
            <Select name="source" defaultValue={data.filters.source}>
              <option value="">All sources</option>
              {Array.from(new Set(data.allLeads.map((lead) => lead.source))).map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </Select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Assigned to</span>
            <Select name="assignedTo" defaultValue={data.filters.assignedTo}>
              <option value="">All members</option>
              {data.context.members.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.full_name}
                </option>
              ))}
            </Select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Sort</span>
            <Select name="sort" defaultValue={data.filters.sort}>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="value">Value</option>
              <option value="follow_up">Follow-up</option>
            </Select>
          </label>

          <div className="flex items-end gap-3">
            <button
              type="submit"
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950"
            >
              Apply
            </button>
            {hasFilters ? (
              <Link
                href={resetHref}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
              >
                Reset
              </Link>
            ) : null}
          </div>
        </form>
      </SectionCard>

      {data.filters.view === "pipeline" ? (
        <LeadPipelineView leads={data.leads} redirectTo={currentHref} />
      ) : (
        <LeadTableView leads={data.leads} redirectTo={currentHref} />
      )}

      {data.totalPages > 1 ? (
        <SectionCard>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Page {data.currentPage} of {data.totalPages} · {data.total} lead{data.total === 1 ? "" : "s"}
            </p>
            <div className="flex flex-wrap gap-2">
              <PageNavLink
                href={buildLeadHref(data.filters, { page: Math.max(1, data.currentPage - 1) })}
                disabled={data.currentPage === 1}
              >
                Previous
              </PageNavLink>
              {Array.from({ length: data.totalPages }, (_, index) => index + 1).map((page) => (
                <PageNavLink
                  key={page}
                  href={buildLeadHref(data.filters, { page })}
                  active={page === data.currentPage}
                >
                  {page}
                </PageNavLink>
              ))}
              <PageNavLink
                href={buildLeadHref(data.filters, { page: Math.min(data.totalPages, data.currentPage + 1) })}
                disabled={data.currentPage === data.totalPages}
              >
                Next
              </PageNavLink>
            </div>
          </div>
        </SectionCard>
      ) : null}

      {!data.total ? (
        <EmptyState
          title="No leads match these filters"
          description="Try a different search, clear filters, or create a new lead."
          actionHref={createLeadHref}
          actionLabel="New lead"
        />
      ) : null}
    </div>
  );
}

function LeadTableView({ leads, redirectTo }: { leads: Awaited<ReturnType<typeof getLeadPageData>>["leads"]; redirectTo: string }) {
  return (
    <SectionCard title="All leads" description="A responsive list with search, sort, and status context.">
      <div className="overflow-hidden rounded-3xl border border-slate-200 dark:border-white/10">
        <div className="hidden grid-cols-[1.5fr_1fr_0.9fr_0.9fr_0.9fr_1fr] gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 lg:grid dark:border-white/10 dark:bg-white/5">
          <span>Lead</span>
          <span>Company</span>
          <span>Source</span>
          <span>Status</span>
          <span>Value</span>
          <span>Follow-up</span>
        </div>

        <div className="divide-y divide-slate-200 dark:divide-white/10">
          {leads.map((lead) => (
            <article key={lead.id} className="block px-4 py-4 transition hover:bg-slate-50 dark:hover:bg-white/5">
              <div className="hidden grid-cols-[1.5fr_1fr_0.9fr_0.9fr_0.9fr_1fr] gap-4 lg:grid">
                <div>
                  <Link href={`/leads/${lead.id}`} className="font-medium text-slate-950 underline-offset-4 hover:underline dark:text-white">
                    {lead.full_name}
                  </Link>
                  <p className="mt-1 text-sm text-slate-500">{lead.email || "No email"}</p>
                  <p className="mt-1 text-xs text-slate-500">Assigned to {lead.assigned_to_label}</p>
                </div>
                <div>
                  <p className="font-medium text-slate-700 dark:text-slate-300">{lead.company || "No company"}</p>
                  <p className="mt-1 text-sm text-slate-500">{lead.city || "No city"}</p>
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-400">{lead.source}</div>
                <div>
                  <StatusBadge tone={getLeadStatusTone(lead.status)}>{getLeadStatusLabel(lead.status)}</StatusBadge>
                </div>
                <div className="text-sm font-medium text-slate-950 dark:text-white">
                  {formatCurrency(lead.estimated_value, lead.currency)}
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-400">
                  <div>{lead.next_follow_up_at ? formatDateTime(lead.next_follow_up_at) : "Not set"}</div>
                  <div className="mt-1">
                    <StatusBadge tone={formatLeadFollowUpState(lead.next_follow_up_at).tone}>
                      {formatLeadFollowUpState(lead.next_follow_up_at).label}
                    </StatusBadge>
                  </div>
                </div>
              </div>

              <div className="space-y-4 lg:hidden">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Link href={`/leads/${lead.id}`} className="font-medium text-slate-950 underline-offset-4 hover:underline dark:text-white">
                      {lead.full_name}
                    </Link>
                    <p className="mt-1 text-sm text-slate-500">{lead.company || "No company"}</p>
                  </div>
                  <StatusBadge tone={getLeadStatusTone(lead.status)}>{getLeadStatusLabel(lead.status)}</StatusBadge>
                </div>

                <div className="flex flex-wrap gap-2">
                  <StatusBadge tone="neutral">{lead.source}</StatusBadge>
                  <StatusBadge tone="neutral">{lead.assigned_to_label}</StatusBadge>
                  <StatusBadge tone={formatLeadFollowUpState(lead.next_follow_up_at).tone}>
                    {formatLeadFollowUpState(lead.next_follow_up_at).label}
                  </StatusBadge>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Value</p>
                    <p className="mt-1 text-sm font-medium text-slate-950 dark:text-white">
                      {formatCurrency(lead.estimated_value, lead.currency)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Follow-up</p>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                      {lead.next_follow_up_at ? formatDateTime(lead.next_follow_up_at) : "Not set"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/leads/${lead.id}`}
                    className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
                  >
                    View
                  </Link>
                  <Link
                    href={`/leads/${lead.id}/edit?redirect_to=${encodeURIComponent(redirectTo)}`}
                    className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
                  >
                    Edit
                  </Link>
                  <LeadDeleteDialog leadId={lead.id} leadName={lead.full_name} redirectTo={redirectTo} />
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </SectionCard>
  );
}

function LeadPipelineView({
  leads,
  redirectTo,
}: {
  leads: Awaited<ReturnType<typeof getLeadPageData>>["leads"];
  redirectTo: string;
}) {
  const grouped = Object.fromEntries(LEAD_STATUSES.map((status) => [status.value, leads.filter((lead) => lead.status === status.value)]));

  return (
    <SectionCard title="Pipeline" description="Move leads between stages without leaving the board.">
      <div className="grid gap-4 xl:grid-cols-3 2xl:grid-cols-4">
        {LEAD_STATUSES.map((status) => (
          <div
            key={status.value}
            className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/5"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950 dark:text-white">{status.label}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">{grouped[status.value].length} leads</p>
              </div>
              <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
            </div>

            <div className="mt-4 space-y-3">
              {grouped[status.value].length ? (
                grouped[status.value].map((lead) => (
                  <article
                    key={lead.id}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_32px_rgba(15,23,42,0.03)] dark:border-white/10 dark:bg-slate-950/70"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <Link href={`/leads/${lead.id}`} className="font-medium text-slate-950 underline-offset-4 hover:underline dark:text-white">
                          {lead.full_name}
                        </Link>
                        <p className="mt-1 text-sm text-slate-500">{lead.company || "No company"}</p>
                      </div>
                      <StatusBadge tone={getLeadStatusTone(lead.status)}>{getLeadStatusLabel(lead.status)}</StatusBadge>
                    </div>

                    <div className="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-400">
                      <p>{formatCurrency(lead.estimated_value, lead.currency)}</p>
                      <p>Assigned to {lead.assigned_to_label}</p>
                      <p>{lead.next_follow_up_at ? formatDateTime(lead.next_follow_up_at) : "No follow-up"}</p>
                    </div>

                    <div className="mt-4">
                      <LeadStatusMenu
                        leadId={lead.id}
                        currentStatus={lead.status}
                        redirectTo={redirectTo}
                        label="Save stage"
                        compact
                      />
                    </div>
                  </article>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
                  No leads in this stage.
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function PageNavLink({
  href,
  children,
  active,
  disabled,
}: {
  href: string;
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
}) {
  const className = [
    "inline-flex h-10 min-w-10 items-center justify-center rounded-2xl border px-3 text-sm font-medium transition",
    active
      ? "border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950"
      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10",
    disabled ? "pointer-events-none opacity-50" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Link href={href} className={className} aria-disabled={disabled}>
      {children}
    </Link>
  );
}
