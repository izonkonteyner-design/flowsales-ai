import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import { demoLeads, demoQuotes } from "@/server/services/crm-data";
import {
  getCustomerRecordBadge,
  getCustomerRecordRestrictionMessage,
  loadRelatedQuotesByCustomer,
  type CustomerRecordMode,
  type CustomerRow,
  type RelatedQuoteSummary,
} from "@/server/services/crm-integration";
import { getWorkspaceContext, type WorkspaceContext } from "@/server/services/workspace-context";
import { demoCustomers } from "@/server/services/workspace-data";
import type { Customer, Lead, Organization, QuoteStatus } from "@/types/crm";

const customerColumns =
  "id, organization_id, full_name, company, email, phone, city, notes, created_by, created_at, updated_at, source_lead_id";
const leadColumns = "id, full_name, company";
const quoteColumns = "id, quote_number, status, issue_date, currency, grand_total, total, lead_id, customer_id, created_at";

type CustomerRecordRow = {
  id: string;
  organization_id: string;
  full_name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  source_lead_id: string | null;
  next_review_at?: string | null;
  last_order_at?: string | null;
  lifetime_value?: number | null;
};

type LeadRecordRow = {
  id: string;
  full_name: string;
  company: string | null;
};

type QuoteRecordRow = {
  id: string;
  quote_number: string;
  status: QuoteStatus;
  issue_date: string;
  currency: string;
  grand_total: number | null;
  total: number | null;
  lead_id: string | null;
  customer_id: string | null;
  created_at: string | null;
};

export type CustomerPageData = {
  context: WorkspaceContext;
  customers: CustomerRow[];
  total: number;
  error: string | null;
};

export type CustomerDetailData = {
  context: WorkspaceContext;
  customer: CustomerRow | null;
  sourceLead: Pick<Lead, "id" | "full_name" | "company"> | null;
  relatedQuotes: RelatedQuoteSummary[];
  error: string | null;
};

function mapCustomer(customer: Customer, recordMode: CustomerRecordMode, quoteCount = 0, lastQuoteAt: string | null = null, sourceLeadName: string | null = null): CustomerRow {
  return {
    ...customer,
    recordMode,
    source_lead_name: sourceLeadName,
    accepted_value: Number(customer.lifetime_value ?? 0),
    last_quote_at: lastQuoteAt,
    quote_count: quoteCount,
  };
}

function mapDemoCustomer(customer: Customer): CustomerRow {
  const sourceLead = demoLeads.find((lead) => lead.id === customer.source_lead_id) ?? null;
  const quotes = demoQuotes.filter((quote) => quote.customer_id === customer.id);
  const lastQuoteAt = quotes[0]?.created_at ?? customer.last_order_at ?? null;

  return mapCustomer(customer, "demo", quotes.length, lastQuoteAt, sourceLead?.full_name ?? null);
}

