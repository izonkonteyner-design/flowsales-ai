import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import { demoCustomers } from "@/server/services/workspace-data";
import { loadWorkspaceContext } from "@/server/services/workspace-context";
import { demoLeads, demoProducts, demoOrganization } from "@/server/services/crm-data";
import { getQuoteStatusLabel, type QuoteRecordMode } from "@/server/services/quote-domain";
import { getQuoteDetailData, type QuoteRow } from "@/server/services/quotes";
import type { CurrencyCode, Organization, QuoteStatus } from "@/types/crm";

const quoteDocumentIdSchema = z.string().uuid();

const quoteDocumentLeadColumns = "id, full_name, company, email, phone, city, notes";
const quoteDocumentContactColumns = "id, full_name, company, email, phone, city, notes";
const quoteDocumentProductColumns = "id, image_url";

type QuoteDocumentCompany = {
  name: string;
  slug: string;
  currency: CurrencyCode;
};

type QuoteDocumentParty = {
  type: "customer" | "lead" | "none";
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  notes: string | null;
};

export type QuoteDocumentItem = {
  id: string;
  index: number;
  name: string;
  description: string;
  sku: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  discount: string;
  tax: string;
  line_total: number;
  product_image_url: string | null;
};

export type QuoteDocumentModel = {
  id: string;
  quote_number: string;
  status: QuoteStatus;
  status_label: string;
  currency: CurrencyCode;
  issue_date: string;
  valid_until: string;
  company: QuoteDocumentCompany;
  recipient: QuoteDocumentParty;
  items: QuoteDocumentItem[];
  subtotal: number;
  line_discount_total: number;
  order_discount_total: number;
  shipping_total: number;
  taxable_subtotal: number;
  tax_total: number;
  grand_total: number;
  notes: string;
  payment_terms: string;
  delivery_terms: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  recordMode: QuoteRecordMode;
  demoBadge: string;
};

export type QuoteDocumentResult =
  | { ok: true; document: QuoteDocumentModel }
  | { ok: false; status: 400 | 403 | 404 | 500; message: string };

function safeString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function safeNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function safeNumber(value: unknown, fallback = 0) {
  const next = typeof value === "number" ? value : Number(value);
  return Number.isFinite(next) ? next : fallback;
}

