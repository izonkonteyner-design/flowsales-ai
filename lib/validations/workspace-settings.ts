import { z } from "zod";

import { CURRENCY_CODES } from "@/lib/constants";
import type { CurrencyCode } from "@/types/crm";

const currencyValues = CURRENCY_CODES.map((currency) => currency.value) as [CurrencyCode, ...CurrencyCode[]];
const controlCharacters = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

function hasControlCharacters(value: string) {
  return controlCharacters.test(value);
}

function normalizeSingleLine(value: string) {
  const trimmed = value.replace(/\r\n/g, "\n").trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.replace(/\s+/g, " ");
}

function normalizeMultiline(value: string) {
  const normalized = value.replace(/\r\n/g, "\n").trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeWebsite(value: string) {
  const normalized = normalizeSingleLine(value);
  if (!normalized) {
    return null;
  }

  const next = /^[a-z][a-z0-9+.-]*:\/\//i.test(normalized) ? normalized : `https://${normalized}`;
  try {
    return new URL(next).toString();
  } catch {
    return null;
  }
}

function normalizeEmail(value: string) {
  const normalized = normalizeSingleLine(value);
  return normalized ? normalized.toLowerCase() : null;
}

function normalizeIban(value: string) {
  const normalized = normalizeSingleLine(value);
  return normalized ? normalized.replace(/\s+/g, "").toUpperCase() : null;
}

function optionalSingleLine(field: string, max = 255) {
  return z
    .string()
    .refine((value) => !hasControlCharacters(value), { message: `${field} contains unsupported characters.` })
    .transform((value) => normalizeSingleLine(value))
    .refine((value) => value === null || value.length <= max, { message: `${field} is too long.` });
}

function optionalMultiline(field: string, max = 2000) {
  return z
    .string()
    .refine((value) => !hasControlCharacters(value), { message: `${field} contains unsupported characters.` })
    .transform((value) => normalizeMultiline(value))
    .refine((value) => value === null || value.length <= max, { message: `${field} is too long.` });
}

function optionalEmail() {
  return z
    .string()
    .refine((value) => !hasControlCharacters(value), { message: "Email contains unsupported characters." })
    .transform((value) => normalizeEmail(value))
    .refine((value) => value === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), { message: "Enter a valid email address." });
}

function optionalWebsite() {
  return z
    .string()
    .refine((value) => !hasControlCharacters(value), { message: "Website contains unsupported characters." })
    .transform((value) => normalizeWebsite(value))
    .refine((value) => value === null || /^https?:\/\//.test(value), { message: "Enter a valid website URL." });
}

function optionalIban() {
  return z
    .string()
    .refine((value) => !hasControlCharacters(value), { message: "IBAN contains unsupported characters." })
    .transform((value) => normalizeIban(value))
    .refine((value) => value === null || /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(value), {
      message: "Enter a valid IBAN.",
    });
}

function requiredCompanyName() {
  return z
    .string()
    .refine((value) => !hasControlCharacters(value), { message: "Company name contains unsupported characters." })
    .transform((value) => normalizeSingleLine(value))
    .refine((value): value is string => Boolean(value && value.length > 1), { message: "Company name is required." })
    .refine((value) => value.length <= 160, { message: "Company name is too long." });
}

export const workspaceSettingsInputSchema = z
  .object({
    company_name: requiredCompanyName(),
    legal_name: optionalSingleLine("Legal name", 200),
    website: optionalWebsite(),
    email: optionalEmail(),
    phone: optionalSingleLine("Phone", 50),
    secondary_phone: optionalSingleLine("Secondary phone", 50),
    address_line_1: optionalSingleLine("Address line 1", 250),
    address_line_2: optionalSingleLine("Address line 2", 250),
    district: optionalSingleLine("District", 120),
    city: optionalSingleLine("City", 120),
    postal_code: optionalSingleLine("Postal code", 40),
    country: optionalSingleLine("Country", 80),
    tax_office: optionalSingleLine("Tax office", 120),
    tax_number: optionalSingleLine("Tax number", 64),
    trade_registry_number: optionalSingleLine("Trade registry number", 64),
    mersis_number: optionalSingleLine("MERSIS number", 64),
    bank_name: optionalSingleLine("Bank name", 160),
    bank_branch: optionalSingleLine("Bank branch", 160),
    iban: optionalIban(),
    account_holder: optionalSingleLine("Account holder", 160),
    default_currency: z.enum(currencyValues),
    default_tax_rate: z.coerce.number().min(0, "Tax rate cannot be negative.").max(100, "Tax rate cannot exceed 100%."),
    default_payment_terms: optionalMultiline("Payment terms", 1000),
    default_delivery_terms: optionalMultiline("Delivery terms", 1000),
    default_quote_notes: optionalMultiline("Quote notes", 2000),
    default_quote_validity_days: z.coerce.number().int().min(1, "Validity must be at least 1 day.").max(365, "Validity cannot exceed 365 days."),
    quote_footer_text: optionalMultiline("Quote footer", 1000),
    signature_name: optionalSingleLine("Signature name", 160),
    signature_title: optionalSingleLine("Signature title", 160),
    company_slogan: optionalSingleLine("Company slogan", 180),
  })
  .transform((value) => ({
    ...value,
    default_tax_rate: Number(value.default_tax_rate),
    default_quote_validity_days: Number(value.default_quote_validity_days),
  }));

export const workspaceLogoMetadataSchema = z.object({
  name: z.string().trim().min(1).max(160),
  type: z.enum(["image/png", "image/jpeg", "image/webp"]),
  size: z.number().int().positive().max(2_000_000),
});

export type WorkspaceSettingsInput = z.output<typeof workspaceSettingsInputSchema>;
export type WorkspaceLogoMetadata = z.output<typeof workspaceLogoMetadataSchema>;

export function normalizeWorkspaceWebsiteValue(value: string) {
  return normalizeWebsite(value);
}

export function normalizeWorkspaceEmailValue(value: string) {
  return normalizeEmail(value);
}

export function normalizeWorkspaceIbanValue(value: string) {
  return normalizeIban(value);
}

