"use client";

import { useId, useMemo, useState, type RefObject } from "react";
import { Loader2, Sparkles, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/shared/section-card";
import { Textarea } from "@/components/ui/textarea";
import { applyQuoteAiDraftToTextFields, type QuoteAiDraft } from "@/lib/validations/quote-ai";
import { LOCALE_COOKIE, normalizeLocale, t } from "@/lib/i18n";

type QuoteAiAssistantProps = {
  formRef: RefObject<HTMLFormElement | null>;
  canMutate: boolean;
  readOnlyMessage?: string;
  onApplyDraft: (draft: QuoteAiDraft) => void;
};

type AssistantPreview = QuoteAiDraft | null;

function toOptionalString(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readRequestBody(formRef: RefObject<HTMLFormElement | null>, formId: string, userInstruction: string) {
  const form = formRef.current;
  if (!form) return null;
  const formData = new FormData(form);
  const itemsRaw = formData.get("items_json");
  if (typeof itemsRaw !== "string" || !itemsRaw.trim()) return null;
  const items = JSON.parse(itemsRaw) as Array<{
    product_id?: string | null; name?: string; description?: string; sku?: string;
    quantity?: number; unit?: string; unit_price?: number; currency?: string; tax_rate?: number;
  }>;
  return {
    formId,
    leadId: toOptionalString(formData.get("lead_id")),
    customerId: toOptionalString(formData.get("customer_id")),
    quoteCurrency: String(formData.get("currency") ?? "").trim(),
    issueDate: toOptionalString(formData.get("issue_date")),
    expiryDate: toOptionalString(formData.get("valid_until")),
    userInstruction: userInstruction.trim() || null,
    items: items.map((item) => ({
      product_id: item.product_id ?? null,
      name: String(item.name ?? "").trim(),
      description: String(item.description ?? "").trim(),
      sku: String(item.sku ?? "").trim(),
      quantity: Number(item.quantity ?? 0),
      unit: String(item.unit ?? "").trim(),
      unit_price: Number(item.unit_price ?? 0),
      currency: String(item.currency ?? "").trim(),
      tax_rate: Number(item.tax_rate ?? 0),
    })),
  };
}

export function QuoteAiAssistant({ formRef, canMutate, readOnlyMessage, onApplyDraft }: QuoteAiAssistantProps) {
  const formId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [userInstruction, setUserInstruction] = useState("");
  const [preview, setPreview] = useState<AssistantPreview>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locale = useMemo(() => {
    if (typeof document === "undefined") return "tr" as const;
    const match = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`));
    return normalizeLocale(match?.[1]);
  }, []);
  const copy = (key: Parameters<typeof t>[1]) => t(locale, key);

  async function generateDraft() {
    if (!canMutate) { setError(readOnlyMessage ?? copy("quoteAiReadonly")); return; }
    let requestBody;
    try { requestBody = readRequestBody(formRef, formId, userInstruction); }
    catch { setError(copy("quoteAiReadFormError")); return; }
    if (!requestBody) { setError(copy("quoteAiFillForm")); return; }
    setIsGenerating(true);
    setError(null);
    try {
      const response = await fetch("/api/quotes/ai-draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody) });
      const payload = (await response.json()) as { success: true; draft: QuoteAiDraft } | { success: false; message?: string };
      if (!response.ok || !payload.success) {
        setPreview(null);
        setError(!payload.success && payload.message ? payload.message : copy("quoteAiFailure"));
        return;
      }
      setPreview(payload.draft);
    } catch {
      setPreview(null);
      setError(copy("quoteAiRetry"));
    } finally { setIsGenerating(false); }
  }

  function applyPreview() {
    if (!preview) return;
    onApplyDraft(preview);
    setError(null);
  }

  return (
    <SectionCard title={copy("quoteAiTitle")} description={copy("quoteAiDescription")} className="border-dashed border-slate-300/90 bg-slate-50/80 dark:border-white/10 dark:bg-white/5">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="secondary" className="gap-1.5"><Sparkles className="h-3.5 w-3.5" />{copy("quoteAiBadge")}</Badge>
          <p className="text-sm text-muted-foreground">{copy("quoteAiDisclaimer")}</p>
        </div>
        {!isOpen ? (
          <div key="ai-closed" className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={() => setIsOpen(true)} variant="outline" disabled={!canMutate}><Sparkles className="h-4 w-4" />{copy("quoteAiOpen")}</Button>
            {error ? <p className="text-sm text-rose-600 dark:text-rose-300">{error}</p> : null}
          </div>
        ) : (
          <div key="ai-open" className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-950/40">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h3 className="text-sm font-semibold text-foreground">{copy("quoteAiDraftTitle")}</h3><p className="mt-1 text-sm text-muted-foreground">{copy("quoteAiDraftDescription")}</p></div>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => setIsOpen(false)} aria-label={copy("quoteAiClose")}><X className="h-4 w-4" /></Button>
            </div>
            <label className="space-y-2">
              <span className="text-sm font-medium text-foreground">{copy("quoteAiInstruction")}</span>
              <Textarea value={userInstruction} onChange={(event) => setUserInstruction(event.target.value)} placeholder={copy("quoteAiInstructionPlaceholder")} maxLength={1000} />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" onClick={generateDraft} disabled={isGenerating || !canMutate}>{isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{isGenerating ? copy("quoteAiGenerating") : copy("quoteAiGenerate")}</Button>
              <Button type="button" variant="outline" onClick={() => { setPreview(null); setError(null); }} disabled={!preview}>{copy("quoteAiClearPreview")}</Button>
            </div>
            {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-100">{error}</div> : null}
            {preview ? (
              <div className="space-y-4 rounded-3xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                <div className="flex flex-wrap items-center gap-2"><Badge variant="success">{copy("quoteAiPreviewReady")}</Badge><span className="text-sm text-emerald-700 dark:text-emerald-100">{copy("quoteAiPreserved")}</span></div>
                <PreviewField label={copy("quoteAiPreviewFieldNotes")} value={preview.notes} />
                <PreviewField label={copy("quoteAiPreviewFieldPayment")} value={preview.paymentTerms} />
                <PreviewField label={copy("quoteAiPreviewFieldDelivery")} value={preview.deliveryTerms} />
                {preview.internalRecommendation ? <PreviewField label={copy("quoteAiPreviewFieldRecommendation")} value={preview.internalRecommendation} /> : null}
                <div className="flex flex-wrap items-center gap-3"><Button type="button" onClick={applyPreview}>{copy("quoteAiApply")}</Button><Button type="button" variant="outline" onClick={() => setPreview(null)}>{copy("quoteAiClearPreview")}</Button></div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function PreviewField({ label, value }: { label: string; value: string }) {
  return <label className="space-y-2"><span className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{label}</span><Textarea value={value} readOnly className="min-h-24" /></label>;
}

export function applyQuoteAiDraftToFormState(draft: QuoteAiDraft) {
  return applyQuoteAiDraftToTextFields(draft);
}
