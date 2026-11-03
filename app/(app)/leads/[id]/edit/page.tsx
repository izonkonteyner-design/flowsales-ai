import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { updateLeadAction } from "@/app/(app)/leads/actions";
import { LeadForm } from "@/components/leads/lead-form";
import { EmptyState } from "@/components/shared/empty-state";
import { FlashToast } from "@/components/shared/flash-toast";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { getLeadDetailData } from "@/server/services/leads";
import { canMutateLeadRecord, getLeadRecordRestrictionMessage } from "@/server/services/lead-domain";

type LeadEditPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LeadEditPage({ params, searchParams }: LeadEditPageProps) {
  const { id } = await params;
  const rawSearchParams = await searchParams;
  const data = await getLeadDetailData(id);
  const redirectTo =
    typeof rawSearchParams.redirect_to === "string" && rawSearchParams.redirect_to.startsWith("/")
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
        title="Müşteri adayı bulunamadı"
        description="Talep edilen kayıt mevcut organizasyonda bulunamadı veya silinmiş olabilir."
        actionHref="/leads"
        actionLabel="Adaylar Listesine Dön"
      />
    );
  }

  const canMutate = canMutateLeadRecord(data.lead.recordMode, data.context.role);
  const restrictionMessage = getLeadRecordRestrictionMessage(data.lead.recordMode, data.context.role);

  return (
    <div className="space-y-5">
      {toastMessage ? <FlashToast message={toastMessage} tone={toastTone} /> : null}

      <PageHeader
        eyebrow="Satış & Fırsat Yönetimi"
        title={`${data.lead.full_name} — Düzenle`}
        description="Organizasyon sınırları korunarak aday verilerini güncelleyin."
        actions={
          <Link
            href={`/leads/${id}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Detaya Dön
          </Link>
        }
      />

      <SectionCard title="Aday Bilgilerini Güncelle" description="Doğrulanmış düzenlemeler sunucu eylemi üzerinden kaydedilir.">
        {canMutate ? (
          <LeadForm
            action={updateLeadAction}
            redirectTo={redirectTo}
            lead={data.lead}
            members={data.context.members}
            submitLabel="Değişiklikleri Kaydet"
            leadId={data.lead.id}
          />
        ) : (
          <EmptyState title="Yalnızca Okuma Erişimi" description={restrictionMessage} />
        )}
      </SectionCard>
    </div>
  );
}
