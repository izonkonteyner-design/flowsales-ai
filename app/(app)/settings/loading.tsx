import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";

export default function SettingsLoadingPage() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Workspace" title="Settings" description="Loading workspace branding and quote defaults..." />

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="space-y-6">
          <SectionCard className="animate-pulse" title="Workspace branding" description="Preparing your company profile.">
            <div className="h-80 rounded-3xl bg-slate-100 dark:bg-white/5" />
          </SectionCard>
          <SectionCard className="animate-pulse" title="Quote defaults" description="Loading defaults for new quotes.">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="h-11 rounded-2xl bg-slate-100 dark:bg-white/5" />
              <div className="h-11 rounded-2xl bg-slate-100 dark:bg-white/5" />
              <div className="h-11 rounded-2xl bg-slate-100 dark:bg-white/5" />
              <div className="h-11 rounded-2xl bg-slate-100 dark:bg-white/5" />
            </div>
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard className="animate-pulse" title="Quote brand preview" description="Loading branded document preview.">
            <div className="h-64 rounded-3xl bg-slate-100 dark:bg-white/5" />
          </SectionCard>
          <SectionCard className="animate-pulse" title="Access rules" description="Checking role permissions.">
            <div className="h-40 rounded-3xl bg-slate-100 dark:bg-white/5" />
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

