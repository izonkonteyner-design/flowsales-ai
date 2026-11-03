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
    return (
      <EmptyState
        title="Müşteri bulunamadı"
        description={data.error ?? "İstenen müşteri bu çalışma alanında bulunmuyor veya silinmiş olabilir."}
        actionHref="/customers"
        actionLabel="Müşterilere Dön"
      />
    );
  }

  const customer = data.customer;
  const recordInfo = getCustomerRecordInfo(customer.recordMode);
  const timeline = workspace
    ? await getCustomer360Timeline({
        organizationId: workspace.organization.id,
        customerId: customer.id,
        sourceLeadId: data.sourceLead?.id ?? null,
      }).catch(() => [])
    : [];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Müşteri 360° Çalışma Alanı"
        title={customer.name}
        description={`${customer.company || "Şirket belirtilmedi"} · ${customer.city || "Şehir belirtilmedi"}`}
        actions={
          <>
            <Link
              href="/customers"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Geri
            </Link>
            <Link
              href={`/quotes/new?customer_id=${encodeURIComponent(customer.id)}&redirect_to=${encodeURIComponent(
                `/customers/${customer.id}`,
              )}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-colors"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              Teklif Oluştur
            </Link>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <SectionCard title="Müşteri Özeti" description="CRM hesabı, ticari büyüklük ve ilişki durumu özeti.">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={recordInfo.tone} title={recordInfo.title}>
              {recordInfo.label}
            </StatusBadge>
            <Badge variant="secondary">{customer.segment}</Badge>
            <Badge variant="outline">{customer.quote_count ?? 0} Teklif</Badge>
            <Badge variant="outline">
              {formatCurrency(customer.lifetime_value, data.context.organization.currency)}
            </Badge>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Info label="E-posta Adresi" value={customer.email || "Belirtilmedi"} />
            <Info label="Telefon" value={customer.phone || "Belirtilmedi"} />
            <Info label="Kaynak Aday" value={data.sourceLead ? data.sourceLead.full_name : "Bağlı aday yok"} />
            <Info
              label="Son Teklif Tarihi"
              value={customer.last_quote_at ? formatDateTime(customer.last_quote_at) : "Henüz teklif yok"}
            />
            <Info
              label="Müşteriye Dönüşüm"
              value={customer.converted_at ? formatDateTime(customer.converted_at) : "Kaydedilmedi"}
            />
            <Info
              label="Sonraki İnceleme"
              value={customer.next_review_at ? formatDate(customer.next_review_at) : "Planlanmadı"}
            />
          </div>
        </SectionCard>

        <SectionCard title="Bağlı Kayıtlar & Teklifler" description="Kaynak müşteri adayı ve ilişkili teklif geçmişi.">
          <div className="space-y-3">
            {data.sourceLead ? (
              <Link
                href={`/leads/${data.sourceLead.id}`}
                className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs text-foreground hover:bg-muted/60 transition-colors"
              >
                <div>
                  <p className="font-semibold">{data.sourceLead.full_name}</p>
                  <p className="text-[11px] text-muted-foreground">{data.sourceLead.company || "Şirket yok"}</p>
                </div>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              </Link>
            ) : (
              <p className="text-xs text-muted-foreground">Bu müşteriye bağlı bir kaynak aday kaydı bulunmuyor.</p>
            )}

            <div className="space-y-2">
              <p className="text-xs font-bold text-foreground">İlişkili Teklifler</p>
              {data.relatedQuotes.length ? (
                data.relatedQuotes.map((quote) => (
                  <Link
                    key={quote.id}
                    href={`/quotes/${quote.id}`}
                    className="block rounded-lg border border-border bg-card p-3 shadow-xs hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-foreground">{quote.quote_number}</p>
                        <p className="text-[10px] text-muted-foreground">{formatDate(quote.issue_date)}</p>
                      </div>
                      <StatusBadge tone="neutral">{quote.status}</StatusBadge>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs font-semibold text-foreground border-t border-border pt-1.5">
                      <span className="text-muted-foreground text-[11px]">{quote.currency}</span>
                      <span>{formatCurrency(quote.grand_total ?? quote.total ?? 0, quote.currency)}</span>
                    </div>
                  </Link>
                ))
              ) : (
                <p className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                  Henüz kayıtlı teklif bulunmuyor.
                </p>
              )}
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Customer 360 Zaman Çizelgesi"
        description="Customer 360 zaman çizelgesi: Görüşmeler, CRM aktiviteleri ve teklif aşamaları tek zaman çizelgesinde izlenir."
      >
        {timeline.length ? (
          <div className="space-y-2.5">
            {timeline.map((event) => {
              const Icon = event.kind === "phone" ? Phone : event.kind === "ai" ? Bot : Workflow;
              const body = (
                <div className="flex gap-3 rounded-lg border border-border bg-card p-3 shadow-xs">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-foreground">{event.title}</p>
                      <span className="text-[10px] text-muted-foreground">{formatDateTime(event.at)}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{event.detail}</p>
                  </div>
                </div>
              );

              return event.href ? (
                <Link key={event.id} href={event.href} className="block transition hover:opacity-90">
                  {body}
                </Link>
              ) : (
                <div key={event.id}>{body}</div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-4">
            Henüz zaman çizelgesine yansıyacak telefon, CRM veya teklif aktivitesi bulunmuyor.
          </p>
        )}
      </SectionCard>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-xs">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <p className="mt-1 text-xs font-semibold text-foreground truncate">{value}</p>
    </div>
  );
}
