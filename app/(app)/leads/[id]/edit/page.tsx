import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { updateLeadAction } from "@/app/(app)/leads/actions";
import { LeadForm } from "@/components/leads/lead-form";
import { EmptyState } from "@/components/shared/empty-state";
import { FlashToast } from "@/components/shared/flash-toast";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { getLeadDetailData } from "@/server/services/leads";

type LeadEditPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LeadEditPage({ params, searchParams }: LeadEditPageProps) {
  const { id } = await params;
  const rawSearchParams = await searchParams;
  const data = await getLeadDetailData(id);
  const redirectTo = typeof rawSearchParams.redirect_to === "string" && rawSearchParams.redirect_to.startsWith("/")
    ? rawSearchParams.redirect_to
    : `/leads/${id}`;
  const toastMessage = typeof rawSearchParams.toast === "string" ? rawSearchParams.toast : "";
  const toastTone =
    rawSearchParams.tone === "danger" || rawSearchParams.tone === "warning" || rawSearchParams.tone === "info"
      ? rawSearchParams.tone
      : "success";

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

  return (
    <div className="space-y-6">
      {toastMessage ? <FlashToast message={toastMessage} tone={toastTone} /> : null}

      <PageHeader
        eyebrow="CRM"
        title={`Edit ${data.lead.full_name}`}
        description="Update the lead while preserving its organization scope."
        actions={
          <Link
            href={`/leads/${id}`}
            className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to lead
          </Link>
        }
      />

      <SectionCard title="Lead details" description="Validated edits are persisted through a secure server action.">
        <LeadForm
          action={updateLeadAction}
          redirectTo={redirectTo}
          lead={data.lead}
          members={data.context.members}
          submitLabel="Save changes"
          leadId={data.lead.id}
        />
      </SectionCard>
    </div>
  );
}
