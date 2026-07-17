import { createSupabaseServerClient } from "@/lib/supabase/server";
import { demoLeads } from "@/server/services/crm-data";
import { normalizeQuoteCurrency, type QuoteRecordMode } from "@/server/services/quote-domain";
import { demoCustomers } from "@/server/services/workspace-data";
import type { Customer, CurrencyCode, Lead, Organization, QuoteStatus } from "@/types/crm";

const customerSelectColumns =
  "id, organization_id, full_name, company, email, phone, city, notes, created_by, created_at, updated_at, source_lead_id";
const leadSelectColumns =
  "id, organization_id, full_name, company, email, phone, city, source, status, estimated_value, currency, notes, assigned_to, next_follow_up_at, created_by, created_at, updated_at, converted_customer_id, converted_at, converted_by";
const quoteSelectColumns =
  "id, organization_id, lead_id, customer_id, quote_number, issue_date, valid_until, expiry_date, status, currency, grand_total, total, created_at, updated_at";

export type CustomerRecordMode = QuoteRecordMode;

export type CustomerRow = Customer & {
  recordMode: CustomerRecordMode;
  source_lead_name: string | null;
  accepted_value: number;
  last_quote_at: string | null;
  quote_count: number;
};

export type RelatedQuoteSummary = {
  id: string;
  quote_number: string;
  status: QuoteStatus;
  issue_date: string;
  currency: CurrencyCode;
  grand_total: number;
  total: number;
  lead_id: string | null;
  customer_id: string | null;
};

export type QuoteRecipientType = "lead" | "customer" | "none";

export type QuoteRecipientResolution = {
  recipientType: QuoteRecipientType;
  leadId: string | null;
  customerId: string | null;
  sourceLeadId: string | null;
  lead: (Pick<Lead, "id" | "converted_customer_id"> & Partial<Pick<Lead, "organization_id" | "full_name" | "company" | "email" | "phone" | "city" | "notes">>) | null;
  customer: (Pick<Customer, "id"> & Partial<Pick<Customer, "organization_id" | "name" | "company" | "email" | "phone" | "city" | "source_lead_id">>) | null;
};

function normalizeToken(value: string | null | undefined) {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/\s+/g, " ") : "";
}

type RelatedQuoteRow = {
  id: string | null;
  quote_number: string | null;
  status: QuoteStatus | null;
  issue_date: string | null;
  currency: CurrencyCode | null;
  grand_total: number | null;
  total: number | null;
  lead_id: string | null;
  customer_id: string | null;
};

export function normalizeEmail(value: string | null | undefined) {
  return normalizeToken(value);
}

export function normalizePhone(value: string | null | undefined) {
  const digits = typeof value === "string" ? value.replace(/[^\d+]/g, "") : "";
  return digits.replace(/^\+/, "");
}

