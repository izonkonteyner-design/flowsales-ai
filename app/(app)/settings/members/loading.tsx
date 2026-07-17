import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";

export default function MembersLoading() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workspace"
        title="Members"
        description="Loading members and invitations..."
      />

      <SectionCard className="animate-pulse" title="Search" description="Preparing filters and data.">
        <div className="h-11 rounded-2xl bg-slate-200 dark:bg-white/10" />
      </SectionCard>

      <SectionCard className="animate-pulse" title="Current members" description="Loading team access.">
        <div className="space-y-3">
          <div className="h-20 rounded-2xl bg-slate-200 dark:bg-white/10" />
          <div className="h-20 rounded-2xl bg-slate-200 dark:bg-white/10" />
        </div>
      </SectionCard>
    </div>
  );
}
