import { FlashToast } from "@/components/shared/flash-toast";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { WorkspaceSettingsForm } from "@/components/settings/workspace-settings-form";
import { removeWorkspaceLogoAction, updateWorkspaceSettingsAction } from "@/app/(app)/settings/actions";
import { getWorkspaceCompanySettingsData } from "@/server/services/workspace-settings";

type SettingsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const [data, rawSearchParams] = await Promise.all([getWorkspaceCompanySettingsData(), searchParams]);
  const toastMessage = typeof rawSearchParams.toast === "string" ? rawSearchParams.toast : "";
  const toastTone =
    rawSearchParams.tone === "danger" || rawSearchParams.tone === "warning" || rawSearchParams.tone === "info"
      ? rawSearchParams.tone
      : "success";

  return (
    <div className="space-y-6">
      {toastMessage ? <FlashToast message={toastMessage} tone={toastTone} /> : null}

      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Manage company branding, quote defaults, and the secure logo asset used across documents."
        actions={
          <StatusBadge tone={data.canEdit ? "success" : data.mode === "demo" ? "warning" : "neutral"}>
            {data.mode === "demo" ? "Demo workspace" : data.canEdit ? "Editable" : "Read only"}
          </StatusBadge>
        }
      />

      {data.error ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-100">
          {data.error}
        </div>
      ) : null}

      {data.settings ? (
        <WorkspaceSettingsForm
          settings={data.settings}
          canEdit={data.canEdit}
          mode={data.mode}
          updateAction={updateWorkspaceSettingsAction}
          removeLogoAction={removeWorkspaceLogoAction}
        />
      ) : null}
    </div>
  );
}