export function normalizeCustomerDuplicateKey(value: string | null | undefined) {
  return normalizeToken(value).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function customerMatchesLead(candidate: Pick<Customer, "email" | "phone" | "company" | "name">, lead: Pick<Lead, "email" | "phone" | "company" | "full_name">) {
  const candidateEmail = normalizeEmail(candidate.email);
  const leadEmail = normalizeEmail(lead.email);
  if (candidateEmail && leadEmail && candidateEmail === leadEmail) {
    return true;
  }

  const candidatePhone = normalizePhone(candidate.phone);
  const leadPhone = normalizePhone(lead.phone);
  if (candidatePhone && leadPhone && candidatePhone === leadPhone) {
    return true;
  }

  const candidateCompany = normalizeCustomerDuplicateKey(candidate.company);
  const leadCompany = normalizeCustomerDuplicateKey(lead.company);
  const candidateName = normalizeCustomerDuplicateKey(candidate.name);
  const leadName = normalizeCustomerDuplicateKey(lead.full_name);

  return Boolean(candidateCompany && leadCompany && candidateName && leadName && candidateCompany === leadCompany && candidateName === leadName);
}

export function buildCustomerInsertFromLead(
  lead: Pick<Lead, "organization_id" | "full_name" | "company" | "email" | "phone" | "city" | "notes" | "id">,
  userId: string | null,
  sourceLeadId = lead.id,
) {
  return {
    organization_id: lead.organization_id,
    full_name: lead.full_name,
    company: lead.company ?? null,
    email: lead.email ?? null,
    phone: lead.phone ?? null,
    city: lead.city ?? null,
    notes: lead.notes ?? null,
    created_by: userId,
    source_lead_id: sourceLeadId,
  };
}

export function chooseQuoteRecipient(
  lead: QuoteRecipientResolution["lead"],
  customer: QuoteRecipientResolution["customer"],
): QuoteRecipientResolution {
  if (customer) {
    return {
      recipientType: "customer",
      leadId: lead?.id ?? null,
      customerId: customer.id,
      sourceLeadId: lead?.id ?? null,
      lead,
      customer,
    };
  }

  if (lead) {
    return {
      recipientType: "lead",
      leadId: lead.id,
      customerId: lead.converted_customer_id ?? null,
      sourceLeadId: lead.id,
      lead,
      customer: null,
    };
  }

  return {
    recipientType: "none",
    leadId: null,
    customerId: null,
    sourceLeadId: null,
    lead: null,
    customer: null,
  };
}

function mapRelatedQuote(row: RelatedQuoteRow): RelatedQuoteSummary {
  return {
    id: String(row.id ?? ""),
    quote_number: String(row.quote_number ?? ""),
    status: row.status ?? "draft",
    issue_date: String(row.issue_date ?? ""),
    currency: normalizeQuoteCurrency(row.currency, "TRY"),
    grand_total: Number(row.grand_total ?? row.total ?? 0),
    total: Number(row.total ?? row.grand_total ?? 0),
    lead_id: row.lead_id ?? null,
    customer_id: row.customer_id ?? null,
  };
}

export async function loadLiveLeadById(organizationId: string, leadId: string) {
  const client = await createSupabaseServerClient();
  if (!client) {
    return null;
  }

  const { data, error } = await client
    .from("leads")
    .select(leadSelectColumns)
    .eq("id", leadId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as QuoteRecipientResolution["lead"];
}

export async function loadLiveCustomerById(organizationId: string, customerId: string) {
  const client = await createSupabaseServerClient();
  if (!client) {
    return null;
  }

  const { data, error } = await client
    .from("contacts")
    .select(customerSelectColumns)
    .eq("id", customerId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const row = data as Record<string, unknown>;
  return {
    id: typeof row.id === "string" ? row.id : "",
    organization_id: typeof row.organization_id === "string" ? row.organization_id : organizationId,
    name: typeof row.full_name === "string" ? row.full_name : "",
    company: typeof row.company === "string" ? row.company : "",
    email: typeof row.email === "string" ? row.email : "",
    phone: typeof row.phone === "string" ? row.phone : "",
    city: typeof row.city === "string" ? row.city : "",
    source_lead_id: typeof row.source_lead_id === "string" ? row.source_lead_id : null,
  };
}

export async function loadDemoLeadById(leadId: string) {
  return demoLeads.find((lead) => lead.id === leadId) ?? null;
}

export async function loadDemoCustomerById(customerId: string) {
  return demoCustomers.find((customer) => customer.id === customerId) ?? null;
}

export async function loadRelatedQuotesByLead(organizationId: string, leadId: string, limit = 5) {
  const client = await createSupabaseServerClient();
  if (!client) {
    return [];
  }

  const { data, error } = await client
    .from("quotes")
    .select(quoteSelectColumns)
    .eq("organization_id", organizationId)
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  return data.map(mapRelatedQuote);
}

export async function loadRelatedQuotesByCustomer(organizationId: string, customerId: string, limit = 5) {
  const client = await createSupabaseServerClient();
  if (!client) {
    return [];
  }

  const { data, error } = await client
    .from("quotes")
    .select(quoteSelectColumns)
    .eq("organization_id", organizationId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  return data.map(mapRelatedQuote);
}

export async function loadQuoteRecipientResolution(organizationId: string, leadId: string | null, customerId: string | null): Promise<QuoteRecipientResolution> {
  const [lead, customer] = await Promise.all([
    leadId ? loadLiveLeadById(organizationId, leadId) : Promise.resolve(null),
    customerId ? loadLiveCustomerById(organizationId, customerId) : Promise.resolve(null),
  ]);

  if (customer) {
    return chooseQuoteRecipient(lead, customer);
  }

  if (lead?.converted_customer_id) {
    const convertedCustomer = await loadLiveCustomerById(organizationId, lead.converted_customer_id);
    return chooseQuoteRecipient(lead, convertedCustomer);
  }

  return chooseQuoteRecipient(lead, null);
}

export async function loadQuoteRecipientDemo(leadId: string | null, customerId: string | null): Promise<QuoteRecipientResolution> {
  const lead = leadId ? (demoLeads.find((item) => item.id === leadId) ?? null) : null;
  const customer = customerId ? (demoCustomers.find((item) => item.id === customerId) ?? null) : null;
  return chooseQuoteRecipient(lead, customer);
}

export function summarizeCustomerQuotes(customer: Customer, quotes: RelatedQuoteSummary[]) {
  const acceptedValue = quotes.reduce((sum, quote) => sum + Number(quote.grand_total ?? quote.total ?? 0), 0);
  const lastQuoteAt = quotes[0]?.issue_date ?? null;

  return {
    lifetime_value: acceptedValue || Number(customer.lifetime_value ?? 0),
    last_quote_at: lastQuoteAt,
    quote_count: quotes.length,
  };
}

export function customerRecordModeFromContext(mode: QuoteRecordMode): CustomerRecordMode {
  return mode;
}

export function getCustomerRecordBadge(recordMode: CustomerRecordMode) {
  if (recordMode === "demo") {
    return {
      label: "Demo data",
      tone: "neutral" as const,
      title: "Connect live Supabase data or convert a real lead to edit this record.",
    };
  }

  return {
    label: "Live data",
    tone: "success" as const,
    title: "This customer is stored in live Supabase data.",
  };
}

export function getCustomerRecordRestrictionMessage(recordMode: CustomerRecordMode, role: Organization["role"] | null | undefined) {
  if (recordMode === "demo") {
    return "Connect live Supabase data or convert a real lead to edit this record.";
  }

  if (role === "viewer") {
    return "Viewer permissions can inspect customers but cannot create, edit, delete, or convert leads.";
  }

  return "";
}
