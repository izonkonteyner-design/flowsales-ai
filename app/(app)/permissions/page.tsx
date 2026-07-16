import { Lock, ShieldCheck, UsersRound } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { ORGANIZATION_ROLES } from "@/lib/constants";

export default function PermissionsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Security"
        title="Permissions"
        description="Define who can view, edit, approve, and administer workspace data."
        actions={
          <div className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
            <ShieldCheck className="h-4 w-4" />
            Tenant-safe
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <SectionCard title="Role matrix" description="The application currently recognizes these roles.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {ORGANIZATION_ROLES.map((role) => (
              <RoleCard key={role} role={role} />
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Access principles" description="How we keep the workspace secure.">
          <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
            <Rule title="Least privilege" detail="Users only get the access needed for their work." />
            <Rule title="Tenant isolation" detail="All records are scoped to the active organization." />
            <Rule title="Server checks" detail="Sensitive actions must always be validated on the server." />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function RoleCard({ role }: { role: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
      <div className="flex items-center gap-2">
        <UsersRound className="h-4 w-4 text-slate-400" />
        <p className="font-medium text-slate-950 dark:text-white">{role}</p>
      </div>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        {role === "owner"
          ? "Full administrative control."
          : role === "admin"
            ? "Manage workspace settings and team."
            : role === "sales"
              ? "Handle CRM operations."
              : "Read-only access."}
      </p>
    </div>
  );
}

function Rule({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
      <div className="flex items-center gap-2">
        <Lock className="h-4 w-4 text-slate-400" />
        <p className="font-medium text-slate-950 dark:text-white">{title}</p>
      </div>
      <p className="mt-1">{detail}</p>
    </div>
  );
}