async function loadLiveCustomerRows(context: WorkspaceContext): Promise<CustomerPageData> {
  const client = await createSupabaseServerClient();
  if (!client) {
    return {
      context,
      customers: [],
      total: 0,
      error: "Unable to connect to Supabase.",
    };
  }

  const [customerResult, quoteResult] = await Promise.all([
    client.from("contacts").select(customerColumns).eq("organization_id", context.organization.id).order("created_at", { ascending: false }),
    client.from("quotes").select(quoteColumns).eq("organization_id", context.organization.id).order("created_at", { ascending: false }),
  ]);

  if (customerResult.error || quoteResult.error) {
    return {
      context,
      customers: [],
      total: 0,
      error: customerResult.error?.message ?? quoteResult.error?.message ?? "Unable to load customers.",
    };
  }

  const customerRows = (customerResult.data ?? []) as CustomerRecordRow[];
  const sourceLeadIds = [...new Set(customerRows.map((row) => row.source_lead_id).filter((value): value is string => Boolean(value)))];
  const sourceLeadResult = sourceLeadIds.length
    ? await client.from("leads").select(leadColumns).in("id", sourceLeadIds)
    : { data: [], error: null };

  if (sourceLeadResult.error) {
    return {
      context,
      customers: [],
      total: 0,
      error: sourceLeadResult.error.message ?? "Unable to load source leads.",
    };
  }

  const sourceLeadMap = new Map<string, string>();
  for (const row of (sourceLeadResult.data ?? []) as LeadRecordRow[]) {
    if (row.id) {
      sourceLeadMap.set(row.id, row.full_name ?? "");
    }
  }

  const quoteRows = (quoteResult.data ?? []) as QuoteRecordRow[];
  const quoteMap = new Map<string, RelatedQuoteSummary[]>();
  for (const row of quoteRows) {
    if (!row.customer_id) {
      continue;
    }

    const mapped: RelatedQuoteSummary = {
      id: String(row.id ?? ""),
      quote_number: String(row.quote_number ?? ""),
      status: row.status as QuoteStatus,
      issue_date: String(row.issue_date ?? ""),
      currency: String(row.currency ?? "TRY") as RelatedQuoteSummary["currency"],
      grand_total: Number(row.grand_total ?? row.total ?? 0),
      total: Number(row.total ?? row.grand_total ?? 0),
      lead_id: row.lead_id ?? null,
      customer_id: row.customer_id ?? null,
    };

    const existing = quoteMap.get(row.customer_id) ?? [];
    existing.push(mapped);
    quoteMap.set(row.customer_id, existing);
  }

  const customers = customerRows.map((row) => {
    const quotes = quoteMap.get(row.id) ?? [];
    const lastQuoteAt = quotes[0]?.issue_date ?? row.last_order_at ?? null;
    const lifetimeValue = quotes.reduce((sum, quote) => sum + Number(quote.grand_total ?? quote.total ?? 0), Number(row.lifetime_value ?? 0));
    const customer = {
      id: row.id,
      organization_id: row.organization_id,
      name: row.full_name,
      company: row.company ?? "",
      email: row.email ?? "",
      phone: row.phone ?? "",
      city: row.city ?? "",
      segment: row.source_lead_id ? "Converted" : "Customer",
      lifetime_value: lifetimeValue,
      last_order_at: lastQuoteAt,
      next_review_at: row.next_review_at ?? null,
      source_lead_id: row.source_lead_id ?? null,
      converted_at: row.created_at ?? null,
      converted_by: row.created_by ?? null,
      quote_count: quotes.length,
      last_quote_at: lastQuoteAt,
    };

    return mapCustomer(
      customer,
      "live",
      quotes.length,
      lastQuoteAt,
      row.source_lead_id ? sourceLeadMap.get(row.source_lead_id) ?? null : null,
    );
  });

  return {
    context,
    customers,
    total: customers.length,
    error: null,
  };
}

export async function getCustomerPageData(): Promise<CustomerPageData> {
  const context = await getWorkspaceContext();

  if (context.mode === "demo") {
    return {
      context,
      customers: demoCustomers.map(mapDemoCustomer),
      total: demoCustomers.length,
      error: null,
    };
  }

  if (!hasSupabaseConfig()) {
    return {
      context,
      customers: [],
      total: 0,
      error: "Supabase is not configured.",
    };
  }

  return loadLiveCustomerRows(context);
}

