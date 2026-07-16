import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import { createDemoWorkspaceContext, loadWorkspaceContext } from "@/server/services/workspace-context";
import { demoLeads, demoProducts, demoQuotes } from "@/server/services/crm-data";
import {
  buildDashboardPeriod,
  buildDashboardReport,
  normalizeDashboardCurrency,
  normalizeDashboardSearchParams,
} from "@/server/services/dashboard-domain";
import type { CurrencyCode, Quote, QuoteItem } from "@/types/crm";
import type { DashboardFilters, DashboardReport, QuoteReportingRow } from "@/types/reporting";

type DashboardDataResult =
  | { ok: true; report: DashboardReport }
  | { ok: false; status: 400 | 403 | 404 | 500; message: string };

type LiveQuoteRow = Quote & {
  customer_name: string | null;
  customer_company: string | null;
  lead_name: string | null;
  lead_company: string | null;
};

type LiveQuoteItemRow = QuoteItem & {
  quote_id: string;
  name: string | null;
  description: string | null;
  sku: string | null;
  currency: CurrencyCode;
  line_total: number;
  sort_order: number;
};

const quoteColumns =
  "id, organization_id, lead_id, customer_id, quote_number, issue_date, valid_until, expiry_date, status, currency, notes, payment_terms, delivery_terms, subtotal, discount_total, line_discount_total, order_discount_type, order_discount_value, order_discount_total, taxable_subtotal, shipping_total, tax_total, grand_total, total, created_by, created_at, updated_at";

const quoteItemColumns =
  "id, quote_id, product_id, name, description, sku, quantity, unit, currency, unit_price, discount_type, discount_value, tax_rate, line_total, sort_order, created_at, updated_at";

const leadColumns = "id, organization_id, full_name, company, status, estimated_value, currency, created_at, updated_at";
const productColumns = "id, organization_id, name, sku, active, currency";
const contactColumns = "id, full_name, company";

function mapDemoSource(context = createDemoWorkspaceContext()) {
  const quotes: QuoteReportingRow[] = demoQuotes.map((quote) => ({
    ...quote,
    lead_name: demoLeads.find((lead) => lead.id === quote.lead_id)?.full_name ?? null,
    lead_company: demoLeads.find((lead) => lead.id === quote.lead_id)?.company ?? null,
    customer_name: null,
    customer_company: null,
    items: quote.items.map((item, index) => ({
      ...item,
      id: item.id ?? `${quote.id}-${index}`,
      quote_id: quote.id,
      product_id: item.product_id ?? null,
      name: item.name ?? item.description ?? "Manual line",
      description: item.description ?? "",
      sku: item.sku ?? null,
      quantity: Number(item.quantity ?? 0),
      unit: item.unit ?? "unit",
      currency: (item.currency ?? quote.currency) as CurrencyCode,
      unit_price: Number(item.unit_price ?? 0),
      discount_type: item.discount_type ?? "percentage",
      discount_value: Number(item.discount_value ?? 0),
      tax_rate: Number(item.tax_rate ?? 0),
      line_total: Number(item.line_total ?? 0),
      sort_order: Number(item.sort_order ?? index),
    })),
  }));

  return {
    context,
    source: {
      leads: demoLeads.map((lead) => ({
        id: lead.id,
        organization_id: lead.organization_id,
        full_name: lead.full_name,
        company: lead.company ?? null,
        status: lead.status,
        estimated_value: lead.estimated_value,
        currency: lead.currency as CurrencyCode,
        created_at: lead.created_at,
        updated_at: lead.updated_at,
      })),
      products: demoProducts.map((product) => ({
        id: product.id,
        organization_id: product.organization_id,
        name: product.name,
        sku: product.sku ?? undefined,
        active: Boolean(product.active),
        currency: product.currency as CurrencyCode,
      })),
      quotes,
    },
  };
}

function mapLiveQuoteRows(
  quotes: LiveQuoteRow[],
  items: LiveQuoteItemRow[],
): QuoteReportingRow[] {
  const itemMap = new Map<string, LiveQuoteItemRow[]>();

  for (const item of items) {
    const existing = itemMap.get(item.quote_id) ?? [];
    existing.push(item);
    itemMap.set(item.quote_id, existing);
  }

  return quotes.map((quote) => ({
    ...quote,
    lead_name: quote.lead_name ?? null,
    lead_company: quote.lead_company ?? null,
    customer_name: quote.customer_name ?? null,
    customer_company: quote.customer_company ?? null,
    items: (itemMap.get(quote.id) ?? []).map((item) => ({
      ...item,
      id: item.id,
      quote_id: item.quote_id,
      product_id: item.product_id ?? null,
      name: item.name ?? item.description ?? "Manual line",
      description: item.description ?? "",
      sku: item.sku ?? null,
      quantity: Number(item.quantity ?? 0),
      unit: item.unit ?? "unit",
      currency: item.currency as CurrencyCode,
      unit_price: Number(item.unit_price ?? 0),
      discount_type: item.discount_type ?? "percentage",
      discount_value: Number(item.discount_value ?? 0),
      tax_rate: Number(item.tax_rate ?? 0),
      line_total: Number(item.line_total ?? 0),
      sort_order: Number(item.sort_order ?? 0),
    })),
  }));
}

