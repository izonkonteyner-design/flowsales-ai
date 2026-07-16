import Link from "next/link";
import type { ComponentType } from "react";
import {
  ArrowLeft,
  CalendarClock,
  CheckSquare2,
  Mail,
  MessageSquare,
  PencilLine,
  Phone,
  Plus,
  Target,
} from "lucide-react";

import { addLeadNoteAction, createLeadTaskAction, scheduleLeadFollowUpAction } from "@/app/(app)/leads/actions";
import { LeadDeleteDialog } from "@/components/leads/lead-delete-dialog";
import { LeadStatusMenu } from "@/components/leads/lead-status-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { FlashToast } from "@/components/shared/flash-toast";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TASK_PRIORITIES } from "@/lib/constants";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { getLeadDetailData } from "@/server/services/leads";
import {
  formatLeadFollowUpState,
  getLeadStatusLabel,
  getLeadStatusTone,
} from "@/server/services/lead-domain";
import type { Task } from "@/types/crm";

type LeadDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LeadDetailPage({ params, searchParams }: LeadDetailPageProps) {
  const { id } = await params;
  const rawSearchParams = await searchParams;
  const data = await getLeadDetailData(id);
  const toastMessage = typeof rawSearchParams.toast === "string" ? rawSearchParams.toast : "";
  const toastTone =
    rawSearchParams.tone === "danger" || rawSearchParams.tone === "warning" || rawSearchParams.tone === "info"
      ? rawSearchParams.tone
      : "success";
  const redirectTo = `/leads/${id}`;

  if (!data.lead) {
    return (
      <EmptyState
        title="Lead not found"
        description="The requested record does not exist in the current organization."
        actionHref="/leads"
        actionLabel="Back to leads"
      />
    );
  }

  const lead = data.lead;
  const followUpState = formatLeadFollowUpState(lead.next_follow_up_at);
  const assignedMember = data.context.members.find((member) => member.user_id === lead.assigned_to);
  const leadDetailHref = `/leads/${lead.id}/edit?redirect_to=${encodeURIComponent(redirectTo)}`;
  const canMutate = data.context.role === "owner" || data.context.role === "admin" || data.context.role === "sales";

  return (
    <div className="space-y-6">
      {toastMessage ? <FlashToast message={toastMessage} tone={toastTone} /> : null}

      <PageHeader
        eyebrow="Lead detail"
        title={lead.full_name}
        description={`${lead.company || "No company"} · ${lead.city || "No city"}`}
        actions={
          <>
            <Link
              href="/leads"
              className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
            {canMutate ? (
              <Link
                href={leadDetailHref}
                className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
              >
                <PencilLine className="h-4 w-4" />
                Edit
              </Link>
            ) : null}
            {canMutate ? (
              <LeadDeleteDialog leadId={lead.id} leadName={lead.full_name} redirectTo="/leads" />
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
        <SectionCard title="Lead summary" description="Core CRM context and quick actions.">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge tone={getLeadStatusTone(lead.status)}>{getLeadStatusLabel(lead.status)}</StatusBadge>
            <StatusBadge tone="neutral">{lead.source}</StatusBadge>
            <StatusBadge tone="neutral">{lead.assigned_to_label}</StatusBadge>
            <StatusBadge tone={followUpState.tone}>{followUpState.label}</StatusBadge>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <StatCard label="Estimated value" value={formatCurrency(lead.estimated_value, lead.currency)} />
            <StatCard
              label="Next follow-up"
              value={lead.next_follow_up_at ? formatDateTime(lead.next_follow_up_at) : "Not set"}
              tone={followUpState.tone}
            />
            <StatCard label="Created by" value={lead.created_by_label} />
            <StatCard
              label="Assigned user"
              value={assignedMember ? `${assignedMember.full_name} (${assignedMember.role})` : lead.assigned_to_label}
            />
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <ContactItem icon={Mail} label="Email" value={lead.email || "Not set"} />
            <ContactItem icon={Phone} label="Phone" value={lead.phone || "Not set"} />
            <ContactItem icon={Target} label="Source" value={lead.source} />
            <ContactItem icon={CalendarClock} label="Created" value={formatDateTime(lead.created_at)} />
          </div>

          <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
            <p className="text-sm font-medium text-slate-950 dark:text-white">Notes</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-400">
              {lead.notes || "No notes yet."}
            </p>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            {canMutate ? (
              <LeadStatusMenu leadId={lead.id} currentStatus={lead.status} redirectTo={redirectTo} />
            ) : null}
            {canMutate ? (
              <Link
                href={leadDetailHref}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
              >
                Edit lead
              </Link>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard title="Quick actions" description="Add activity without leaving the lead.">
          {canMutate ? (
            <div className="space-y-5">
              <form action={addLeadNoteAction} className="space-y-3">
                <input type="hidden" name="lead_id" value={lead.id} />
                <input type="hidden" name="redirect_to" value={redirectTo} />
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Add note</span>
                  <Textarea name="note" placeholder="Capture the latest call, objection, or next step." rows={4} />
                </label>
                <button
                  type="submit"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950"
                >
                  <MessageSquare className="h-4 w-4" />
                  Save note
                </button>
              </form>

              <form action={scheduleLeadFollowUpAction} className="space-y-3">
                <input type="hidden" name="lead_id" value={lead.id} />
                <input type="hidden" name="redirect_to" value={redirectTo} />
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Schedule follow-up</span>
                  <Input name="next_follow_up_at" type="date" defaultValue={lead.next_follow_up_at?.slice(0, 10) ?? ""} />
                </label>
                <button
                  type="submit"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
                >
                  <Plus className="h-4 w-4" />
                  Save follow-up
                </button>
              </form>

              <form action={createLeadTaskAction} className="space-y-3">
                <input type="hidden" name="lead_id" value={lead.id} />
                <input type="hidden" name="redirect_to" value={redirectTo} />
                <div className="grid gap-3">
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Task title</span>
                    <Input name="title" placeholder="Follow up with procurement" />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Due date</span>
                      <Input name="due_at" type="date" />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Priority</span>
                      <Select name="priority" defaultValue="medium">
                        {TASK_PRIORITIES.map((priority) => (
                          <option key={priority.value} value={priority.value}>
                            {priority.label}
                          </option>
                        ))}
                      </Select>
                    </label>
                  </div>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Assigned to</span>
                    <Select name="assigned_to" defaultValue="">
                      <option value="">Use current user</option>
                      {data.context.members.map((member) => (
                        <option key={member.user_id} value={member.user_id}>
                          {member.full_name}
                        </option>
                      ))}
                    </Select>
                  </label>
                </div>
                <button
                  type="submit"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950"
                >
                  <CheckSquare2 className="h-4 w-4" />
                  Create task
                </button>
              </form>
            </div>
          ) : (
            <EmptyState
              title="Read-only access"
              description="Viewer permissions can inspect leads but cannot create notes, follow-ups, tasks, or edits."
            />
          )}
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <SectionCard title="Activity timeline" description="Newest updates appear first.">
          {data.activities.length ? (
            <div className="space-y-3">
              {data.activities.map((activity) => (
                <article
                  key={activity.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-slate-950 dark:text-white">{activity.title}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-400">{activity.detail}</p>
                    </div>
                    <StatusBadge tone="info">{activity.type.replace("_", " ")}</StatusBadge>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">{formatDateTime(activity.created_at)}</p>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No activity yet"
              description="Add notes, schedule a follow-up, or create a task to start the timeline."
            />
          )}
        </SectionCard>

        <SectionCard title="Tasks" description="Lead-related actions and reminders.">
          {data.tasks.length ? (
            <div className="space-y-3">
              {data.tasks.map((task: Task) => (
                <article
                  key={task.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-slate-950 dark:text-white">{task.title}</p>
                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                        Due {formatDateTime(task.due_at)}
                      </p>
                    </div>
                    <StatusBadge tone={task.priority === "high" ? "danger" : task.priority === "medium" ? "warning" : "info"}>
                      {task.priority}
                    </StatusBadge>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="No tasks yet" description="Create a task from the quick actions panel." />
          )}
        </SectionCard>
      </div>

      <SectionCard title="Lead context" description="Security and organization details for this record.">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MiniDetail label="Organization" value={data.context.organization.name} />
          <MiniDetail label="Role" value={data.context.role} />
          <MiniDetail label="Lead ID" value={lead.id} />
          <MiniDetail label="Updated" value={formatDateTime(lead.updated_at)} />
        </div>
      </SectionCard>
    </div>
  );
}

function StatCard({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "info" | "warning" | "success" | "danger" }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
      <p className="text-sm text-slate-500">{label}</p>
      <div className="mt-2 flex items-center gap-2">
        <p className="text-base font-semibold text-slate-950 dark:text-white">{value}</p>
        <StatusBadge tone={tone}>{tone}</StatusBadge>
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

function MiniDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-slate-950 dark:text-white">{value}</p>
    </div>
  );
}
