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
  const redirectTo =
    typeof rawSearchParams.redirect_to === "string" && rawSearchParams.redirect_to.startsWith("/")
      ? rawSearchParams.redirect_to
      : "/leads";
  const toastMessage = typeof rawSearchParams.toast === "string" ? rawSearchParams.toast : "";
  const toastTone =
    rawSearchParams.tone === "danger" || rawSearchParams.tone === "warning" || rawSearchParams.tone === "info"
      ? rawSearchParams.tone
      : "success";

  return (
    <div className="space-y-5">
      {toastMessage ? <FlashToast message={toastMessage} tone={toastTone} /> : null}

      <PageHeader
        eyebrow="Satış & Fırsat Yönetimi"
        title="Yeni Müşteri Adayı Ekle"
        description="Mevcut organizasyon kapsamında doğrulanmış yeni bir satış fırsatı oluşturun."
        actions={
          <Link
            href="/leads"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Adaylar Listesine Dön
          </Link>
        }
      />

      <SectionCard
        title="Aday Bilgileri"
        description="Formu doldurarak adayı sisteme kaydedin. Değerler sunucuda doğrulanır."
      >
        <LeadForm
          action={createLeadAction}
          redirectTo={redirectTo}
          members={data.context.members}
          submitLabel="Müşteri Adayını Kaydet"
        />
      </SectionCard>
    </div>
  );
}