async function loadDemoCustomerDetail(id: string): Promise<CustomerDetailData> {
  const customer = demoCustomers.find((item) => item.id === id) ?? null;
  if (!customer) {
    return {
      context: await getWorkspaceContext(),
      customer: null,
      sourceLead: null,
      relatedQuotes: [],
      error: "Customer not found.",
    };
  }

  const sourceLead = customer.source_lead_id ? demoLeads.find((lead) => lead.id === customer.source_lead_id) ?? null : null;
  const relatedQuotes = demoQuotes
    .filter((quote) => quote.customer_id === customer.id)
    .map((quote) => ({
      id: quote.id,
      quote_number: quote.quote_number,
      status: quote.status as QuoteStatus,
      issue_date: quote.issue_date,
      currency: quote.currency as RelatedQuoteSummary["currency"],
      grand_total: Number(quote.grand_total ?? quote.total ?? 0),
      total: Number(quote.total ?? quote.grand_total ?? 0),
      lead_id: quote.lead_id ?? null,
      customer_id: quote.customer_id ?? null,
    }));

  return {
    context: await getWorkspaceContext(),
    customer: mapDemoCustomer(customer),
    sourceLead: sourceLead ? { id: sourceLead.id, full_name: sourceLead.full_name, company: sourceLead.company ?? "" } : null,
    relatedQuotes,
    error: null,
  };
}

async function loadLiveCustomerDetail(id: string): Promise<CustomerDetailData> {
  const context = await getWorkspaceContext();
  if (context.mode === "demo") {
    return loadDemoCustomerDetail(id);
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    return {
      context,
      customer: null,
      sourceLead: null,
      relatedQuotes: [],
      error: "Unable to connect to Supabase.",
    };
  }

  const customerResult = await client
    .from("contacts")
    .select(customerColumns)
    .eq("id", id)
    .eq("organization_id", context.organization.id)
    .maybeSingle();

  if (customerResult.error || !customerResult.data) {
    return {
      context,
      customer: null,
      sourceLead: null,
      relatedQuotes: [],
      error: "Customer not found.",
    };
  }

  const relatedQuotes = await loadRelatedQuotesByCustomer(context.organization.id, id, 10);
  const customerRow = customerResult.data as CustomerRecordRow;
  const sourceLead = customerRow.source_lead_id
    ? await client.from("leads").select(leadColumns).eq("id", customerRow.source_lead_id).eq("organization_id", context.organization.id).maybeSingle()
    : { data: null, error: null };

  return {
    context,
    customer: mapCustomer(
      {
        id: customerRow.id,
        organization_id: customerRow.organization_id,
        name: customerRow.full_name,
        company: customerRow.company ?? "",
        email: customerRow.email ?? "",
        phone: customerRow.phone ?? "",
        city: customerRow.city ?? "",
        segment: "Converted",
        lifetime_value: relatedQuotes.reduce((sum, quote) => sum + Number(quote.grand_total ?? quote.total ?? 0), 0),
        last_order_at: relatedQuotes[0]?.issue_date ?? null,
        next_review_at: null,
        source_lead_id: customerRow.source_lead_id ?? null,
        converted_at: customerRow.created_at ?? null,
        converted_by: customerRow.created_by ?? null,
      },
      "live",
      relatedQuotes.length,
      relatedQuotes[0]?.issue_date ?? null,
      null,
    ),
    sourceLead: sourceLead.data
      ? { id: sourceLead.data.id, full_name: sourceLead.data.full_name, company: sourceLead.data.company ?? "" }
      : null,
    relatedQuotes,
    error: null,
  };
}

export async function getCustomerDetailData(id: string): Promise<CustomerDetailData> {
  const context = await getWorkspaceContext();
  if (context.mode === "demo") {
    return loadDemoCustomerDetail(id);
  }

  if (!hasSupabaseConfig()) {
    return {
      context,
      customer: null,
      sourceLead: null,
      relatedQuotes: [],
      error: "Supabase is not configured.",
    };
  }

  return loadLiveCustomerDetail(id);
}

export function canReadCustomerRecord(recordMode: CustomerRecordMode, hasWorkspace = true) {
  return recordMode === "demo" ? true : hasWorkspace;
}

export function getCustomerRecordInfo(recordMode: CustomerRecordMode) {
  return getCustomerRecordBadge(recordMode);
}

export function getCustomerRestrictionMessage(recordMode: CustomerRecordMode, role: Organization["role"] | null | undefined) {
  return getCustomerRecordRestrictionMessage(recordMode, role);
}
