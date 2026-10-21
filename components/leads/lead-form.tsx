import { cookies } from "next/headers";
import { LOCALE_COOKIE, normalizeLocale } from "@/lib/i18n";
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
  disabled?: boolean;
};

export async function LeadForm({ action, redirectTo, lead, members, submitLabel, leadId, disabled = false }: LeadFormProps) {
  const locale = normalizeLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  const text = (tr: string, en: string) => locale === "tr" ? tr : en;
  const leadDate = lead?.next_follow_up_at ? lead.next_follow_up_at.slice(0, 10) : "";
  const estimatedValue = lead ? String(lead.estimated_value) : "";

  return (
    <form action={action}><fieldset disabled={disabled} className="space-y-6">
      <input type="hidden" name="redirect_to" value={redirectTo} />
      {leadId ? <input type="hidden" name="lead_id" value={leadId} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={text("Ad soyad", "Full name")}>
          <Input name="full_name" defaultValue={lead?.full_name ?? ""} required />
        </Field>
        <Field label={text("Şirket", "Company")}>
          <Input name="company" defaultValue={lead?.company ?? ""} />
        </Field>
        <Field label={text("E-posta", "Email")}>
          <Input name="email" type="email" defaultValue={lead?.email ?? ""} />
        </Field>
        <Field label={text("Telefon", "Phone")}>
          <Input name="phone" defaultValue={lead?.phone ?? ""} />
        </Field>
        <Field label={text("Şehir", "City")}>
          <Input name="city" defaultValue={lead?.city ?? ""} />
        </Field>
        <Field label={text("Tahmini değer", "Estimated value")}>
          <Input name="estimated_value" type="number" min="0" step="0.01" defaultValue={estimatedValue} required />
        </Field>
        <Field label={text("Kaynak", "Source")}>
          <Select name="source" defaultValue={lead?.source ?? "Website"}>
            {leadSources.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={text("Durum", "Status")}>
          <Select name="status" defaultValue={lead?.status ?? "new"}>
            {LEAD_STATUSES.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={text("Para birimi", "Currency")}>
          <Select name="currency" defaultValue={lead?.currency ?? "TRY"}>
            {currencies.map((currency) => (
              <option key={currency} value={currency}>
                {currencyLabels[currency]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={text("Atanan kişi", "Assigned user")}>
          <Select name="assigned_to" defaultValue={lead?.assigned_to ?? ""}>
            <option value="">{text("Atanmamış", "Unassigned")}</option>
            {members.map((member) => (
              <option key={member.user_id} value={member.user_id}>
                {member.full_name} ({member.role})
              </option>
            ))}
          </Select>
        </Field>
        <Field label={text("Sonraki takip", "Next follow-up")}>
          <Input name="next_follow_up_at" type="date" defaultValue={leadDate} />
        </Field>
      </div>

      <Field label={text("Notlar", "Notes")}>
        <Textarea name="notes" defaultValue={lead?.notes ?? ""} />
      </Field>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
        {lead ? (
          <p>
            {text("Mevcut değer:", "Current value:")} <span className="font-medium text-slate-950 dark:text-white">{formatCurrency(lead.estimated_value, lead.currency)}</span>
          </p>
        ) : (
          <p>{text("Kayıt bu çalışma alanına eklenir. Kaydetmeden önce bilgileri kontrol edin.", "This lead belongs to the current workspace. Review the details before saving.")}</p>
        )}
      </div>

      <button
        type="submit"
        className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
      >
        {submitLabel}
      </button>
    </fieldset></form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="space-y-2">
      <span className="block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
      {children}
    </label>
  );
}
