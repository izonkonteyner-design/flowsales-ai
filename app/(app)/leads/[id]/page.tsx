import Link from "next/link";
import type { ComponentType } from "react";
import {
  ArrowLeft,
  CalendarClock,
  CheckSquare2,
  Mail,
  MessageSquare,
  MessageSquarePlus,
  PencilLine,
  Phone,
  Plus,
  Target,
} from "lucide-react";

import {
  addLeadNoteAction,
  convertLeadToCustomerAction,
  createLeadTaskAction,
  scheduleLeadFollowUpAction,
} from "@/app/(app)/leads/actions";
import { LeadDeleteDialog } from "@/components/leads/lead-delete-dialog";
import { LeadStatusMenu } from "@/components/leads/lead-status-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { FlashToast } from "@/components/shared/flash-toast";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TASK_PRIORITIES } from "@/lib/constants";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { getLeadDetailData } from "@/server/services/leads";
import {
  formatLeadFollowUpState,
  canMutateLeadRecord,
  getLeadRecordBadge,
  getLeadRecordRestrictionMessage,
  getLeadStatusLabel,
  getLeadStatusTone,
} from "@/server/services/lead-domain";
import type { Task } from "@/types/crm";

type LeadDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LeadDetailPage({ params, searchParams }: LeadDetailPageProps) {
  const { id } = await params;
  const rawSearchParams = await searchParams;
  const data = await getLeadDetailData(id);
  const toastMessage = typeof rawSearchParams.toast === "string" ? rawSearchParams.toast : "";
  const toastTone =
    rawSearchParams.tone === "danger" || rawSearchParams.tone === "warning" || rawSearchParams.tone === "info"
      ? rawSearchParams.tone
      : "success";
  const redirectTo = `/leads/${id}`;

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

  const lead = data.lead;
  const followUpState = formatLeadFollowUpState(lead.next_follow_up_at);
  const assignedMember = data.context.members.find((member) => member.user_id === lead.assigned_to);
  const leadDetailHref = `/leads/${lead.id}/edit?redirect_to=${encodeURIComponent(redirectTo)}`;
  const canMutate = canMutateLeadRecord(lead.recordMode, data.context.role);
  const recordBadge = getLeadRecordBadge(lead.recordMode);
  const restrictionMessage = getLeadRecordRestrictionMessage(lead.recordMode, data.context.role);
  const createQuoteHref =
    lead.recordMode === "live"
      ? `/quotes/new?${new URLSearchParams(
          lead.converted_customer_id
            ? { lead_id: lead.id, customer_id: lead.converted_customer_id }
            : { lead_id: lead.id },
        ).toString()}`
      : `/quotes/new?lead_id=${encodeURIComponent(lead.id)}`;

  return (
    <div className="space-y-5">
      {toastMessage ? <FlashToast message={toastMessage} tone={toastTone} /> : null}

      <PageHeader
        eyebrow="Aday Detayı & Çalışma Alanı"
        title={lead.full_name}
        description={`${lead.company || "Şirket Yok"} · ${lead.city || "Şehir Yok"}`}
        actions={
          <>
            <Link
              href="/leads"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Geri
            </Link>
            {canMutate ? (
              <Link
                href={leadDetailHref}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted transition-colors"
              >
                <PencilLine className="h-3.5 w-3.5" />
                Düzenle
              </Link>
            ) : (
              <span
                title={restrictionMessage}
                className="inline-flex h-8 items-center rounded-md border border-border bg-background px-3 text-xs font-medium text-muted-foreground opacity-50 cursor-not-allowed"
              >
                Yalnızca Okuma
              </span>
            )}
            {canMutate ? (
              data.linkedCustomer ? (
                <Link
                  href={`/customers/${data.linkedCustomer.id}`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300 transition-colors"
                >
                  <MessageSquarePlus className="h-3.5 w-3.5" />
                  Müşteriye Bağlandı
                </Link>
              ) : (
                <form action={convertLeadToCustomerAction} className="inline-flex">
                  <input type="hidden" name="lead_id" value={lead.id} />
                  <input type="hidden" name="redirect_to" value={redirectTo} />
                  <button
                    type="submit"
                    className="inline-flex h-8 items-center gap-1.5 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 shadow-xs transition-colors"
                  >
                    <MessageSquarePlus className="h-3.5 w-3.5" />
                    Müşteriye Dönüştür
                  </button>
                </form>
              )
            ) : null}
            {canMutate ? (
              <Link
                href={createQuoteHref}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Teklif Hazırla
              </Link>
            ) : null}
            <LeadDeleteDialog
              leadId={lead.id}
              leadName={lead.full_name}
              redirectTo="/leads"
              recordMode={lead.recordMode}
              role={data.context.role}
            />
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <SectionCard title="Aday Özeti & Bilgileri" description="Temel CRM verileri ve operasyonel aksiyonlar.">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={getLeadStatusTone(lead.status)}>{getLeadStatusLabel(lead.status)}</StatusBadge>
            <StatusBadge tone="neutral">{lead.source}</StatusBadge>
            <StatusBadge tone="neutral">{lead.assigned_to_label}</StatusBadge>
            <StatusBadge tone={followUpState.tone}>{followUpState.label}</StatusBadge>
            <StatusBadge tone={recordBadge.tone} title={recordBadge.title}>
              {recordBadge.label}
            </StatusBadge>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <StatCard label="Tahmini Değer" value={formatCurrency(lead.estimated_value, lead.currency)} />
            <StatCard
              label="Sonraki Takip"
              value={lead.next_follow_up_at ? formatDateTime(lead.next_follow_up_at) : "Planlanmadı"}
              tone={followUpState.tone}
            />
            <StatCard label="Oluşturan" value={lead.created_by_label} />
            <StatCard
              label="Sorumlu Temsilci"
              value={assignedMember ? `${assignedMember.full_name} (${assignedMember.role})` : lead.assigned_to_label}
            />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex items-center gap-2">
                <StatusBadge tone={lead.converted_customer_id ? "success" : "neutral"}>
                  {lead.converted_customer_id ? "Müşteri Oluşturuldu" : "Henüz Dönüştürülmedi"}
                </StatusBadge>
                {lead.converted_at ? (
                  <Badge variant="secondary">{formatDateTime(lead.converted_at)}</Badge>
                ) : null}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {lead.converted_customer_id
                  ? "Bu aday kalıcı bir müşteri profiliyle ilişkilendirildi."
                  : "Nitelendirme tamamlandığında tek tıkla resmi müşteri fihristine aktarabilirsiniz."}
              </p>
              {data.linkedCustomer ? (
                <Link
                  href={`/customers/${data.linkedCustomer.id}`}
                  className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                >
                  Müşteri Kaydını Aç
                  <ArrowLeft className="h-3 w-3 rotate-180" />
                </Link>
              ) : null}
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs font-semibold text-foreground">Teklif Alıcısı Önizleme</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {data.linkedCustomer
                  ? `Bu adaydan oluşturulacak teklifler doğrudan ${data.linkedCustomer.name} müşterisine bağlanır.`
                  : "Müşteriye dönüştürülene kadar teklifler bu aday kartına bağlı kalır."}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <ContactItem icon={Mail} label="E-posta" value={lead.email || "Belirtilmedi"} />
            <ContactItem icon={Phone} label="Telefon" value={lead.phone || "Belirtilmedi"} />
            <ContactItem icon={Target} label="Kazanım Kaynağı" value={lead.source} />
            <ContactItem icon={CalendarClock} label="Kayıt Tarihi" value={formatDateTime(lead.created_at)} />
          </div>

          <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-xs font-semibold text-foreground">Görüşme Notları</p>
            <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground leading-relaxed">
              {lead.notes || "Henüz kaydedilmiş not yok."}
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 pt-2 border-t border-border">
            {canMutate ? (
              <LeadStatusMenu
                leadId={lead.id}
                currentStatus={lead.status}
                redirectTo={redirectTo}
                recordMode={lead.recordMode}
                role={data.context.role}
              />
            ) : null}
            {canMutate ? (
              <Link
                href={leadDetailHref}
                className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted transition-colors"
              >
                Adayı Düzenle
              </Link>
            ) : null}
          </div>
        </SectionCard>

        {/* Quick Actions Panel */}
        <SectionCard title="Hızlı Aksiyonlar" description="Sayfadan ayrılmadan not, takip veya görev ekleyin.">
          {canMutate ? (
            <div className="space-y-4">
              <form action={addLeadNoteAction} className="space-y-2">
                <input type="hidden" name="lead_id" value={lead.id} />
                <input type="hidden" name="redirect_to" value={redirectTo} />
                <label className="space-y-1 block">
                  <span className="text-xs font-medium text-foreground">Yeni Not Ekle</span>
                  <Textarea name="note" rows={3} placeholder="Görüşme detayı veya müşteri talebi..." />
                </label>
                <button
                  type="submit"
                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-colors"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Notu Kaydet
                </button>
              </form>

              <div className="pt-2 border-t border-border" />

              <form action={scheduleLeadFollowUpAction} className="space-y-2">
                <input type="hidden" name="lead_id" value={lead.id} />
                <input type="hidden" name="redirect_to" value={redirectTo} />
                <label className="space-y-1 block">
                  <span className="text-xs font-medium text-foreground">Takip Planla</span>
                  <Input
                    name="next_follow_up_at"
                    type="date"
                    defaultValue={lead.next_follow_up_at?.slice(0, 10) ?? ""}
                  />
                </label>
                <button
                  type="submit"
                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Takip Tarihini Güncelle
                </button>
              </form>

              <div className="pt-2 border-t border-border" />

              <form action={createLeadTaskAction} className="space-y-2">
                <input type="hidden" name="lead_id" value={lead.id} />
                <input type="hidden" name="redirect_to" value={redirectTo} />
                <label className="space-y-1 block">
                  <span className="text-xs font-medium text-foreground">Görev Başlığı</span>
                  <Input name="title" placeholder="Katalog gönder, randevu teyit..." />
                </label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="space-y-1 block">
                    <span className="text-xs font-medium text-foreground">Son Tarih</span>
                    <Input name="due_at" type="date" />
                  </label>
                  <label className="space-y-1 block">
                    <span className="text-xs font-medium text-foreground">Öncelik</span>
                    <Select name="priority" defaultValue="medium">
                      {TASK_PRIORITIES.map((priority) => (
                        <option key={priority.value} value={priority.value}>
                          {priority.label}
                        </option>
                      ))}
                    </Select>
                  </label>
                </div>
                <label className="space-y-1 block">
                  <span className="text-xs font-medium text-foreground">Atanan Kişi</span>
                  <Select name="assigned_to" defaultValue="">
                    <option value="">Geçerli kullanıcı</option>
                    {data.context.members.map((member) => (
                      <option key={member.user_id} value={member.user_id}>
                        {member.full_name}
                      </option>
                    ))}
                  </Select>
                </label>
                <button
                  type="submit"
                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-colors"
                >
                  <CheckSquare2 className="h-3.5 w-3.5" />
                  Görev Oluştur
                </button>
              </form>
            </div>
          ) : (
            <EmptyState title="Yalnızca Okuma Erişimi" description={restrictionMessage} />
          )}
        </SectionCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <SectionCard title="Aktivite Geçmişi" description="Kronolojik görüşme ve işlem kütüğü.">
          {data.activities.length ? (
            <div className="space-y-2">
              {data.activities.map((activity) => (
                <article
                  key={activity.id}
                  className="rounded-lg border border-border bg-card p-3 shadow-xs flex items-start justify-between gap-3"
                >
                  <div>
                    <p className="text-xs font-semibold text-foreground">{activity.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{activity.detail}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">{formatDateTime(activity.created_at)}</p>
                  </div>
                  <StatusBadge tone="info">{activity.type.replace("_", " ")}</StatusBadge>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Henüz aktivite kaydı yok"
              description="Not ekleyerek veya takip oluşturarak zaman çizelgesini başlatın."
            />
          )}
        </SectionCard>

        <SectionCard title="Bekleyen Görevler" description="Bu adaya atanmış açık aksiyonlar.">
          {data.tasks.length ? (
            <div className="space-y-2">
              {data.tasks.map((task: Task) => (
                <article
                  key={task.id}
                  className="rounded-lg border border-border bg-card p-3 shadow-xs flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-foreground">{task.title}</p>
                    <p className="text-[11px] text-muted-foreground">Vade: {formatDateTime(task.due_at)}</p>
                  </div>
                  <StatusBadge
                    tone={task.priority === "high" ? "danger" : task.priority === "medium" ? "warning" : "info"}
                  >
                    {task.priority}
                  </StatusBadge>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="Açık görev yok" description="Hızlı aksiyonlar panelinden görev oluşturabilirsiniz." />
          )}
        </SectionCard>
      </div>

      <SectionCard title="İlişkili Teklifler" description="Aday veya dönüştürülen müşteri için hazırlanmış teklifler.">
        <div className="space-y-4">
          <QuoteGroup
            title="Bu Adaya Verilen Teklifler"
            emptyMessage="Henüz doğrudan teklif oluşturulmamış."
            quotes={data.leadQuotes}
          />

          {data.linkedCustomer ? (
            <QuoteGroup
              title={`${data.linkedCustomer.name} Adına Verilen Teklifler`}
              emptyMessage="Müşteri adına teklif kaydı bulunamadı."
              quotes={data.customerQuotes}
            />
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title="Sistem & Güvenlik Kapsamı" description="Organizasyon izolasyonu ve kayıt meta verileri.">
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          <MiniDetail label="Organizasyon" value={data.context.organization.name} />
          <MiniDetail label="Erişim Rolü" value={data.context.role} />
          <MiniDetail label="Kayıt Kimliği" value={lead.id} />
          <MiniDetail label="Son Güncelleme" value={formatDateTime(lead.updated_at)} />
        </div>
      </SectionCard>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "info" | "warning" | "success" | "danger";
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-xs">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-sm font-bold text-foreground">{value}</span>
        {tone !== "neutral" ? <StatusBadge tone={tone}>{tone}</StatusBadge> : null}
      </div>
    </div>
  );
}

function ContactItem({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-xs">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <p className="mt-1 text-xs font-semibold text-foreground truncate">{value}</p>
    </div>
  );
}

function MiniDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-xs">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <p className="mt-0.5 text-xs font-semibold text-foreground truncate">{value}</p>
    </div>
  );
}

function QuoteGroup({
  title,
  emptyMessage,
  quotes,
}: {
  title: string;
  emptyMessage: string;
  quotes: Array<{
    id: string;
    quote_number: string;
    status: string;
    issue_date: string;
    currency: string;
    grand_total: number;
    total: number;
  }>;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-foreground">{title}</p>
      {quotes.length ? (
        <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
          {quotes.map((quote) => (
            <Link
              key={quote.id}
              href={`/quotes/${quote.id}`}
              className="flex items-center justify-between p-3 bg-card hover:bg-muted/40 transition-colors text-xs"
            >
              <div>
                <p className="font-semibold text-foreground">{quote.quote_number}</p>
                <p className="text-[11px] text-muted-foreground">
                  {formatDateTime(quote.issue_date)} · {quote.currency}
                </p>
              </div>
              <div className="text-right">
                <p className="font-bold text-foreground">
                  {formatCurrency(quote.grand_total ?? quote.total ?? 0, quote.currency)}
                </p>
                <p className="text-[10px] text-muted-foreground capitalize">{quote.status}</p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
          {emptyMessage}
        </p>
      )}
    </div>
  );
}
