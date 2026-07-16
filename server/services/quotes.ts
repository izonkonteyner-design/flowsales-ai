/* eslint-disable @typescript-eslint/no-explicit-any */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { demoQuotes, demoLeads, demoProducts } from "@/server/services/crm-data";
import { demoCustomers } from "@/server/services/workspace-data";
import { createDemoWorkspaceContext, getWorkspaceContext, type WorkspaceRole } from "@/server/services/workspace-context";
import {
  canManageQuotes,
  calculateNormalizedQuoteTotals,
  filterQuotes,
  formatQuoteFollowUpState,
  generateQuoteNumber,
  getQuoteRecordBadge,
  getQuoteRecordRestrictionMessage,
  getQuoteStatusLabel,
  getQuoteStatusTone,
  normalizeQuoteSearchParams,
  sortQuotes,
  type QuoteFilterState,
  type QuoteRecordMode,
  type QuoteWorkspaceContext,
} from "@/server/services/quote-domain";
import { quoteLineItemSchema, quoteStatusSchema, type QuoteFormInput } from "@/lib/validations/quote";
import type { CurrencyCode, Quote, QuoteItem, QuoteStatus } from "@/types/crm";

type PartyOption = {
  id: string;
  label: string;
  subtitle: string;
};

type ProductOption = {
  id: string;
  label: string;
  subtitle: string;
  sku: string;
  unit: string;
  currency: CurrencyCode;
  unit_price: number;
  active: boolean;
};

export type QuoteRow = Quote & {
  recordMode: QuoteRecordMode;
  lead_name: string | null;
  lead_company: string | null;
  customer_name: string | null;
  customer_company: string | null;
  item_count: number;
  status_label: string;
  status_tone: ReturnType<typeof getQuoteStatusTone>;
  record_badge: ReturnType<typeof getQuoteRecordBadge>;
  follow_up_state: ReturnType<typeof formatQuoteFollowUpState>;
};

export type QuotePageData = {
  context: QuoteWorkspaceContext;
  filters: QuoteFilterState;
  total: number;
  page: number;
  totalPages: number;
  quotes: QuoteRow[];
  error: string | null;
};

export type QuoteDetailData = {
  context: QuoteWorkspaceContext;
  quote: QuoteRow | null;
  error: string | null;
};

export type QuoteFormData = {
  context: QuoteWorkspaceContext;
  quote: QuoteRow | null;
  leadOptions: PartyOption[];
  customerOptions: PartyOption[];
  productOptions: ProductOption[];
  defaultQuoteNumber: string;
  canMutate: boolean;
  error: string | null;
};

const quoteSelectColumns =
  "id, organization_id, lead_id, customer_id, quote_number, issue_date, valid_until, expiry_date, status, currency, notes, payment_terms, delivery_terms, subtotal, discount_total, line_discount_total, order_discount_type, order_discount_value, order_discount_total, taxable_subtotal, shipping_total, tax_total, grand_total, total, created_by, created_at, updated_at";

const quoteItemColumns =
  "id, quote_id, product_id, name, description, sku, quantity, unit, currency, unit_price, discount, discount_type, discount_value, tax_rate, line_subtotal, line_discount, taxable_subtotal, line_tax, line_total, sort_order, created_at, updated_at";

const quoteLeadColumns = "id, full_name, company";
const quoteContactColumns = "id, full_name, company";
const quoteProductColumns = "id, name, sku, category, unit, currency, base_price, unit_price, active";

function toStringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function createDemoOptions() {
  return {
    leadOptions: demoLeads.map((lead) => ({
      id: lead.id,
      label: lead.full_name,
      subtitle: lead.company ?? "",
    })),
    customerOptions: demoCustomers.map((customer) => ({
      id: customer.id,
      label: customer.name,
      subtitle: customer.company ?? "",
    })),
    productOptions: demoProducts.map((product) => ({
      id: product.id,
      label: product.name,
      subtitle: product.category,
      sku: product.sku ?? "",
      unit: product.unit ?? "unit",
      currency: product.currency as CurrencyCode,
      unit_price: Number(product.unit_price ?? product.base_price ?? 0),
      active: Boolean(product.active),
    })),
  };
}

