import { CheckCircle2, Mail, UserPlus } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { getTeamMembers } from "@/server/services/workspace-data";

export default function TeamPage() {
  const team = getTeamMembers();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workspace"
        title="Team"
        description="Manage seats, roles, and collaboration boundaries for the organization."
        actions={
          <button className="inline-flex h-10 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950">
            <UserPlus className="h-4 w-4" />
            Invite member
          </button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <SectionCard title="Members" description="Current team composition and access tier.">
          <div className="space-y-3">
            {team.map((member) => (
              <div
                key={member.id}
                className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:flex-row lg:items-center lg:justify-between dark:border-white/10 dark:bg-white/5"
              >
                <div>
                  <p className="font-medium text-slate-950 dark:text-white">{member.name}</p>
                  <p className="mt-1 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <Mail className="h-4 w-4" />
                    {member.email}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={member.role === "owner" ? "success" : member.role === "admin" ? "info" : "neutral"}>
                    {member.role}
                  </StatusBadge>
                  <StatusBadge tone={member.active ? "success" : "danger"}>{member.active ? "Active" : "Inactive"}</StatusBadge>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Team controls" description="Seat and permission boundaries.">
          <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
            <Control title="Seat limits" detail="Use plan limits to prevent over-allocation." />
            <Control title="Role based access" detail="Owner, admin, sales, and viewer roles are enforced in schema and app code." />
            <Control title="Onboarding" detail="Invite emails, setup checklists, and demo data help new users ramp quickly." />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function Control({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        <p className="font-medium text-slate-950 dark:text-white">{title}</p>
      </div>
      <p className="mt-1">{detail}</p>
    </div>
  );
}
