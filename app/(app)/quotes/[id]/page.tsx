import Link from "next/link";
import { ArrowLeft, Copy, ExternalLink, Pencil, Send } from "lucide-react";

import { FlashToast } from "@/components/shared/flash-toast";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { QuoteDeleteDialog } from "@/components/quotes/quote-delete-dialog";
import { duplicateQuoteAction, updateQuoteStatusAction } from "@/app/(app)/quotes/actions";
import { QUOTE_STATUSES } from "@/lib/constants";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { Select } from "@/components/ui/select";
import { canManageQuotes, getQuoteRecordRestrictionMessage, getQuoteStatusLabelTr } from "@/server/services/quote-domain";
import { getQuoteDetailData } from "@/server/services/quotes";

type QuoteDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function QuoteDetailPage({ params, searchParams }: QuoteDetailPageProps) {
  const [{ id }, rawSearchParams] = await Promise.all([params, searchParams]);
  const data = await getQuoteDetailData(id);
  const toastMessage = typeof rawSearchParams.toast === "string" ? rawSearchParams.toast : "";
  const toastTone =
    rawSearchParams.tone === "danger" || rawSearchParams.tone === "warning" || rawSearchParams.tone === "info"
      ? rawSearchParams.tone
      : "success";

  if (!data.quote) {
    return (
      <EmptyState
        title="Teklif bulunamadı"
        description={data.error ?? "Talep edilen teklif bu çalışma alanında bulunamadı veya silinmiş olabilir."}
        actionHref="/quotes"
        actionLabel="Tekliflere Dön"
      />
    );
  }

  const quote = data.quote;
  const backHref = typeof rawSearchParams.redirect_to === "string" && rawSearchParams.redirect_to.startsWith("/") ? rawSearchParams.redirect_to : "/quotes";
  const canMutate = quote.recordMode === "live" && canManageQuotes(data.context.role);
  const restriction = getQuoteRecordRestrictionMessage(quote.recordMode, data.context.role);
  const recipientType = quote.customer_id ? "customer" : quote.lead_id ? "lead" : "none";

  return (
    <div className="space-y-6">
      {toastMessage ? <FlashToast message={toastMessage} tone={toastTone} /> : null}

      <PageHeader
        eyebrow="Teklif Detayı"
        title={quote.quote_number}
        description={`${quote.lead_name ?? quote.customer_name ?? "Atanmadı"} · ${quote.lead_company ?? quote.customer_company ?? "Şirket Yok"}`}
        actions={
          <>
            <Link
              href={backHref}
              className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
            >
              <ArrowLeft className="h-4 w-4" />
              Geri
            </Link>
            <Link
              href={`/quotes/${quote.id}/print`}
              className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
            >
              <Send className="h-4 w-4" />
              Yazdır / Önizle
            </Link>
            <a
              href={`/api/quotes/${quote.id}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
            >
              <Copy className="h-4 w-4" />
              PDF İndir
            </a>
            <form action={duplicateQuoteAction}>
              <input type="hidden" name="quote_id" value={quote.id} />
              <button
                type="submit"
                disabled={!canMutate}
                title={canMutate ? "Teklifi çoğalt" : restriction}
                className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
              >
                <Copy className="h-4 w-4" />
                Çoğalt
              </button>
            </form>
            {canMutate ? (
              <Link
                href={`/quotes/${quote.id}/edit?redirect_to=${encodeURIComponent(backHref)}`}
                className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
              >
                <Pencil className="h-4 w-4" />
                Düzenle
              </Link>
            ) : (
              <span
                title={restriction}
                className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400"
              >
                <Pencil className="h-4 w-4" />
                Düzenle
              </span>
            )}
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <SectionCard title="Teklif Önizleme" description="Güncel kalem toplamları ve koşullarıyla, müşteriye gönderime hazır özet.">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-950">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-500">FlowSales AI</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">Ticari Teklif</h2>
                <p className="mt-2 text-sm text-slate-500">Güvenli değişiklik kurallarına sahip profesyonel teklif kaydı.</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <StatusBadge tone={quote.record_badge.tone} title={quote.record_badge.title}>
                  {quote.record_badge.label}
                </StatusBadge>
                <StatusBadge tone={quote.status_tone}>{getQuoteStatusLabelTr(quote.status)}</StatusBadge>
              </div>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <Info label="Aday" value={quote.lead_name ?? "Atanmadı"} />
              <Info label="Müşteri" value={quote.customer_name ?? "Müşteri Yok"} />
              <Info label="Tanzim Tarihi" value={formatDate(quote.issue_date)} />
              <Info label="Geçerlilik Tarihi" value={formatDate(quote.valid_until ?? quote.expiry_date ?? quote.issue_date)} />
              <Info label="Para Birimi" value={quote.currency} />
              <Info label="Oluşturulma Tarihi" value={formatDateTime(quote.created_at)} />
            </div>

            <div className="mt-8 overflow-hidden rounded-3xl border border-slate-200 dark:border-white/10">
              <div className="grid grid-cols-[1.5fr_0.6fr_0.8fr_0.8fr_0.8fr] gap-4 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:bg-white/5">
                <span>Kalem</span>
                <span>Adet</span>
                <span>Fiyat</span>
                <span>Vergi</span>
                <span>Toplam</span>
              </div>
              <div className="divide-y divide-slate-200 dark:divide-white/10">
                {quote.items.map((item) => (
                  <div key={item.id} className="grid grid-cols-[1.5fr_0.6fr_0.8fr_0.8fr_0.8fr] gap-4 px-4 py-4 text-sm">
                    <div>
                      <p className="font-medium text-slate-950 dark:text-white">{item.name || item.description}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.description || "Manuel kalem"}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.sku || item.product_id || "SKU Yok"}</p>
                    </div>
                    <span className="text-slate-600 dark:text-slate-400">{item.quantity}</span>
                    <span className="text-slate-600 dark:text-slate-400">{formatCurrency(item.unit_price ?? 0, quote.currency)}</span>
                    <span className="text-slate-600 dark:text-slate-400">{formatCurrency(item.line_tax ?? 0, quote.currency)}</span>
                    <span className="font-medium text-slate-950 dark:text-white">{formatCurrency(item.line_total ?? 0, quote.currency)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
                <p className="text-sm text-slate-500">Ödeme Koşulları</p>
                <p className="mt-2 text-sm text-slate-950 dark:text-white">{quote.payment_terms || "Belirtilmedi"}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
                <p className="text-sm text-slate-500">Teslim Koşulları</p>
                <p className="mt-2 text-sm text-slate-950 dark:text-white">{quote.delivery_terms || "Belirtilmedi"}</p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-slate-200 pt-4 text-sm dark:border-white/10">
              <span className="text-slate-500">Para birimi ve tutarlar bu teklif anlık görüntüsüne kilitlenmiştir.</span>
              <div className="flex items-center gap-2">
                <Send className="h-4 w-4 text-slate-400" />
                <span className="text-slate-500">Müşteriye gönderime hazır önizleme</span>
              </div>
            </div>
          </div>
        </SectionCard>

        <div className="space-y-6">
          <SectionCard title="Özet" description="Kayıtlı ticari anlık görüntüden güncel toplamlar.">
            <div className="space-y-3 text-sm">
              <Row label="Ara Toplam" value={formatCurrency(quote.subtotal, quote.currency)} />
              <Row label="Kalem İskontoları" value={formatCurrency(quote.line_discount_total ?? 0, quote.currency)} />
              <Row label="Sipariş İskontosu" value={formatCurrency(quote.order_discount_total ?? 0, quote.currency)} />
              <Row label="Kargo / Nakliye" value={formatCurrency(quote.shipping_total ?? 0, quote.currency)} />
              <Row label="Vergi" value={formatCurrency(quote.tax_total, quote.currency)} />
              <div className="flex items-center justify-between border-t border-slate-200 pt-3 text-base font-semibold text-slate-950 dark:border-white/10 dark:text-white">
                <span>Genel Toplam</span>
                <span>{formatCurrency(quote.grand_total ?? quote.total ?? 0, quote.currency)}</span>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Alıcı" description="Bu teklife bağlı aday ve müşteri kayıtları.">
            <div className="space-y-3 text-sm">
              <Row label="Alıcı Türü" value={recipientType === "customer" ? "Müşteri" : recipientType === "lead" ? "Aday" : "Yok"} />
              {quote.customer_id ? (
                <Link
                  href={`/customers/${quote.customer_id}`}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
                >
                  <div>
                    <p className="font-medium text-slate-950 dark:text-white">{quote.customer_name ?? "Müşteri"}</p>
                    <p className="mt-1 text-xs text-slate-500">{quote.customer_company ?? "Şirket Yok"}</p>
                  </div>
                  <ExternalLink className="h-4 w-4 text-slate-400" />
                </Link>
              ) : null}
              {quote.lead_id ? (
                <Link
                  href={`/leads/${quote.lead_id}`}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
                >
                  <div>
                    <p className="font-medium text-slate-950 dark:text-white">{quote.lead_name ?? "Aday"}</p>
                    <p className="mt-1 text-xs text-slate-500">{quote.lead_company ?? "Şirket Yok"}</p>
                  </div>
                  <ExternalLink className="h-4 w-4 text-slate-400" />
                </Link>
              ) : null}
            </div>
          </SectionCard>

          <SectionCard title="Durum" description="Teklif durumunu güvenli sunucu işlemiyle değiştirin.">
            {canMutate ? (
              <form action={updateQuoteStatusAction} className="space-y-3">
                <input type="hidden" name="quote_id" value={quote.id} />
                <Select name="status" defaultValue={quote.status}>
                  {QUOTE_STATUSES.map((status) => (
                    <option key={status.value} value={status.value}>
                      {getQuoteStatusLabelTr(status.value)}
                    </option>
                  ))}
                </Select>
                <button
                  type="submit"
                  className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950"
                >
                  Durumu Kaydet
                </button>
              </form>
            ) : (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
                {restriction}
              </div>
            )}
          </SectionCard>

          <SectionCard title="İşlemler" description="Demo kayıtları ve görüntüleyici roller için değişiklik işlemleri devre dışıdır.">
            <div className="space-y-3">
              <QuoteDeleteDialog
                quoteId={quote.id}
                quoteNumber={quote.quote_number}
                redirectTo="/quotes"
                recordMode={quote.recordMode}
                role={data.context.role}
                restrictionMessage={restriction}
              />
              {restriction ? <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">{restriction}</p> : null}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-slate-950 dark:text-white">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-950 dark:text-white">{value}</span>
    </div>
  );
}
