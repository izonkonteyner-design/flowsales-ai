import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { createLeadAction } from "@/app/(app)/leads/actions";
import { LeadForm } from "@/components/leads/lead-form";
import { FlashToast } from "@/components/shared/flash-toast";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { getLeadPageData } from "@/server/services/leads";

type LeadNewPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LeadNewPage({ searchParams }: LeadNewPageProps) {
  const rawSearchParams = await searchParams;
  const data = await getLeadPageData({});
  const redirectTo = typeof rawSearchParams.redirect_to === "string" && rawSearchParams.redirect_to.startsWith("/")
    ? rawSearchParams.redirect_to
    : "/leads";
  const toastMessage = typeof rawSearchParams.toast === "string" ? rawSearchParams.toast : "";
  const toastTone =
    rawSearchParams.tone === "danger" || rawSearchParams.tone === "warning" || rawSearchParams.tone === "info"
      ? rawSearchParams.tone
      : "success";

  return (
    <div className="space-y-6">
      {toastMessage ? <FlashToast message={toastMessage} tone={toastTone} /> : null}

      <PageHeader
        eyebrow="CRM"
        title="New lead"
        description="Create a lead that stays scoped to the current organization."
        actions={
          <Link
            href="/leads"
            className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to leads
          </Link>
        }
      />

      <SectionCard title="Lead details" description="Use the validated form to capture a new opportunity.">
        <LeadForm
          action={createLeadAction}
          redirectTo={redirectTo}
          members={data.context.members}
          submitLabel="Create lead"
        />
      </SectionCard>
    </div>
  );
}