function normalizeQuoteItem(raw: any, fallbackCurrency: CurrencyCode): QuoteItem {
  const quantity = Number(raw.quantity ?? 0);
  const unitPrice = Number(raw.unit_price ?? raw.unitPrice ?? 0);
  const lineSubtotal = Number(raw.line_subtotal ?? quantity * unitPrice);
  const lineDiscount = Number(raw.line_discount ?? 0);
  const taxableSubtotal = Number(raw.taxable_subtotal ?? lineSubtotal - lineDiscount);
  const lineTax = Number(raw.line_tax ?? 0);
  const lineTotal = Number(raw.line_total ?? taxableSubtotal + lineTax);

  return {
    id: String(raw.id ?? ""),
    quote_id: raw.quote_id ?? null,
    product_id: raw.product_id ?? null,
    name: toStringValue(raw.name ?? raw.description, ""),
    description: toStringValue(raw.description, ""),
    sku: toStringValue(raw.sku, ""),
    quantity,
    unit: toStringValue(raw.unit, "unit") || "unit",
    currency: (raw.currency as CurrencyCode | undefined) ?? fallbackCurrency,
    unit_price: unitPrice,
    discount: typeof raw.discount === "number" ? raw.discount : undefined,
    discount_type: raw.discount_type ?? "percentage",
    discount_value: Number(raw.discount_value ?? raw.discount ?? 0),
    tax_rate: Number(raw.tax_rate ?? 0),
    line_subtotal: lineSubtotal,
    line_discount: lineDiscount,
    taxable_subtotal: taxableSubtotal,
    line_tax: lineTax,
    line_total: lineTotal,
    sort_order: Number(raw.sort_order ?? 0),
    created_at: raw.created_at ?? undefined,
    updated_at: raw.updated_at ?? undefined,
  };
}

function normalizeQuoteRecord(
  raw: any,
  recordMode: QuoteRecordMode,
  relationships: {
    lead_name?: string | null;
    lead_company?: string | null;
    customer_name?: string | null;
    customer_company?: string | null;
  },
  items: QuoteItem[],
): QuoteRow {
  const issueDate = toStringValue(raw.issue_date, "");
  const validUntil = toStringValue(raw.valid_until ?? raw.expiry_date ?? issueDate, issueDate);
  const subtotal = Number(raw.subtotal ?? items.reduce((sum, item) => sum + Number(item.line_subtotal ?? 0), 0));
  const lineDiscountTotal = Number(
    raw.line_discount_total ?? raw.discount_total ?? items.reduce((sum, item) => sum + Number(item.line_discount ?? 0), 0),
  );
  const orderDiscountTotal = Number(raw.order_discount_total ?? 0);
  const taxableSubtotal = Number(raw.taxable_subtotal ?? subtotal - lineDiscountTotal - orderDiscountTotal);
  const taxTotal = Number(raw.tax_total ?? items.reduce((sum, item) => sum + Number(item.line_tax ?? 0), 0));
  const shippingTotal = Number(raw.shipping_total ?? 0);
  const grandTotal = Number(raw.grand_total ?? raw.total ?? taxableSubtotal + taxTotal + shippingTotal);
  const status = raw.status as QuoteStatus;

  return {
    id: String(raw.id ?? ""),
    organization_id: String(raw.organization_id ?? ""),
    lead_id: raw.lead_id ?? null,
    customer_id: raw.customer_id ?? null,
    quote_number: toStringValue(raw.quote_number, ""),
    issue_date: issueDate,
    valid_until: validUntil,
    expiry_date: raw.expiry_date ?? validUntil,
    status,
    currency: toStringValue(raw.currency, "TRY"),
    notes: toStringValue(raw.notes, ""),
    payment_terms: toStringValue(raw.payment_terms, ""),
    delivery_terms: toStringValue(raw.delivery_terms, ""),
    shipping_total: shippingTotal,
    subtotal,
    discount_total: Number(raw.discount_total ?? lineDiscountTotal + orderDiscountTotal),
    line_discount_total: lineDiscountTotal,
    order_discount_type: raw.order_discount_type ?? "percentage",
    order_discount_value: Number(raw.order_discount_value ?? 0),
    order_discount_total: orderDiscountTotal,
    taxable_subtotal: taxableSubtotal,
    tax_total: taxTotal,
    grand_total: grandTotal,
    total: Number(raw.total ?? grandTotal),
    items,
    created_by: toStringValue(raw.created_by, ""),
    created_at: toStringValue(raw.created_at, ""),
    updated_at: toStringValue(raw.updated_at, ""),
    recordMode,
    lead_name: relationships.lead_name ?? null,
    lead_company: relationships.lead_company ?? null,
    customer_name: relationships.customer_name ?? null,
    customer_company: relationships.customer_company ?? null,
    item_count: items.length,
    status_label: getQuoteStatusLabel(status),
    status_tone: getQuoteStatusTone(status),
    record_badge: getQuoteRecordBadge(recordMode),
    follow_up_state: formatQuoteFollowUpState(validUntil),
  };
}

