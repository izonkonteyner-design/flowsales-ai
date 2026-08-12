"use client";

import { useActionState, type ReactNode } from "react";
import { completeOnboardingAction } from "./actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { CURRENCY_CODES } from "@/lib/constants";
import { ONBOARDING_TIMEZONES, type OnboardingActionState, type OnboardingField } from "@/lib/validations/onboarding";
import type { Organization } from "@/types/crm";

const initialState: OnboardingActionState = { success: false, message: "", fieldErrors: {} };

export function OnboardingForm({ organization }: { organization: Organization }) {
  const [state, action, pending] = useActionState(completeOnboardingAction, initialState);
  const error = (field: OnboardingField) => state.fieldErrors[field];

  return (
    <form action={action} className="space-y-8 rounded-[2rem] border border-slate-200 bg-white p-8 shadow-[0_12px_40px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-slate-950/50">
      {state.message ? <div role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{state.message}</div> : null}
      <div><h2 className="text-lg font-medium text-slate-950 dark:text-white">Şirket bilgileri</h2><p className="text-sm text-slate-500 dark:text-slate-400">Teklifler ve çalışma alanı için temel bilgileri girin.</p></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Şirket adı" error={error("company_name")}><Input name="company_name" defaultValue={organization.name} required maxLength={120} /></Field>
        <Field label="Sektör" error={error("industry")}><Input name="industry" defaultValue={organization.industry ?? ""} placeholder="Örn. Yazılım, üretim" maxLength={120} /></Field>
        <Field label="Telefon" error={error("phone")}><Input name="phone" defaultValue={organization.phone ?? ""} maxLength={30} /></Field>
        <Field label="Şehir" error={error("city")}><Input name="city" defaultValue={organization.city ?? ""} maxLength={80} /></Field>
        <Field label="Ülke" error={error("country")}><Input name="country" defaultValue={organization.country ?? "Türkiye"} required maxLength={80} /></Field>
        <Field label="Saat dilimi" error={error("timezone")}><Select name="timezone" defaultValue={organization.timezone ?? "Europe/Istanbul"}>{ONBOARDING_TIMEZONES.map((value) => <option key={value} value={value}>{value}</option>)}</Select></Field>
        <Field label="Para birimi" error={error("currency")}><Select name="currency" defaultValue={organization.currency || "TRY"}>{CURRENCY_CODES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</Select></Field>
        <Field label="Şirket logosu (isteğe bağlı)" error={error("logo")}><Input name="logo" type="file" accept="image/png,image/jpeg,image/webp" /><span className="text-xs text-slate-500">PNG, JPEG veya WebP · en fazla 2 MB</span></Field>
      </div>
      <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600 dark:bg-white/5 dark:text-slate-300">Ürün ve müşteri adaylarını kurulumdan sonra ilgili ekranlardan ekleyebilirsiniz.</div>
      <div className="flex justify-end"><Button type="submit" disabled={pending}>{pending ? "Kaydediliyor..." : "Kurulumu tamamla"}</Button></div>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return <label className="space-y-2"><span className="text-sm font-medium text-slate-900 dark:text-slate-300">{label}</span>{children}{error ? <span className="block text-sm text-rose-600">{error}</span> : null}</label>;
}
