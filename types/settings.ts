import type { CurrencyCode } from "@/types/crm";

export type QuoteDefaults = {
  default_currency: CurrencyCode;
  default_tax_rate: number;
  default_payment_terms: string | null;
  default_delivery_terms: string | null;
  default_quote_notes: string | null;
  default_quote_validity_days: number;
};

export type WorkspaceCompanySettings = QuoteDefaults & {
  company_name: string;
  legal_name: string | null;
  logo_url: string | null;
  logo_path: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  secondary_phone: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  district: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  tax_office: string | null;
  tax_number: string | null;
  trade_registry_number: string | null;
  mersis_number: string | null;
  bank_name: string | null;
  bank_branch: string | null;
  iban: string | null;
  account_holder: string | null;
  quote_footer_text: string | null;
  signature_name: string | null;
  signature_title: string | null;
  company_slogan: string | null;
};

export type WorkspaceCompanySettingsInput = {
  company_name: string;
  legal_name: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  secondary_phone: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  district: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  tax_office: string | null;
  tax_number: string | null;
  trade_registry_number: string | null;
  mersis_number: string | null;
  bank_name: string | null;
  bank_branch: string | null;
  iban: string | null;
  account_holder: string | null;
  default_currency: CurrencyCode;
  default_tax_rate: number;
  default_payment_terms: string | null;
  default_delivery_terms: string | null;
  default_quote_notes: string | null;
  default_quote_validity_days: number;
  quote_footer_text: string | null;
  signature_name: string | null;
  signature_title: string | null;
  company_slogan: string | null;
};

export type WorkspaceCompanySettingsUpdate = WorkspaceCompanySettingsInput;

export type WorkspaceSettingsResult = {
  canEdit: boolean;
  error: string | null;
  settings: WorkspaceCompanySettings | null;
  mode: "demo" | "live";
};

export type WorkspaceSettingsActionState = {
  success: boolean;
  message: string;
  fieldErrors: Partial<Record<keyof WorkspaceCompanySettingsInput | "logo_file", string>>;
};
