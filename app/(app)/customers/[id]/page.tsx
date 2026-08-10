import Link from "next/link";
import { ArrowLeft, Bot, ExternalLink, MessageSquarePlus, Phone, Workflow } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { getCustomer360Timeline } from "@/server/services/customer-360";
import { getCustomerDetailData, getCustomerRecordInfo } from "@/server/services/customers";
import { loadWorkspaceContext } from "@/server/services/workspace-context";

type CustomerDetailPageProps = { params: Promise<{ id: string }> };

export default async function CustomerDetailPage({ params }: CustomerDetailPageProps) {
  const { id } = await params;
  const [data, workspace] = await Promise.all([getCustomerDetailData(id), loadWorkspaceContext()]);

  if (!data.customer) {
    return <EmptyState title="Müşteri bulunamadı" description={data.error ?? "İstenen müşteri bu çalışma alanında bulunmuyor."} actionHref="/customers" actionLabel="Müşterilere dön" />;
  }

  const customer = data.customer;
  const recordInfo = getCustomerRecordInfo(customer.recordMode);
  const timeline = workspace
    ? await getCustomer360Timeline({ organizationId: workspace.organization.id, customerId: customer.id, sourceLeadId: data.sourceLead?.id ?? null }).catch(() => [])
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Customer 360"
        title={customer.name}
        description={`${customer.company || "Şirket belirtilmedi"} · ${customer.city || "Şehir belirtilmedi"}`}
        actions={<>
          <Link href="/customers" className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"><ArrowLeft className="h-4 w-4" />Geri</Link>
          <Link href={`/quotes/new?customer_id=${encodeURIComponent(customer.id)}&redirect_to=${encodeURIComponent(`/customers/${customer.id}`)}`} className="inline-flex h-10 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950"><MessageSquarePlus className="h-4 w-4" />Teklif oluştur</Link>
        </>}
      />

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
        <SectionCard title="Müşteri özeti" description="CRM hesabı, ticari değer ve ilişki durumunun tek görünümü.">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={recordInfo.tone} title={recordInfo.title}>{recordInfo.label}</StatusBadge>
            <Badge variant="secondary">{customer.segment}</Badge>
            <Badge variant="secondary">{customer.quote_count ?? 0} teklif</Badge>
            <Badge variant="secondary">{formatCurrency(customer.lifetime_value, data.context.organization.currency)}</Badge>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Info label="E-posta" value={customer.email || "Belirtilmedi"} />
            <Info label="Telefon" value={customer.phone || "Belirtilmedi"} />
            <Info label="Kaynak lead" value={data.sourceLead ? data.sourceLead.full_name : "Bağlı lead yok"} />
            <Info label="Son teklif" value={customer.last_quote_at ? formatDateTime(customer.last_quote_at) : "Henüz teklif yok"} />
            <Info label="Müşteriye dönüşüm" value={customer.converted_at ? formatDateTime(customer.converted_at) : "Kaydedilmedi"} />
            <Info label="Sonraki değerlendirme" value={customer.next_review_at ? formatDate(customer.next_review_at) : "Planlanmadı"} />
          </div>
        </SectionCard>

        <SectionCard title="Bağlı kayıtlar" description="Kaynak lead ve ilgili teklif geçmişine hızlı erişim.">
          <div className="space-y-4">
            {data.sourceLead ? <Link href={`/leads/${data.sourceLead.id}`} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"><div><p className="font-medium text-slate-950 dark:text-white">Kaynak lead</p><p className="mt-1 text-xs text-slate-500">{data.sourceLead.company || "Şirket belirtilmedi"}</p></div><ExternalLink className="h-4 w-4 text-slate-400" /></Link> : <p className="text-sm text-slate-500">Bu müşteriye bağlı kaynak lead yok.</p>}
            <div className="space-y-3">
              {data.relatedQuotes.length ? data.relatedQuotes.map((quote) => <Link key={quote.id} href={`/quotes/${quote.id}`} className="block rounded-2xl border border-slate-200 bg-white px-4 py-3 transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-950/60"><div className="flex items-start justify-between gap-3"><div><p className="font-medium text-slate-950 dark:text-white">{quote.quote_number}</p><p className="mt-1 text-xs text-slate-500">{formatDate(quote.issue_date)}</p></div><StatusBadge tone="neutral">{quote.status}</StatusBadge></div><div className="mt-3 flex items-center justify-between text-sm text-slate-600 dark:text-slate-400"><span>{quote.currency}</span><span>{formatCurrency(quote.grand_total ?? quote.total ?? 0, quote.currency)}</span></div></Link>) : <p className="text-sm text-slate-500">Henüz ilgili teklif yok.</p>}
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Customer 360 zaman çizelgesi" description="Telefon, CRM aktivitesi ve AI satış zekâsı aynı müşteri geçmişinde kronolojik olarak birleştirilir.">
        {timeline.length ? <div className="space-y-3">{timeline.map((event) => {
          const Icon = event.kind === "phone" ? Phone : event.kind === "ai" ? Bot : Workflow;
          const body = <div className="flex gap-3 rounded-2xl border border-slate-200 p-4 dark:border-white/10"><div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300"><Icon className="h-4 w-4" /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-medium text-slate-950 dark:text-white">{event.title}</p><span className="text-xs text-slate-500">{formatDateTime(event.at)}</span></div><p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-400">{event.detail}</p></div></div>;
          return event.href ? <Link key={event.id} href={event.href} className="block transition hover:opacity-90">{body}</Link> : <div key={event.id}>{body}</div>;
        })}</div> : <p className="text-sm text-slate-500">Henüz zaman çizelgesine eklenecek telefon, CRM veya AI aktivitesi bulunmuyor.</p>}
      </SectionCard>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-sm font-medium text-slate-950 dark:text-white">{value}</p></div>;
}
