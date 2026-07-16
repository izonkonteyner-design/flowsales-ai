import { Plus, Search } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import { getTasks, getLeadById } from "@/server/services/crm-data";

export default function TasksPage() {
  const tasks = getTasks();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Tasks"
        description="Keep follow-ups visible with due dates, priorities, and lead-linked actions."
        actions={
          <button className="inline-flex h-10 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950">
            <Plus className="h-4 w-4" />
            New task
          </button>
        }
      />

      <SectionCard title="Task board" description="Open work queued for the team today and this week.">
        <div className="mb-4 relative max-w-xl">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Search tasks, leads, or assignees" className="pl-10" />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {tasks.map((task) => {
            const lead = getLeadById(task.lead_id ?? "");
            return (
              <article
                key={task.id}
                className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium text-slate-950 dark:text-white">{task.title}</p>
                    <p className="mt-1 text-sm text-slate-500">{lead?.full_name ?? "No lead linked"}</p>
                  </div>
                  <StatusBadge tone={task.priority === "high" ? "danger" : task.priority === "medium" ? "warning" : "neutral"}>
                    {task.priority}
                  </StatusBadge>
                </div>

                <div className="mt-4 space-y-2 text-sm">
                  <Row label="Due" value={formatDateTime(task.due_at)} />
                  <Row label="Assigned" value={task.assigned_to} />
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <Badge variant="secondary">{task.status}</Badge>
                  <Badge variant="secondary">{lead?.company ?? "Standalone"}</Badge>
                </div>
              </article>
            );
          })}
        </div>

        {!tasks.length ? (
          <div className="mt-6">
            <EmptyState
              title="No tasks yet"
              description="Create follow-ups and reminders so nothing falls through the cracks."
            />
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-950 dark:text-white">{value}</span>
    </div>
  );
}
