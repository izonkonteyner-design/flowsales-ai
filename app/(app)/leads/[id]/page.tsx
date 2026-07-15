import Link from "next/link";
import type { ComponentType } from "react";
import { ArrowLeft, CalendarClock, Mail, MessageSquare, Phone, PencilLine, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { getLeadById, getActivities } from "@/server/services/crm-data";

type LeadDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function LeadDetailPage({ params }: LeadDetailPageProps) {
  const { id } = await params;
  const lead = getLeadById(id);
  const activities = getActivities().filter((activity) => activity.lead_id === id);

  if (!lead) {
    return (
      <EmptyState
        title="Lead not found"
        description="The requested record does not exist in the current workspace."
        actionHref="/leads"
        actionLabel="Back to leads"
      />
    );
  }

  const tone =
    lead.status === "won"
      ? "success"
      : lead.status === "lost"
        ? "danger"
        : lead.status === "quote_sent" || lead.status === "negotiation"
          ? "warning"
          : "info";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Lead detail"
        title={lead.full_name}
        description={`${lead.company} · ${lead.city}`}
        actions={
          <>
            <Link
              href="/leads"
              className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
            <button className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10">
              <PencilLine className="h-4 w-4" />
              Edit
            </button>
            <button className="inline-flex h-10 items-center gap-2 rounded-2xl bg-rose-600 px-4 text-sm font-medium text-white transition hover:bg-rose-500">
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <SectionCard title="Overview" description="Core CRM details and the latest conversation context.">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge tone={tone}>{lead.status.replace("_", " ")}</StatusBadge>
            <StatusBadge tone="neutral">{lead.source}</StatusBadge>
            <StatusBadge tone="neutral">{lead.assigned_to}</StatusBadge>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
              <p className="text-sm text-slate-500">Estimated value</p>
              <p className="mt-2 text-lg font-semibold text-slate-950 dark:text-white">
                {formatCurrency(lead.estimated_value, lead.currency)}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
              <p className="text-sm text-slate-500">Next follow-up</p>
              <p className="mt-2 text-lg font-semibold text-slate-950 dark:text-white">
                {lead.next_follow_up_at ? formatDateTime(lead.next_follow_up_at) : "Not set"}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <ContactItem icon={Mail} label="Email" value={lead.email} />
            <ContactItem icon={Phone} label="Phone" value={lead.phone} />
            <ContactItem icon={CalendarClock} label="Created" value={formatDateTime(lead.created_at)} />
            <ContactItem icon={MessageSquare} label="Notes" value={lead.notes} />
          </div>
        </SectionCard>

        <SectionCard title="Activity timeline" description="A running log of lead updates and touchpoints.">
          {activities.length ? (
            <div className="space-y-3">
              {activities.map((activity) => (
                <div
                  key={activity.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5"
                >
                  <p className="font-medium text-slate-950 dark:text-white">{activity.title}</p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{activity.detail}</p>
                  <p className="mt-2 text-xs text-slate-500">{formatDateTime(activity.created_at)}</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No activity yet"
              description="Add a call note, task completion, or quote update to start the timeline."
            />
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function ContactItem({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <p className="mt-2 text-sm font-medium text-slate-950 dark:text-white">{value}</p>
    </div>
  );
}
