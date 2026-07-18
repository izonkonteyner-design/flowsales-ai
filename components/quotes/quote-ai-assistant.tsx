"use client";

import { useId, useState, type RefObject } from "react";
import { Loader2, Sparkles, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/shared/section-card";
import { Textarea } from "@/components/ui/textarea";
import { applyQuoteAiDraftToTextFields, type QuoteAiDraft } from "@/lib/validations/quote-ai";

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
  if (!form) {
    return null;
  }

  const formData = new FormData(form);
  const itemsRaw = formData.get("items_json");
  if (typeof itemsRaw !== "string" || !itemsRaw.trim()) {
    return null;
  }

  const items = JSON.parse(itemsRaw) as Array<{
    product_id?: string | null;
    name?: string;
    description?: string;
    sku?: string;
    quantity?: number;
    unit?: string;
    unit_price?: number;
    currency?: string;
    tax_rate?: number;
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

  async function generateDraft() {
    if (!canMutate) {
      setError(readOnlyMessage ?? "Bu kayıt salt okunurdur.");
      return;
    }

    let requestBody;
    try {
      requestBody = readRequestBody(formRef, formId, userInstruction);
    } catch {
      setError("AI taslağı için mevcut form verisi okunamadı.");
      return;
    }

    if (!requestBody) {
      setError("Önce teklif formunu doldurun.");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch("/api/quotes/ai-draft", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const payload = (await response.json()) as
        | { success: true; draft: QuoteAiDraft }
        | { success: false; message?: string };

      if (!response.ok || !payload.success) {
        setPreview(null);
        setError(!payload.success && payload.message ? payload.message : "AI taslağı oluşturulamadı.");
        return;
      }

      setPreview(payload.draft);
    } catch {
      setPreview(null);
      setError("AI taslağı şu anda oluşturulamadı. Lütfen tekrar deneyin.");
    } finally {
      setIsGenerating(false);
    }
  }

  function applyPreview() {
    if (!preview) {
      return;
    }

    onApplyDraft(preview);
    setError(null);
  }

  return (
    <SectionCard
      title="AI ile Taslak Oluştur"
      description="Teklif metnini üret, ön izle ve yalnızca onaylanan metin alanlarına uygula."
      className="border-dashed border-slate-300/90 bg-slate-50/80 dark:border-white/10 dark:bg-white/5"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="secondary" className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            Metin önerisi
          </Badge>
          <p className="text-sm text-slate-500">
            AI tarafından oluşturulan metni kontrol edin. Kaydetmeden önce doğruluğundan siz sorumlusunuz.
          </p>
        </div>

        {!isOpen ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={() => setIsOpen(true)} variant="outline">
              <Sparkles className="h-4 w-4" />
              AI ile Taslak Oluştur
            </Button>
            {error ? <p className="text-sm text-rose-600 dark:text-rose-300">{error}</p> : null}
          </div>
        ) : (
          <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-950/40">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-950 dark:text-white">Taslak oluşturma</h3>
                <p className="mt-1 text-sm text-slate-500">
                  AI yalnızca metin alanlarını günceller; ürün satırları, miktarlar ve toplamlar değişmez.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setIsOpen(false)}
                aria-label="Assistantı kapat"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Özel talimat</span>
              <Textarea
                value={userInstruction}
                onChange={(event) => setUserInstruction(event.target.value)}
                placeholder="Örn. Daha resmi bir ton kullan, ödeme ve teslim koşullarını kısa tut."
                maxLength={1000}
              />
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" onClick={generateDraft} disabled={isGenerating || !canMutate}>
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {isGenerating ? "Oluşturuluyor..." : "Taslak Oluştur"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPreview(null);
                  setError(null);
                }}
                disabled={!preview}
              >
                Ön izlemeyi temizle
              </Button>
            </div>

            {error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-100">
                {error}
              </div>
            ) : null}

            {preview ? (
              <div className="space-y-4 rounded-3xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="success">Ön izleme hazır</Badge>
                  <span className="text-sm text-emerald-700 dark:text-emerald-100">
                    Ürün satırları ve toplamlar korunur.
                  </span>
                </div>

                <PreviewField label="Notes / description" value={preview.notes} />
                <PreviewField label="Payment terms" value={preview.paymentTerms} />
                <PreviewField label="Delivery terms" value={preview.deliveryTerms} />
                {preview.internalRecommendation ? (
                  <PreviewField label="Internal recommendation" value={preview.internalRecommendation} />
                ) : null}

                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" onClick={applyPreview}>
                    Forma Uygula
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setPreview(null)}>
                    Preview temizle
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function PreviewField({ label, value }: { label: string; value: string }) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">{label}</span>
      <Textarea value={value} readOnly className="min-h-24" />
    </label>
  );
}

export function applyQuoteAiDraftToFormState(
  draft: QuoteAiDraft,
) {
  return applyQuoteAiDraftToTextFields(draft);
}