export function normalizeQuoteImageUrl(value: unknown): string | null {
  const raw = safeNullableString(value);
  if (!raw) {
    return null;
  }

  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function sanitizeFileNamePart(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/[\\/]+/g, "-")
    .replace(/[:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[^\p{L}\p{N}._ -]+/gu, "-")
    .replace(/[-_. ]{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildQuotePdfFileName(quoteNumber: string) {
  const safeNumber = sanitizeFileNamePart(quoteNumber) || "Quote";
  const trimmed = safeNumber.toLowerCase().endsWith(".pdf") ? safeNumber.slice(0, -4) : safeNumber;
  return `FlowSales-Quote-${trimmed}.pdf`;
}

function mapParty(party: Partial<QuoteDocumentParty> | null | undefined, type: QuoteDocumentParty["type"]): QuoteDocumentParty {
  return {
    type,
    name: safeString(party?.name, ""),
    company: safeNullableString(party?.company),
    email: safeNullableString(party?.email),
    phone: safeNullableString(party?.phone),
    city: safeNullableString(party?.city),
    notes: safeNullableString(party?.notes),
  };
}

function buildRecipient(quote: QuoteRow, lead: Partial<QuoteDocumentParty> | null, customer: Partial<QuoteDocumentParty> | null) {
  if (customer?.name) {
    return mapParty(customer, "customer");
  }

  if (lead?.name) {
    return mapParty(lead, "lead");
  }

  return mapParty({ name: "No recipient information" }, "none");
}

function resolveCompany(organization: Pick<Organization, "name" | "slug" | "currency">): QuoteDocumentCompany {
  return {
    name: organization.name,
    slug: organization.slug,
    currency: organization.currency as CurrencyCode,
  };
}

function quoteItemDiscountLabel(item: QuoteRow["items"][number]) {
  const discountValue = safeNumber(item.discount_value ?? item.discount ?? 0);
  if (discountValue <= 0) {
    return "—";
  }

  return item.discount_type === "fixed" ? `${discountValue.toFixed(2)} ${item.currency ?? ""}`.trim() : `${discountValue.toFixed(2)}%`;
}

function quoteItemTaxLabel(item: QuoteRow["items"][number]) {
  const taxRate = safeNumber(item.tax_rate ?? 0);
  return `${taxRate.toFixed(2)}%`;
}

function quoteItemLineTotal(item: QuoteRow["items"][number]) {
  return safeNumber(item.line_total ?? 0);
}

function mapQuoteDocumentItems(quote: QuoteRow, productImageMap: Map<string, string | null>) {
  return quote.items.map((item, index) => ({
    id: item.id,
    index: index + 1,
    name: safeString(item.name ?? item.description, "Quote line"),
    description: safeString(item.description, ""),
    sku: safeNullableString(item.sku) ?? null,
    quantity: safeNumber(item.quantity ?? 0),
    unit: safeString(item.unit, "unit"),
    unit_price: safeNumber(item.unit_price ?? 0),
    discount: quoteItemDiscountLabel(item),
    tax: quoteItemTaxLabel(item),
    line_total: quoteItemLineTotal(item),
    product_image_url: item.product_id ? productImageMap.get(item.product_id) ?? null : null,
  }));
}

export function buildQuoteDocumentModel(
  quote: QuoteRow,
  organization: Pick<Organization, "name" | "slug" | "currency">,
  lead: Partial<QuoteDocumentParty> | null,
  customer: Partial<QuoteDocumentParty> | null,
  productImageMap: Map<string, string | null>,
): QuoteDocumentModel {
  const recipient = buildRecipient(quote, lead, customer);

  return {
    id: quote.id,
    quote_number: quote.quote_number,
    status: quote.status,
    status_label: getQuoteStatusLabel(quote.status),
    currency: quote.currency as CurrencyCode,
    issue_date: quote.issue_date,
    valid_until: quote.valid_until ?? quote.expiry_date ?? quote.issue_date,
    company: resolveCompany(organization),
    recipient,
    items: mapQuoteDocumentItems(quote, productImageMap),
    subtotal: safeNumber(quote.subtotal ?? 0),
    line_discount_total: safeNumber(quote.line_discount_total ?? quote.discount_total ?? 0),
    order_discount_total: safeNumber(quote.order_discount_total ?? 0),
    shipping_total: safeNumber(quote.shipping_total ?? 0),
    taxable_subtotal: safeNumber(quote.taxable_subtotal ?? quote.subtotal ?? 0),
    tax_total: safeNumber(quote.tax_total ?? 0),
    grand_total: safeNumber(quote.grand_total ?? quote.total ?? 0),
    notes: safeString(quote.notes, ""),
    payment_terms: safeString(quote.payment_terms, ""),
    delivery_terms: safeString(quote.delivery_terms, ""),
    created_at: safeString(quote.created_at, ""),
    updated_at: safeString(quote.updated_at, ""),
    created_by: safeString(quote.created_by, ""),
    recordMode: quote.recordMode,
    demoBadge: quote.recordMode === "demo" ? "Demo data" : "Live data",
  };
}

function toQuoteDocumentParty(row: Record<string, unknown> | null | undefined, type: QuoteDocumentParty["type"]): Partial<QuoteDocumentParty> | null {
  if (!row) {
    return null;
  }

  return {
    type,
    name: safeString(row.full_name),
    company: safeNullableString(row.company),
    email: safeNullableString(row.email),
    phone: safeNullableString(row.phone),
    city: safeNullableString(row.city),
    notes: safeNullableString(row.notes),
  };
}

async function loadLiveQuoteDocument(quoteId: string): Promise<QuoteDocumentResult> {
  const context = await loadWorkspaceContext();
  if (!context) {
    return { ok: false, status: 404, message: "Quote not found." };
  }

  const detail = await getQuoteDetailData(quoteId);
  if (!detail.quote || detail.context.mode !== "live") {
    return { ok: false, status: 404, message: "Quote not found." };
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    return { ok: false, status: 500, message: "Unable to load quote document." };
  }

  const leadPromise = detail.quote.lead_id
    ? client
        .from("leads")
        .select(quoteDocumentLeadColumns)
        .eq("id", detail.quote.lead_id)
        .eq("organization_id", context.organization.id)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });

  const contactPromise = detail.quote.customer_id
    ? client
        .from("contacts")
        .select(quoteDocumentContactColumns)
        .eq("id", detail.quote.customer_id)
        .eq("organization_id", context.organization.id)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });

  const productPromise = detail.quote.items.some((item) => item.product_id)
    ? client
        .from("products")
        .select(quoteDocumentProductColumns)
        .eq("organization_id", context.organization.id)
        .in(
          "id",
          detail.quote.items.flatMap((item) => (item.product_id ? [item.product_id] : [])),
        )
    : Promise.resolve({ data: [], error: null });

  const [leadResult, contactResult, productResult] = await Promise.all([leadPromise, contactPromise, productPromise]);

  if (leadResult.error || contactResult.error || productResult.error) {
    return { ok: false, status: 500, message: "Unable to load quote document." };
  }

  const productImageMap = new Map<string, string | null>();
  for (const row of productResult.data ?? []) {
    const imageUrl = normalizeQuoteImageUrl(row.image_url);
    if (row.id) {
      productImageMap.set(row.id, imageUrl);
    }
  }

  return {
    ok: true,
    document: buildQuoteDocumentModel(
      detail.quote,
      context.organization,
      toQuoteDocumentParty(leadResult.data, "lead"),
      toQuoteDocumentParty(contactResult.data, "customer"),
      productImageMap,
    ),
  };
}

