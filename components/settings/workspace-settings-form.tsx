"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Upload, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CURRENCY_CODES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { WorkspaceCompanySettings } from "@/types/settings";

type WorkspaceSettingsFormProps = {
  settings: WorkspaceCompanySettings;
  canEdit: boolean;
  mode: "demo" | "live";
  updateAction: (formData: FormData) => void;
  removeLogoAction: (formData: FormData) => void;
};

type FieldProps = {
  label: string;
  children: ReactNode;
  hint?: string;
};

function Field({ label, children, hint }: FieldProps) {
  return (
    <label className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
        {hint ? <span className="text-xs text-slate-500">{hint}</span> : null}
      </div>
      {children}
    </label>
  );
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-1">
      <h2 className="text-base font-semibold text-slate-950 dark:text-white">{title}</h2>
      <p className="text-sm text-slate-500">{description}</p>
    </div>
  );
}

function LogoPreview({ url, companyName }: { url: string | null; companyName: string }) {
  if (!url) {
    return (
      <div className="flex h-24 w-24 items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-slate-50 text-center text-xs font-medium text-slate-400 dark:border-white/10 dark:bg-white/5">
        No logo
      </div>
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={`${companyName} logo`} className="h-24 w-24 rounded-3xl border border-slate-200 object-cover shadow-sm dark:border-white/10" />;
}

export function WorkspaceSettingsForm({ settings, canEdit, mode, updateAction, removeLogoAction }: WorkspaceSettingsFormProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const previewUrl = useMemo(() => {
    if (!selectedFile) {
      return settings.logo_url ?? null;
    }

    return URL.createObjectURL(selectedFile);
  }, [selectedFile, settings.logo_url]);

  useEffect(() => {
    if (!selectedFile || !previewUrl) {
      return;
    }

    return () => URL.revokeObjectURL(previewUrl);
  }, [selectedFile, previewUrl]);

  const currencyOptions = CURRENCY_CODES;

  return (
    <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
      <form action={updateAction} className="space-y-6">
        <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-slate-950/60">
          <div className="flex items-start justify-between gap-4">
            <SectionHeading title="Workspace branding" description="Company identity and logo used across quotes and customer-facing documents." />
            <Badge variant="secondary">{mode === "demo" ? "Demo workspace" : canEdit ? "Editable" : "Read only"}</Badge>
          </div>

          {!canEdit ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
              This workspace is read only. Connect a live Supabase workspace with owner or admin permissions to edit branding.
            </div>
          ) : null}

          <div className="mt-6 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
              <div className="flex items-center gap-4">
                <LogoPreview url={previewUrl} companyName={settings.company_name} />
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-950 dark:text-white">{settings.company_name}</p>
                  <p className="text-sm text-slate-500">{settings.company_slogan ?? "Premium quote branding"}</p>
                </div>
              </div>

              <Field label="Company logo" hint="PNG, JPG, or WebP up to 2 MB">
                <Input
                  name="logo_file"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={!canEdit}
                  onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                  className="file:mr-4 file:rounded-xl file:border-0 file:bg-slate-950 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white dark:file:bg-white dark:file:text-slate-950"
                />
              </Field>

              <p className="text-xs leading-5 text-slate-500">
                Uploaded logos are stored in the dedicated workspace-assets bucket and reused in quote documents.
              </p>

              {settings.logo_url && canEdit ? (
                <button
                  type="submit"
                  formAction={removeLogoAction}
                  disabled={!canEdit}
                  className={cn(
                    "inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10",
                  )}
                >
                  <Trash2 className="h-4 w-4" />
                  Remove logo
                </button>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Company name">
                <Input name="company_name" defaultValue={settings.company_name} disabled={!canEdit} required />
              </Field>
              <Field label="Legal name">
                <Input name="legal_name" defaultValue={settings.legal_name ?? ""} disabled={!canEdit} />
              </Field>
              <Field label="Website">
                <Input name="website" defaultValue={settings.website ?? ""} disabled={!canEdit} />
              </Field>
              <Field label="Email">
                <Input name="email" type="email" defaultValue={settings.email ?? ""} disabled={!canEdit} />
              </Field>
              <Field label="Primary phone">
                <Input name="phone" defaultValue={settings.phone ?? ""} disabled={!canEdit} />
              </Field>
              <Field label="Secondary phone">
                <Input name="secondary_phone" defaultValue={settings.secondary_phone ?? ""} disabled={!canEdit} />
              </Field>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-slate-950/60">
          <SectionHeading title="Address and legal details" description="Contact details, registry data, and invoice identity shown on quote documents." />
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Field label="Address line 1">
              <Input name="address_line_1" defaultValue={settings.address_line_1 ?? ""} disabled={!canEdit} />
            </Field>
            <Field label="Address line 2">
              <Input name="address_line_2" defaultValue={settings.address_line_2 ?? ""} disabled={!canEdit} />
            </Field>
            <Field label="District">
              <Input name="district" defaultValue={settings.district ?? ""} disabled={!canEdit} />
            </Field>
            <Field label="City">
              <Input name="city" defaultValue={settings.city ?? ""} disabled={!canEdit} />
            </Field>
            <Field label="Postal code">
              <Input name="postal_code" defaultValue={settings.postal_code ?? ""} disabled={!canEdit} />
            </Field>
            <Field label="Country">
              <Input name="country" defaultValue={settings.country ?? ""} disabled={!canEdit} />
            </Field>
            <Field label="Tax office">
              <Input name="tax_office" defaultValue={settings.tax_office ?? ""} disabled={!canEdit} />
            </Field>
            <Field label="Tax number">
              <Input name="tax_number" defaultValue={settings.tax_number ?? ""} disabled={!canEdit} />
            </Field>
            <Field label="Trade registry number">
              <Input name="trade_registry_number" defaultValue={settings.trade_registry_number ?? ""} disabled={!canEdit} />
            </Field>
            <Field label="MERSIS number">
              <Input name="mersis_number" defaultValue={settings.mersis_number ?? ""} disabled={!canEdit} />
            </Field>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-slate-950/60">
          <SectionHeading title="Banking" description="Store bank details for invoice and payment instructions." />
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Field label="Bank name">
              <Input name="bank_name" defaultValue={settings.bank_name ?? ""} disabled={!canEdit} />
            </Field>
            <Field label="Bank branch">
              <Input name="bank_branch" defaultValue={settings.bank_branch ?? ""} disabled={!canEdit} />
            </Field>
            <Field label="IBAN">
              <Input name="iban" defaultValue={settings.iban ?? ""} disabled={!canEdit} />
            </Field>
            <Field label="Account holder">
              <Input name="account_holder" defaultValue={settings.account_holder ?? ""} disabled={!canEdit} />
            </Field>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-slate-950/60">
          <SectionHeading title="Quote defaults" description="Default values applied to newly created quotes in this workspace." />
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Field label="Default currency">
              <Select name="default_currency" defaultValue={settings.default_currency} disabled={!canEdit}>
                {currencyOptions.map((currency) => (
                  <option key={currency.value} value={currency.value}>
                    {currency.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Default tax rate" hint="%">
              <Input name="default_tax_rate" type="number" step="0.01" min="0" max="100" defaultValue={settings.default_tax_rate} disabled={!canEdit} />
            </Field>
            <Field label="Default validity days">
              <Input name="default_quote_validity_days" type="number" step="1" min="1" max="365" defaultValue={settings.default_quote_validity_days} disabled={!canEdit} />
            </Field>
            <Field label="Company slogan">
              <Input name="company_slogan" defaultValue={settings.company_slogan ?? ""} disabled={!canEdit} />
            </Field>
            <Field label="Signature name">
              <Input name="signature_name" defaultValue={settings.signature_name ?? ""} disabled={!canEdit} />
            </Field>
            <Field label="Signature title">
              <Input name="signature_title" defaultValue={settings.signature_title ?? ""} disabled={!canEdit} />
            </Field>
            <div className="md:col-span-2">
              <Field label="Payment terms">
                <Textarea name="default_payment_terms" defaultValue={settings.default_payment_terms ?? ""} disabled={!canEdit} rows={4} />
              </Field>
            </div>
            <div className="md:col-span-2">
              <Field label="Delivery terms">
                <Textarea name="default_delivery_terms" defaultValue={settings.default_delivery_terms ?? ""} disabled={!canEdit} rows={4} />
              </Field>
            </div>
            <div className="md:col-span-2">
              <Field label="Default quote notes">
                <Textarea name="default_quote_notes" defaultValue={settings.default_quote_notes ?? ""} disabled={!canEdit} rows={5} />
              </Field>
            </div>
            <div className="md:col-span-2">
              <Field label="Quote footer text">
                <Textarea name="quote_footer_text" defaultValue={settings.quote_footer_text ?? ""} disabled={!canEdit} rows={4} />
              </Field>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              type="submit"
              disabled={!canEdit}
              className="inline-flex h-11 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-950"
            >
              <Upload className="h-4 w-4" />
              Save workspace settings
            </button>
          </div>
        </section>
      </form>

      <aside className="space-y-6">
        <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-slate-950/60">
          <SectionHeading title="Quote brand preview" description="These values are injected into the printable quote document and PDF." />
          <div className="mt-6 space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
              <div className="flex items-start gap-4">
                <LogoPreview url={previewUrl} companyName={settings.company_name} />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-950 dark:text-white">{settings.company_name}</p>
                  <p className="text-sm text-slate-500">{settings.legal_name ?? "Legal name not set"}</p>
                  <p className="text-sm text-slate-500">{settings.company_slogan ?? "No slogan configured"}</p>
                </div>
              </div>
            </div>

            <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
              <Row label="Currency" value={settings.default_currency} />
              <Row label="Tax rate" value={`${settings.default_tax_rate.toFixed(2)}%`} />
              <Row label="Validity" value={`${settings.default_quote_validity_days} days`} />
              <Row label="Payment terms" value={settings.default_payment_terms ?? "Not set"} />
              <Row label="Delivery terms" value={settings.default_delivery_terms ?? "Not set"} />
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-slate-950/60">
          <SectionHeading title="Access rules" description="Only owner and admin roles can change company settings or manage the logo." />
          <div className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
            <p>Demo workspaces stay read only so sample data is never mutated.</p>
            <p>Viewer roles can inspect the settings page but cannot submit changes.</p>
            <p>Uploaded logos are stored server-side in Supabase Storage and referenced by quote documents.</p>
          </div>
        </section>
      </aside>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-white/5">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-950 dark:text-white">{value}</span>
    </div>
  );
}
