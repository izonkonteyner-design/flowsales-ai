import { cookies } from "next/headers";
import { LOCALE_COOKIE, normalizeLocale } from "@/lib/i18n";
import { canEditWorkspace } from "@/lib/workspace-access";
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
  const locale = normalizeLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  const text = (tr: string, en: string) => locale === "tr" ? tr : en;
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
        title={text("Yeni potansiyel müşteri", "New lead")}
        description={text("Çalışma alanınıza yeni bir satış fırsatı ekleyin.", "Add a new sales opportunity to your workspace.")}
        actions={
          <Link
            href="/leads"
            className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
            {text("Potansiyel müşterilere dön", "Back to leads")}
          </Link>
        }
      />

      <SectionCard title={text("Müşteri bilgileri", "Lead details")} description={text("Yeni fırsatın iletişim ve satış bilgilerini girin.", "Enter contact and sales information for the new opportunity.")}>
        {!canEditWorkspace(data.context) ? <p className="mb-4 text-sm text-amber-300">Salt okunur erişim. Potansiyel müşteri oluşturmak için yazma yetkisi gerekir.</p> : null}
        <LeadForm
          disabled={!canEditWorkspace(data.context)}
          action={createLeadAction}
          redirectTo={redirectTo}
          members={data.context.members}
          submitLabel={text("Potansiyel müşteri oluştur", "Create lead")}
        />
      </SectionCard>
    </div>
  );
}
