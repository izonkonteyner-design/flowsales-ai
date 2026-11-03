import type { Lead } from "@/types/crm";
import type { ReactNode } from "react";
import { LEAD_STATUSES } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/utils";
import type { LeadMemberOption } from "@/server/services/lead-domain";

const leadSources = ["Website", "WhatsApp", "Instagram", "Referral", "LinkedIn", "Event", "Cold call"];
const currencies = ["TRY", "USD", "EUR"];
const currencyLabels: Record<string, string> = {
  TRY: "TL",
  USD: "USD",
  EUR: "EUR",
};

type LeadFormProps = {
  action: (formData: FormData) => Promise<void>;
  redirectTo: string;
  lead?: Lead | null;
  members: LeadMemberOption[];
  submitLabel: string;
  leadId?: string;
};

export function LeadForm({ action, redirectTo, lead, members, submitLabel, leadId }: LeadFormProps) {
  const leadDate = lead?.next_follow_up_at ? lead.next_follow_up_at.slice(0, 10) : "";
  const estimatedValue = lead ? String(lead.estimated_value) : "";

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="redirect_to" value={redirectTo} />
      {leadId ? <input type="hidden" name="lead_id" value={leadId} /> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Ad Soyad / Yetkili">
          <Input name="full_name" defaultValue={lead?.full_name ?? ""} required placeholder="Ad Soyad" />
        </Field>
        <Field label="Şirket / Kuruluş">
          <Input name="company" defaultValue={lead?.company ?? ""} placeholder="Şirket Unvanı" />
        </Field>
        <Field label="E-posta">
          <Input name="email" type="email" defaultValue={lead?.email ?? ""} placeholder="ornek@sirket.com" />
        </Field>
        <Field label="Telefon Numarası">
          <Input name="phone" defaultValue={lead?.phone ?? ""} placeholder="+90 5XX XXX XX XX" />
        </Field>
        <Field label="Şehir">
          <Input name="city" defaultValue={lead?.city ?? ""} placeholder="İzmir, İstanbul..." />
        </Field>
        <Field label="Tahmini Değer">
          <Input name="estimated_value" type="number" min="0" step="0.01" defaultValue={estimatedValue} required placeholder="0.00" />
        </Field>
        <Field label="Kaynak">
          <Select name="source" defaultValue={lead?.source ?? "Website"}>
            {leadSources.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Aşama / Durum">
          <Select name="status" defaultValue={lead?.status ?? "new"}>
            {LEAD_STATUSES.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Para Birimi">
          <Select name="currency" defaultValue={lead?.currency ?? "TRY"}>
            {currencies.map((currency) => (
              <option key={currency} value={currency}>
                {currencyLabels[currency]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Sorumlu Temsilci">
          <Select name="assigned_to" defaultValue={lead?.assigned_to ?? ""}>
            <option value="">Atanmamış</option>
            {members.map((member) => (
              <option key={member.user_id} value={member.user_id}>
                {member.full_name} ({member.role})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Sonraki Takip Tarihi">
          <Input name="next_follow_up_at" type="date" defaultValue={leadDate} />
        </Field>
      </div>

      <Field label="Görüşme ve Talep Notları">
        <Textarea name="notes" defaultValue={lead?.notes ?? ""} placeholder="Müşteri talebi, detaylar ve özel gereksinimler..." />
      </Field>

      <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        {lead ? (
          <p>
            Mevcut Tahmini Değer:{" "}
            <span className="font-semibold text-foreground">
              {formatCurrency(lead.estimated_value, lead.currency)}
            </span>
          </p>
        ) : (
          <p>Potansiyel müşteri kayıtları organizasyon yetki kurallarına göre korunur ve sunucu tarafında doğrulanır.</p>
        )}
      </div>

      <button
        type="submit"
        className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-colors"
      >
        {submitLabel}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="space-y-1 block">
      <span className="block text-xs font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}