function normalizeQuoteItems(items: any[], fallbackCurrency: CurrencyCode) {
  return items
    .map((item) => normalizeQuoteItem(item, fallbackCurrency))
    .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
}

function normalizeQuoteRows(rows: any[], recordMode: QuoteRecordMode, relations: Record<string, { full_name: string; company: string | null }>, itemMap: Map<string, any[]>) {
  return rows.map((row) => {
    const quoteItems = normalizeQuoteItems(itemMap.get(String(row.id)) ?? [], row.currency as CurrencyCode);
    return normalizeQuoteRecord(
      row,
      recordMode,
      {
        lead_name: row.lead_id ? relations[`lead:${row.lead_id}`]?.full_name ?? null : null,
        lead_company: row.lead_id ? relations[`lead:${row.lead_id}`]?.company ?? null : null,
        customer_name: row.customer_id ? relations[`contact:${row.customer_id}`]?.full_name ?? null : null,
        customer_company: row.customer_id ? relations[`contact:${row.customer_id}`]?.company ?? null : null,
      },
      quoteItems,
    );
  });
}

async function getContext(): Promise<QuoteWorkspaceContext> {
  const context = await getWorkspaceContext();
  return {
    mode: context.mode,
    organization: context.organization,
    role: context.role,
    userId: context.userId,
  };
}

async function loadDemoQuotePageData(filters: QuoteFilterState): Promise<QuotePageData> {
  const rows = demoQuotes.map((quote) =>
    normalizeQuoteRecord(
      quote,
      "demo",
      {
        lead_name: demoLeads.find((lead) => lead.id === quote.lead_id)?.full_name ?? null,
        lead_company: demoLeads.find((lead) => lead.id === quote.lead_id)?.company ?? null,
        customer_name: null,
        customer_company: null,
      },
      normalizeQuoteItems(quote.items ?? [], quote.currency as CurrencyCode),
    ),
  );
  const filtered = sortQuotes(filterQuotes(rows, filters), filters.sort);
  const totalPages = Math.max(1, Math.ceil(filtered.length / filters.pageSize));
  const page = Math.min(Math.max(filters.page, 1), totalPages);
  const start = (page - 1) * filters.pageSize;

  return {
    context: {
      mode: "demo",
      organization: createDemoWorkspaceContext().organization,
      role: createDemoWorkspaceContext().role,
      userId: null,
    },
    filters,
    total: filtered.length,
    page,
    totalPages,
    quotes: filtered.slice(start, start + filters.pageSize),
    error: null,
  };
}