async function loadLiveDashboardReport(filters: DashboardFilters): Promise<DashboardDataResult> {
  const context = await loadWorkspaceContext();
  if (!context) {
    return buildDemoReport(filters);
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    return { ok: false, status: 500, message: "Unable to load dashboard data right now." };
  }

  const period = buildDashboardPeriod(filters);
  const queryStart = period.comparisonStart ?? period.start;
  const queryEnd = period.end;

  const leadQuery = client.from("leads").select(leadColumns).eq("organization_id", context.organization.id).order("created_at", { ascending: false });
  const productQuery = client.from("products").select(productColumns).eq("organization_id", context.organization.id).order("name", { ascending: true });
  const quoteQuery = client.from("quotes").select(quoteColumns).eq("organization_id", context.organization.id).order("updated_at", { ascending: false });

  if (queryStart && queryEnd) {
    leadQuery.gte("created_at", `${queryStart}T00:00:00.000Z`).lte("created_at", `${queryEnd}T23:59:59.999Z`);
    quoteQuery.gte("issue_date", queryStart).lte("issue_date", queryEnd);
  }

  const [leadsResponse, productsResponse, quotesResponse] = await Promise.all([leadQuery, productQuery, quoteQuery]);
  if (leadsResponse.error || productsResponse.error || quotesResponse.error) {
    return { ok: false, status: 500, message: "Unable to load dashboard data right now." };
  }

  const quoteRows = (quotesResponse.data ?? []) as LiveQuoteRow[];
  const quoteIds = quoteRows.map((quote) => quote.id);
  const leadIds = [...new Set(quoteRows.map((quote) => quote.lead_id).filter((value): value is string => Boolean(value)))];
  const customerIds = [...new Set(quoteRows.map((quote) => quote.customer_id).filter((value): value is string => Boolean(value)))];

  const [itemResponse, leadRecipientsResponse, customerRecipientsResponse] = await Promise.all([
    quoteIds.length
      ? client.from("quote_items").select(quoteItemColumns).in("quote_id", quoteIds).order("sort_order", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    leadIds.length ? client.from("leads").select("id, full_name, company").in("id", leadIds) : Promise.resolve({ data: [], error: null }),
    customerIds.length ? client.from("contacts").select(contactColumns).in("id", customerIds) : Promise.resolve({ data: [], error: null }),
  ]);

  if (itemResponse.error || leadRecipientsResponse.error || customerRecipientsResponse.error) {
    return { ok: false, status: 500, message: "Unable to load dashboard data right now." };
  }

  const leadMap = new Map<string, { full_name: string; company: string | null }>();
  for (const lead of (leadRecipientsResponse.data ?? []) as Array<{ id: string; full_name: string; company: string | null }>) {
    leadMap.set(lead.id, { full_name: lead.full_name, company: lead.company });
  }

  const customerMap = new Map<string, { full_name: string; company: string | null }>();
  for (const customer of (customerRecipientsResponse.data ?? []) as Array<{ id: string; full_name: string; company: string | null }>) {
    customerMap.set(customer.id, { full_name: customer.full_name, company: customer.company });
  }

  const enrichedQuotes = quoteRows.map((quote) => ({
    ...quote,
    lead_name: quote.lead_id ? leadMap.get(quote.lead_id)?.full_name ?? null : null,
    lead_company: quote.lead_id ? leadMap.get(quote.lead_id)?.company ?? null : null,
    customer_name: quote.customer_id ? customerMap.get(quote.customer_id)?.full_name ?? null : null,
    customer_company: quote.customer_id ? customerMap.get(quote.customer_id)?.company ?? null : null,
  }));

  return {
    ok: true,
    report: buildDashboardReport(
      {
        leads: (leadsResponse.data ?? []).map((lead) => ({
          id: lead.id,
          organization_id: lead.organization_id,
          full_name: lead.full_name,
          company: lead.company ?? null,
          status: lead.status,
          estimated_value: Number(lead.estimated_value ?? 0),
          currency: lead.currency as CurrencyCode,
          created_at: lead.created_at,
          updated_at: lead.updated_at,
        })),
        products: (productsResponse.data ?? []).map((product) => ({
          id: product.id,
          organization_id: product.organization_id,
          name: product.name,
          sku: product.sku ?? undefined,
          active: Boolean(product.active),
          currency: product.currency as CurrencyCode,
        })),
        quotes: mapLiveQuoteRows(enrichedQuotes, (itemResponse.data ?? []) as LiveQuoteItemRow[]),
      },
      {
        mode: "live",
        organization: context.organization,
        role: context.role,
        userId: context.userId,
      },
      filters,
    ),
  };
}

function buildDemoReport(filters: DashboardFilters): DashboardDataResult {
  const { context, source } = mapDemoSource();
  return {
    ok: true,
    report: buildDashboardReport(source, context, filters),
  };
}

export async function getDashboardReportData(
  input: Partial<Record<string, string | string[] | undefined>>,
): Promise<DashboardDataResult> {
  const liveContext = hasSupabaseConfig() ? await loadWorkspaceContext() : null;
  const fallbackCurrency = liveContext?.organization.currency
    ? normalizeDashboardCurrency(liveContext.organization.currency, "TRY")
    : "TRY";
  const filters = normalizeDashboardSearchParams(input, fallbackCurrency);

  if (!hasSupabaseConfig()) {
    return buildDemoReport(filters);
  }

  if (!liveContext) {
    return buildDemoReport(filters);
  }

  return loadLiveDashboardReport(filters);
}