async function loadDemoQuoteDocument(quoteId: string): Promise<QuoteDocumentResult> {
  const detail = await getQuoteDetailData(quoteId);
  if (!detail.quote || detail.context.mode !== "demo") {
    return { ok: false, status: 404, message: "Quote not found." };
  }

  const lead = demoLeads.find((entry) => entry.id === detail.quote?.lead_id);
  const customer = demoCustomers.find((entry) => entry.id === detail.quote?.customer_id);
  const productImageMap = new Map<string, string | null>(
    demoProducts.map((product) => [product.id, normalizeQuoteImageUrl(product.image_url)]),
  );

  return {
    ok: true,
    document: buildQuoteDocumentModel(
      detail.quote,
      demoOrganization,
      lead
        ? {
            type: "lead",
            name: lead.full_name,
            company: lead.company ?? null,
            email: lead.email ?? null,
            phone: lead.phone ?? null,
            city: lead.city ?? null,
            notes: lead.notes ?? null,
          }
        : null,
      customer
        ? {
            type: "customer",
            name: customer.name,
            company: customer.company ?? null,
            email: customer.email ?? null,
            phone: customer.phone ?? null,
            city: customer.city ?? null,
            notes: null,
          }
        : null,
      productImageMap,
    ),
  };
}

export async function getQuoteDocumentData(quoteId: string): Promise<QuoteDocumentResult> {
  const parsed = quoteDocumentIdSchema.safeParse(quoteId);
  if (!parsed.success) {
    return { ok: false, status: 400, message: "Invalid quote id." };
  }

  if (hasSupabaseConfig()) {
    return loadLiveQuoteDocument(parsed.data);
  }

  return loadDemoQuoteDocument(parsed.data);
}

export function canReadQuoteDocument(recordMode: QuoteRecordMode, role: string | null | undefined, hasWorkspace = true) {
  if (recordMode === "demo") {
    return true;
  }

  return hasWorkspace && Boolean(role);
}

export function getQuoteDocumentRecipientLabel(document: QuoteDocumentModel) {
  if (document.recipient.type === "none") {
    return "No recipient information";
  }

  return document.recipient.company ? `${document.recipient.name} · ${document.recipient.company}` : document.recipient.name;
}

export function isQuoteDocumentDemo(document: QuoteDocumentModel) {
  return document.recordMode === "demo";
}