async function loadLiveQuotePageData(context: QuoteWorkspaceContext, filters: QuoteFilterState): Promise<QuotePageData> {
  const client = await createSupabaseServerClient();
  if (!client) {
    return {
      context,
      filters,
      total: 0,
      page: 1,
      totalPages: 1,
      quotes: [],
      error: "Unable to load quotes from Supabase.",
    };
  }

  const { data: quoteRows, error: quoteError } = await client
    .from("quotes")
    .select(quoteSelectColumns)
    .eq("organization_id", context.organization.id)
    .order("created_at", { ascending: false });

  if (quoteError) {
    return {
      context,
      filters,
      total: 0,
      page: 1,
      totalPages: 1,
      quotes: [],
      error: quoteError.message,
    };
  }

  const rows = (quoteRows ?? []) as any[];
  const quoteIds = rows.map((row) => row.id);
  const leadIds = [...new Set(rows.map((row) => row.lead_id).filter(Boolean))];
  const contactIds = [...new Set(rows.map((row) => row.customer_id).filter(Boolean))];

  const [itemResult, leadResult, contactResult] = await Promise.all([
    quoteIds.length
      ? client.from("quote_items").select(quoteItemColumns).in("quote_id", quoteIds).order("sort_order", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    leadIds.length
      ? client.from("leads").select(quoteLeadColumns).in("id", leadIds)
      : Promise.resolve({ data: [], error: null }),
    contactIds.length
      ? client.from("contacts").select(quoteContactColumns).in("id", contactIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if ((itemResult as any).error || (leadResult as any).error || (contactResult as any).error) {
    return {
      context,
      filters,
      total: 0,
      page: 1,
      totalPages: 1,
      quotes: [],
      error: (itemResult as any).error?.message ?? (leadResult as any).error?.message ?? (contactResult as any).error?.message ?? "Unable to load quotes.",
    };
  }

  const relations: Record<string, { full_name: string; company: string | null }> = {};
  for (const lead of ((leadResult as any).data ?? []) as any[]) {
    relations[`lead:${lead.id}`] = { full_name: lead.full_name, company: lead.company };
  }
  for (const contact of ((contactResult as any).data ?? []) as any[]) {
    relations[`contact:${contact.id}`] = { full_name: contact.full_name, company: contact.company };
  }

  const itemMap = new Map<string, any[]>();
  for (const item of ((itemResult as any).data ?? []) as any[]) {
    const quoteId = String(item.quote_id);
    const existing = itemMap.get(quoteId) ?? [];
    existing.push(item);
    itemMap.set(quoteId, existing);
  }

  const mappedRows = normalizeQuoteRows(rows, "live", relations, itemMap);
  const filtered = sortQuotes(filterQuotes(mappedRows, filters), filters.sort);
  const totalPages = Math.max(1, Math.ceil(filtered.length / filters.pageSize));
  const page = Math.min(Math.max(filters.page, 1), totalPages);
  const start = (page - 1) * filters.pageSize;

  return {
    context,
    filters,
    total: filtered.length,
    page,
    totalPages,
    quotes: filtered.slice(start, start + filters.pageSize),
    error: null,
  };
}

async function loadQuoteOptions(context: QuoteWorkspaceContext) {
  if (context.mode === "demo") {
    return {
      ...createDemoOptions(),
      defaultQuoteNumber: generateQuoteNumber(demoQuotes.map((quote) => quote.quote_number), new Date()),
    };
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    return null;
  }

  const [leadResult, contactResult, productResult, quoteNumbers] = await Promise.all([
    client.from("leads").select(quoteLeadColumns).eq("organization_id", context.organization.id).order("created_at", { ascending: false }),
    client.from("contacts").select(quoteContactColumns).eq("organization_id", context.organization.id).order("created_at", { ascending: false }),
    client.from("products").select(quoteProductColumns).eq("organization_id", context.organization.id).order("created_at", { ascending: false }),
    client.from("quotes").select("quote_number").eq("organization_id", context.organization.id),
  ]);

  if (leadResult.error || contactResult.error || productResult.error || quoteNumbers.error) {
    return null;
  }

  return {
    leadOptions: ((leadResult.data ?? []) as any[]).map((row) => ({
      id: row.id,
      label: row.full_name,
      subtitle: row.company ?? "",
    })),
    customerOptions: ((contactResult.data ?? []) as any[]).map((row) => ({
      id: row.id,
      label: row.full_name,
      subtitle: row.company ?? "",
    })),
    productOptions: ((productResult.data ?? []) as any[]).map((row) => ({
      id: row.id,
      label: row.name,
      subtitle: row.category,
      sku: row.sku ?? "",
      unit: row.unit ?? "unit",
      currency: row.currency as CurrencyCode,
      unit_price: Number(row.unit_price ?? row.base_price ?? 0),
      active: Boolean(row.active),
    })),
    defaultQuoteNumber: generateQuoteNumber(((quoteNumbers.data ?? []) as any[]).map((row) => row.quote_number), new Date()),
  };
}

async function getMutationContext() {
  const context = await getContext();
  if (context.mode === "demo") {
    return null;
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    return null;
  }

  return { context, client };
}

export function buildQuotePayload(input: QuoteFormInput, quoteNumber = input.quote_number) {
  const totals = calculateNormalizedQuoteTotals(input.items, {
    currency: input.currency,
    shipping_total: input.shipping_total,
    order_discount_type: input.order_discount_type,
    order_discount_value: input.order_discount_value,
  });

  return {
    quote: {
      lead_id: input.lead_id ?? null,
      customer_id: input.customer_id ?? null,
      quote_number: quoteNumber,
      issue_date: input.issue_date,
      valid_until: input.valid_until,
      expiry_date: input.valid_until,
      status: input.status,
      currency: input.currency,
      notes: input.notes,
      payment_terms: input.payment_terms,
      delivery_terms: input.delivery_terms,
      subtotal: totals.subtotal,
      discount_total: totals.discount_total,
      line_discount_total: totals.line_discount_total,
      order_discount_type: input.order_discount_type,
      order_discount_value: input.order_discount_value,
      order_discount_total: totals.order_discount_total,
      taxable_subtotal: totals.taxable_subtotal,
      shipping_total: totals.shipping_total,
      tax_total: totals.tax_total,
      grand_total: totals.grand_total,
      total: totals.grand_total,
    },
    items: input.items.map((item, index) => {
      const normalized = quoteLineItemSchema.parse({ ...item, sort_order: item.sort_order ?? index });
      const lineMath = calculateNormalizedQuoteTotals([normalized], {
        currency: input.currency,
        shipping_total: 0,
        order_discount_type: "percentage",
        order_discount_value: 0,
      }).line_items[0];

      return {
        product_id: normalized.product_id ?? null,
        name: normalized.name,
        description: normalized.description ?? "",
        sku: normalized.sku ?? "",
        quantity: normalized.quantity,
        unit: normalized.unit,
        currency: normalized.currency,
        unit_price: normalized.unit_price,
        discount_type: normalized.discount_type,
        discount_value: normalized.discount_value,
        tax_rate: normalized.tax_rate,
        line_subtotal: lineMath.subtotal,
        line_discount: lineMath.line_discount,
        taxable_subtotal: lineMath.taxable_subtotal,
        line_tax: lineMath.tax_total,
        line_total: lineMath.total,
        sort_order: normalized.sort_order,
      };
    }),
  };
}

export function buildDuplicateQuoteInput(source: QuoteRow, existingQuoteNumbers: string[], now = new Date()): QuoteFormInput {
  return {
    lead_id: source.lead_id ?? null,
    customer_id: source.customer_id ?? null,
    quote_number: generateQuoteNumber(existingQuoteNumbers, now),
    issue_date: now.toISOString().slice(0, 10),
    valid_until: source.valid_until ?? source.issue_date,
    status: "draft",
    currency: source.currency as CurrencyCode,
    shipping_total: source.shipping_total ?? 0,
    order_discount_type: (source.order_discount_type ?? "percentage") as QuoteFormInput["order_discount_type"],
    order_discount_value: source.order_discount_value ?? 0,
    notes: source.notes,
    payment_terms: source.payment_terms,
    delivery_terms: source.delivery_terms,
    items: source.items.map((item, index) => ({
      product_id: item.product_id ?? null,
      name: item.name ?? item.description ?? "Quote line",
      description: item.description ?? "",
      sku: item.sku ?? "",
      quantity: item.quantity ?? 1,
      unit: item.unit ?? "unit",
      unit_price: item.unit_price ?? 0,
      currency: item.currency ?? (source.currency as CurrencyCode),
      discount_type: item.discount_type ?? "percentage",
      discount_value: item.discount_value ?? 0,
      tax_rate: item.tax_rate ?? 0,
      sort_order: index,
    })),
  };
}

async function loadQuoteById(context: QuoteWorkspaceContext, id: string): Promise<QuoteRow | null> {
  if (context.mode === "demo") {
    const demoQuote = demoQuotes.find((quote) => quote.id === id);
    if (!demoQuote) {
      return null;
    }

    return normalizeQuoteRecord(
      demoQuote,
      "demo",
      {
        lead_name: demoLeads.find((lead) => lead.id === demoQuote.lead_id)?.full_name ?? null,
        lead_company: demoLeads.find((lead) => lead.id === demoQuote.lead_id)?.company ?? null,
        customer_name: null,
        customer_company: null,
      },
      normalizeQuoteItems(demoQuote.items ?? [], demoQuote.currency as CurrencyCode),
    );
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    return null;
  }

  const { data, error } = await client.from("quotes").select(quoteSelectColumns).eq("id", id).eq("organization_id", context.organization.id).maybeSingle();
  if (error || !data) {
    return null;
  }

  const [itemsResult, leadResult, contactResult] = await Promise.all([
    client.from("quote_items").select(quoteItemColumns).eq("quote_id", id).order("sort_order", { ascending: true }),
    data.lead_id ? client.from("leads").select(quoteLeadColumns).eq("id", data.lead_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    data.customer_id ? client.from("contacts").select(quoteContactColumns).eq("id", data.customer_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);

  return normalizeQuoteRecord(
    data,
    "live",
    {
      lead_name: (leadResult as any).data?.full_name ?? null,
      lead_company: (leadResult as any).data?.company ?? null,
      customer_name: (contactResult as any).data?.full_name ?? null,
      customer_company: (contactResult as any).data?.company ?? null,
    },
    normalizeQuoteItems(((itemsResult as any).data ?? []) as any[], data.currency as CurrencyCode),
  );
}

export async function getQuotePageData(input: Partial<Record<string, string | string[] | undefined>>) {
  const context = await getContext();
  const filters = normalizeQuoteSearchParams(input);

  if (context.mode === "demo") {
    return loadDemoQuotePageData(filters);
  }

  return loadLiveQuotePageData(context, filters);
}

export async function getQuoteDetailData(id: string): Promise<QuoteDetailData> {
  const context = await getContext();
  const quote = await loadQuoteById(context, id);
  return {
    context,
    quote,
    error: quote ? null : "Quote not found.",
  };
}

export async function getQuoteFormData(id?: string): Promise<QuoteFormData> {
  const context = await getContext();
  const canMutate = context.mode === "live" && canManageQuotes(context.role);
  const options = await loadQuoteOptions(context);
  const quote = id ? await loadQuoteById(context, id) : null;

  if (!options) {
    return {
      context,
      quote,
      leadOptions: [],
      customerOptions: [],
      productOptions: [],
      defaultQuoteNumber: generateQuoteNumber([], new Date()),
      canMutate,
      error: "Unable to load quote form options.",
    };
  }

  return {
    context,
    quote,
    ...options,
    canMutate,
    error: null,
  };
}

function assertCanMutate(context: QuoteWorkspaceContext) {
  if (!canManageQuotes(context.role)) {
    throw new Error("You do not have permission to manage quotes.");
  }
}

export async function createQuoteRecord(input: QuoteFormInput) {
  const mutation = await getMutationContext();
  if (!mutation) {
    throw new Error("Quote creation requires a live Supabase session.");
  }

  assertCanMutate(mutation.context);
  const payload = buildQuotePayload(input);

  const { data, error } = await mutation.client
    .from("quotes")
    .insert({
      organization_id: mutation.context.organization.id,
      created_by: mutation.context.userId,
      ...payload.quote,
    })
    .select(quoteSelectColumns)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to create quote.");
  }

  const itemsResult = await mutation.client.from("quote_items").insert(
    payload.items.map((item) => ({
      quote_id: data.id,
      ...item,
    })),
  );

  if (itemsResult.error) {
    throw new Error(itemsResult.error.message ?? "Unable to save quote items.");
  }

  return { quote: data };
}

export async function updateQuoteRecord(id: string, input: QuoteFormInput) {
  const mutation = await getMutationContext();
  if (!mutation) {
    throw new Error("Quote updates require a live Supabase session.");
  }

  assertCanMutate(mutation.context);
  const payload = buildQuotePayload(input);

  const { data, error } = await mutation.client
    .from("quotes")
    .update(payload.quote)
    .eq("id", id)
    .eq("organization_id", mutation.context.organization.id)
    .select(quoteSelectColumns)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to update quote.");
  }

  const deleteResult = await mutation.client.from("quote_items").delete().eq("quote_id", id);
  if (deleteResult.error) {
    throw new Error(deleteResult.error.message ?? "Unable to replace quote items.");
  }

  const itemsResult = await mutation.client.from("quote_items").insert(
    payload.items.map((item) => ({
      quote_id: id,
      ...item,
    })),
  );

  if (itemsResult.error) {
    throw new Error(itemsResult.error.message ?? "Unable to save quote items.");
  }

  return { quote: data };
}

export async function updateQuoteStatusRecord(id: string, status: QuoteStatus | string) {
  const mutation = await getMutationContext();
  if (!mutation) {
    throw new Error("Quote status updates require a live Supabase session.");
  }

  assertCanMutate(mutation.context);
  const nextStatus = quoteStatusSchema.safeParse(status);
  if (!nextStatus.success) {
    throw new Error("Invalid quote status.");
  }

  const { data, error } = await mutation.client
    .from("quotes")
    .update({ status: nextStatus.data })
    .eq("id", id)
    .eq("organization_id", mutation.context.organization.id)
    .select(quoteSelectColumns)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to update quote status.");
  }

  return { quote: data };
}

export async function duplicateQuoteRecord(id: string) {
  const context = await getContext();
  const source = await loadQuoteById(context, id);
  if (!source) {
    throw new Error("Quote not found.");
  }

  const mutation = await getMutationContext();
  if (!mutation) {
    throw new Error("Quote duplication requires a live Supabase session.");
  }

  assertCanMutate(mutation.context);

  const { data: quoteNumbers } = await mutation.client.from("quotes").select("quote_number").eq("organization_id", mutation.context.organization.id);
  const payload = buildDuplicateQuoteInput(source, ((quoteNumbers ?? []) as any[]).map((quote) => quote.quote_number), new Date());

  return createQuoteRecord(payload);
}

export async function deleteQuoteRecord(id: string) {
  const mutation = await getMutationContext();
  if (!mutation) {
    throw new Error("Quote deletion requires a live Supabase session.");
  }

  assertCanMutate(mutation.context);
  const { error } = await mutation.client.from("quotes").delete().eq("id", id).eq("organization_id", mutation.context.organization.id);
  if (error) {
    throw new Error(error.message ?? "Unable to delete quote.");
  }
}

export function getQuoteStatusRestriction(quote: Pick<QuoteRow, "recordMode">, role: WorkspaceRole | null | undefined) {
  return getQuoteRecordRestrictionMessage(quote.recordMode, role);
}
