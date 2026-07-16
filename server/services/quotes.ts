import { createSupabaseServerClient } from "@/lib/supabase/server";
import { demoLeads, demoProducts, demoQuotes } from "@/server/services/crm-data";
import { getWorkspaceContext, type WorkspaceMemberOption } from "@/server/services/workspace-context";
import type { Lead, Product, Quote, QuoteItem } from "@/types/crm";
import { calculateLineTotal, calculateQuoteTotals } from "@/server/services/quote-math";
import {
  canManageQuotes,
  filterQuotes,
  getQuoteLeadCompany,
  getQuoteLeadLabel,
  getQuoteRecordBadge,
  getQuoteRecordRestrictionMessage,
  getQuoteStatusLabel,
  getQuoteStatusTone,
  generateQuoteNumber,
  normalizeQuoteItems,
  normalizeQuoteSearchParams,
  sortQuotes,
  type QuoteFilterState,
  type QuoteRecordMode,
  type QuoteWorkspaceContext,
} from "@/server/services/quote-domain";

export type QuoteRow = Quote & {
  recordMode: QuoteRecordMode;
  lead_label: string;
  lead_company: string;
  items: QuoteItem[];
  item_count: number;
  grand_total: number;
};

export type QuotePageData = {
  context: QuoteWorkspaceContext;
  filters: QuoteFilterState;
  total: number;
  quotes: QuoteRow[];
  allQuotes: QuoteRow[];
  leads: Lead[];
  products: Product[];
  error: string | null;
};

export type QuoteDetailData = {
  context: QuoteWorkspaceContext;
  quote: QuoteRow | null;
  lead: Lead | null;
  products: Product[];
  error: string | null;
};

export type QuoteFormData = {
  context: QuoteWorkspaceContext;
  quote: QuoteRow | null;
  leadOptions: Lead[];
  productOptions: Product[];
  nextQuoteNumber: string;
  error: string | null;
};

function mapQuoteRow(quote: Quote, leads: Lead[], _products: Product[], recordMode: QuoteRecordMode): QuoteRow {
  const lead = quote.lead_id ? leads.find((entry) => entry.id === quote.lead_id) ?? null : null;
  const normalizedItems = normalizeQuoteItems(quote.items ?? []);
  const computedTotals = normalizedItems.length
    ? calculateQuoteTotals({
        items: normalizedItems.map((item) => ({
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount_type: item.discount_type,
          discount_value: item.discount_value,
          tax_rate: item.tax_rate,
        })),
        discount_type: quote.discount_type ?? "fixed",
        discount_value: quote.discount_value ?? 0,
        shipping_total: quote.shipping_total ?? 0,
      })
    : {
        subtotal: 0,
        lineDiscountTotal: 0,
        quoteDiscountTotal: 0,
        discountTotal: 0,
        taxTotal: 0,
        shippingTotal: quote.shipping_total ?? 0,
        grandTotal: quote.shipping_total ?? 0,
        total: quote.shipping_total ?? 0,
      };

  return {
    ...quote,
    lead_label: getQuoteLeadLabel(quote, lead),
    lead_company: getQuoteLeadCompany(quote, lead),
    items: normalizedItems.map((item, index) => ({
      ...item,
      id: item.id ?? `item-${index}`,
      line_total: calculateLineTotal({
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount_type: item.discount_type,
        discount_value: item.discount_value,
        tax_rate: item.tax_rate,
      }),
    })),
    item_count: normalizedItems.length,
    grand_total: quote.grand_total ?? quote.total ?? computedTotals.grandTotal,
    total: quote.total ?? quote.grand_total ?? computedTotals.grandTotal,
    recordMode,
  };
}

function mapProducts(products: Product[]) {
  return [...products].sort((a, b) => a.name.localeCompare(b.name));
}

async function buildQuoteContext() {
  const workspace = await getWorkspaceContext();
  if (workspace.mode === "demo") {
    return {
      mode: "demo" as const,
      organization: workspace.organization,
      role: workspace.role,
      userId: null,
      members: workspace.members as WorkspaceMemberOption[],
    };
  }

  return {
    mode: "live" as const,
    organization: workspace.organization,
    role: workspace.role,
    userId: workspace.userId,
    members: workspace.members as WorkspaceMemberOption[],
  };
}

async function loadQuoteCollections(context: QuoteWorkspaceContext) {
  const client = await createSupabaseServerClient();
  if (!client || context.mode === "demo") {
    return { error: null, leads: null, products: null, quotes: null, quoteItems: null };
  }

  const [leadsResponse, productsResponse, quotesResponse, quoteItemsResponse] = await Promise.all([
    client
      .from("leads")
      .select("id, organization_id, full_name, company, email, phone, city, source, status, estimated_value, currency, notes, assigned_to, next_follow_up_at, created_by, created_at, updated_at")
      .eq("organization_id", context.organization.id),
    client
      .from("products")
      .select("id, organization_id, sku, name, category, description, base_price, unit_price, currency, tax_rate, unit, active, specifications, created_by, created_at, updated_at")
      .eq("organization_id", context.organization.id),
    client
      .from("quotes")
      .select("id, organization_id, lead_id, quote_number, issue_date, expiry_date, status, currency, customer_name, customer_company, customer_email, customer_phone, notes, payment_terms, delivery_terms, subtotal, discount_total, tax_total, shipping_total, total, grand_total, discount_type, discount_value, created_by, created_at, updated_at")
      .eq("organization_id", context.organization.id),
    client
      .from("quote_items")
      .select("id, quote_id, product_id, name, description, quantity, unit, unit_price, discount, discount_type, discount_value, tax_rate, line_total, sort_order, created_at, updated_at")
      .order("sort_order", { ascending: true }),
  ]);

  const error = leadsResponse.error?.message ?? productsResponse.error?.message ?? quotesResponse.error?.message ?? quoteItemsResponse.error?.message ?? null;

  return {
    error,
    leads: (leadsResponse.data ?? []) as Lead[],
    products: (productsResponse.data ?? []) as Product[],
    quotes: (quotesResponse.data ?? []) as Quote[],
    quoteItems: (quoteItemsResponse.data ?? []) as QuoteItem[],
  };
}

function buildQuotePageData(
  context: QuoteWorkspaceContext,
  filters: QuoteFilterState,
  leads: Lead[],
  products: Product[],
  quotes: Quote[],
  error: string | null,
): QuotePageData {
  const quotesWithItems = quotes.map((quote) => ({
    ...quote,
    items: quote.items ?? [],
  }));
  const rows = sortQuotes(filterQuotes(quotesWithItems, filters, leads, products), filters.sort).map((quote) =>
    mapQuoteRow(quote, leads, products, context.mode),
  );

  return {
    context,
    filters,
    total: rows.length,
    quotes: rows,
    allQuotes: rows,
    leads,
    products,
    error,
  };
}

export async function getQuotePageData(input: Partial<Record<string, string | string[] | undefined>>) {
  const context = await buildQuoteContext();
  const filters = normalizeQuoteSearchParams(input);

  if (context.mode === "demo") {
    const leads = [...demoLeads];
    const products = mapProducts(demoProducts);
    const quotes = demoQuotes.map((quote) => ({
      ...quote,
      items: normalizeQuoteItems(quote.items ?? []),
    }));

    return buildQuotePageData(context, filters, leads, products, quotes, null);
  }

  const collections = await loadQuoteCollections(context);
  if (collections.error) {
    return buildQuotePageData(context, filters, [], [], [], collections.error);
  }

  return buildQuotePageData(
    context,
    filters,
    collections.leads ?? [],
    mapProducts(collections.products ?? []),
    (collections.quotes ?? []).map((quote) => ({
      ...quote,
      items: normalizeQuoteItems((collections.quoteItems ?? []).filter((item) => item.quote_id === quote.id)),
    })),
    null,
  );
}

export async function getQuoteDetailData(id: string) {
  const context = await buildQuoteContext();

  if (context.mode === "demo") {
    const quote = demoQuotes.find((entry) => entry.id === id) ?? null;
    const lead = quote?.lead_id ? demoLeads.find((item) => item.id === quote.lead_id) ?? null : null;
    return {
      context,
      quote: quote ? mapQuoteRow({ ...quote, items: normalizeQuoteItems(quote.items ?? []) }, demoLeads, demoProducts, "demo") : null,
      lead,
      products: mapProducts(demoProducts),
      error: null,
    } satisfies QuoteDetailData;
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    return {
      context,
      quote: null,
      lead: null,
      products: [],
      error: "Unable to load quotes from Supabase.",
    } satisfies QuoteDetailData;
  }

  const [quoteResponse, itemsResponse, leadsResponse, productsResponse] = await Promise.all([
    client
      .from("quotes")
      .select("id, organization_id, lead_id, quote_number, issue_date, expiry_date, status, currency, customer_name, customer_company, customer_email, customer_phone, notes, payment_terms, delivery_terms, subtotal, discount_total, tax_total, shipping_total, total, grand_total, discount_type, discount_value, created_by, created_at, updated_at")
      .eq("id", id)
      .eq("organization_id", context.organization.id)
      .maybeSingle(),
    client
      .from("quote_items")
      .select("id, quote_id, product_id, name, description, quantity, unit, unit_price, discount, discount_type, discount_value, tax_rate, line_total, sort_order, created_at, updated_at")
      .eq("quote_id", id)
      .order("sort_order", { ascending: true }),
    client
      .from("leads")
      .select("id, organization_id, full_name, company, email, phone, city, source, status, estimated_value, currency, notes, assigned_to, next_follow_up_at, created_by, created_at, updated_at")
      .eq("organization_id", context.organization.id),
    client
      .from("products")
      .select("id, organization_id, sku, name, category, description, base_price, unit_price, currency, tax_rate, unit, active, specifications, created_by, created_at, updated_at")
      .eq("organization_id", context.organization.id),
  ]);
  const quoteError = (quoteResponse as { error?: { message?: string } | null }).error?.message ?? null;
  const itemsError = (itemsResponse as { error?: { message?: string } | null }).error?.message ?? null;
  const leadsError = (leadsResponse as { error?: { message?: string } | null }).error?.message ?? null;
  const productsError = (productsResponse as { error?: { message?: string } | null }).error?.message ?? null;

  if (quoteError || !quoteResponse.data) {
    return {
      context,
      quote: null,
      lead: null,
      products: [],
      error: quoteError ?? "Quote not found.",
    } satisfies QuoteDetailData;
  }

  const leads = (leadsResponse.data ?? []) as Lead[];
  const products = (productsResponse.data ?? []) as Product[];
  const quote = mapQuoteRow(
    {
      ...(quoteResponse.data as Quote),
      items: normalizeQuoteItems((itemsResponse.data ?? []) as QuoteItem[]),
    },
    leads,
    products,
    "live",
  );

  return {
    context,
    quote,
    lead: quote.lead_id ? leads.find((entry) => entry.id === quote.lead_id) ?? null : null,
    products: mapProducts(products),
    error: quoteError ?? itemsError ?? leadsError ?? productsError ?? null,
  } satisfies QuoteDetailData;
}

export async function getQuoteFormData(id?: string): Promise<QuoteFormData> {
  const context = await buildQuoteContext();

  if (context.mode === "demo") {
    const leads = [...demoLeads];
    const products = mapProducts(demoProducts);
    const quote = id ? demoQuotes.find((entry) => entry.id === id) ?? null : null;

    return {
      context,
      quote: quote
        ? mapQuoteRow({ ...quote, items: normalizeQuoteItems(quote.items ?? []) }, leads, products, "demo")
        : null,
      leadOptions: leads,
      productOptions: products,
      nextQuoteNumber: generateQuoteNumber(demoQuotes.length + 1),
      error: null,
    };
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    return {
      context,
      quote: null,
      leadOptions: [],
      productOptions: [],
      nextQuoteNumber: "",
      error: "Unable to load quote form data.",
    };
  }

  const [leadResponse, productResponse, quoteResponse, quoteItemsResponse, countResponse] = await Promise.all([
    client
      .from("leads")
      .select("id, organization_id, full_name, company, email, phone, city, source, status, estimated_value, currency, notes, assigned_to, next_follow_up_at, created_by, created_at, updated_at")
      .eq("organization_id", context.organization.id)
      .order("created_at", { ascending: false }),
    client
      .from("products")
      .select("id, organization_id, sku, name, category, description, base_price, unit_price, currency, tax_rate, unit, active, specifications, created_by, created_at, updated_at")
      .eq("organization_id", context.organization.id)
      .eq("active", true)
      .order("name", { ascending: true }),
    id
      ? client
          .from("quotes")
          .select("id, organization_id, lead_id, quote_number, issue_date, expiry_date, status, currency, customer_name, customer_company, customer_email, customer_phone, notes, payment_terms, delivery_terms, subtotal, discount_total, tax_total, shipping_total, total, grand_total, discount_type, discount_value, created_by, created_at, updated_at")
          .eq("id", id)
          .eq("organization_id", context.organization.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    id
      ? client
          .from("quote_items")
          .select("id, quote_id, product_id, name, description, quantity, unit, unit_price, discount, discount_type, discount_value, tax_rate, line_total, sort_order, created_at, updated_at")
          .eq("quote_id", id)
          .order("sort_order", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    client
      .from("quotes")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", context.organization.id),
  ]);
  const leadError = (leadResponse as { error?: { message?: string } | null }).error?.message ?? null;
  const productError = (productResponse as { error?: { message?: string } | null }).error?.message ?? null;
  const quoteError = (quoteResponse as { error?: { message?: string } | null }).error?.message ?? null;
  const quoteItemsError = (quoteItemsResponse as { error?: { message?: string } | null }).error?.message ?? null;
  const countError = (countResponse as { error?: { message?: string } | null }).error?.message ?? null;

  const leadOptions = (leadResponse.data ?? []) as Lead[];
  const productOptions = mapProducts((productResponse.data ?? []) as Product[]);
  const quote = quoteResponse && "data" in quoteResponse && quoteResponse.data
    ? mapQuoteRow(
        {
          ...(quoteResponse.data as Quote),
          items: normalizeQuoteItems((quoteItemsResponse.data ?? []) as QuoteItem[]),
        },
        leadOptions,
        productOptions,
        "live",
      )
    : null;

  return {
    context,
    quote,
    leadOptions,
    productOptions,
    nextQuoteNumber: generateQuoteNumber((countResponse.count ?? 0) + 1),
    error: leadError ?? productError ?? quoteError ?? quoteItemsError ?? countError ?? null,
  };
}

async function getMutationContext() {
  const context = await buildQuoteContext();
  const client = await createSupabaseServerClient();

  if (!client || context.mode === "demo") {
    return null;
  }

  return { context, client };
}

function ensureCanManage(context: QuoteWorkspaceContext) {
  if (!canManageQuotes(context.role)) {
    throw new Error("You do not have permission to manage quotes.");
  }
}

function mapQuotePayload(input: {
  lead_id: string | null;
  quote_number: string;
  issue_date: string;
  expiry_date: string;
  status: Quote["status"];
  currency: string;
  customer_name: string;
  customer_company: string;
  customer_email: string;
  customer_phone: string;
  notes: string;
  payment_terms: string;
  delivery_terms: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  shipping_total: number;
  items: Array<{
    product_id: string;
    name: string;
    description: string;
    quantity: number;
    unit: string;
    unit_price: number;
    tax_rate: number;
    discount_type: "percentage" | "fixed";
    discount_value: number;
    sort_order: number;
  }>;
}) {
  const totals = calculateQuoteTotals({
    items: input.items,
    discount_type: input.discount_type,
    discount_value: input.discount_value,
    shipping_total: input.shipping_total,
  });

  return {
    quote: {
      lead_id: input.lead_id,
      quote_number: input.quote_number,
      issue_date: input.issue_date,
      expiry_date: input.expiry_date,
      status: input.status,
      currency: input.currency,
      customer_name: input.customer_name,
      customer_company: input.customer_company || null,
      customer_email: input.customer_email || null,
      customer_phone: input.customer_phone || null,
      notes: input.notes || null,
      payment_terms: input.payment_terms || null,
      delivery_terms: input.delivery_terms || null,
      subtotal: totals.subtotal,
      discount_total: totals.discountTotal,
      tax_total: totals.taxTotal,
      shipping_total: totals.shippingTotal,
      total: totals.grandTotal,
      grand_total: totals.grandTotal,
      discount_type: input.discount_type,
      discount_value: input.discount_value,
    },
    items: input.items.map((item) => {
      const lineTotal = calculateLineTotal(item);
      return {
        product_id: item.product_id || null,
        name: item.name,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price,
        discount_type: item.discount_type,
        discount_value: item.discount_value,
        discount: item.discount_value,
        tax_rate: item.tax_rate,
        line_total: lineTotal,
        sort_order: item.sort_order,
      };
    }),
  };
}

async function ensureLeadInOrganization(client: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>, organizationId: string, leadId: string | null) {
  if (!leadId) {
    return null;
  }

  const { data, error } = await client
    .from("leads")
    .select("id, organization_id, full_name, company, email, phone, city, source, status, estimated_value, currency, notes, assigned_to, next_follow_up_at, created_by, created_at, updated_at")
    .eq("id", leadId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Lead not found.");
  }

  return data as Lead;
}

async function ensureProductInOrganization(client: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>, organizationId: string, productId: string | null) {
  if (!productId) {
    return null;
  }

  const { data, error } = await client
    .from("products")
    .select("id, organization_id, sku, name, category, description, base_price, unit_price, currency, tax_rate, unit, active, specifications, created_by, created_at, updated_at")
    .eq("id", productId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Product not found.");
  }

  return data as Product;
}

export async function createQuoteRecord(input: {
  lead_id: string | null;
  quote_number: string;
  issue_date: string;
  expiry_date: string;
  status: Quote["status"];
  currency: string;
  customer_name: string;
  customer_company: string;
  customer_email: string;
  customer_phone: string;
  notes: string;
  payment_terms: string;
  delivery_terms: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  shipping_total: number;
  items: Array<{
    product_id: string;
    name: string;
    description: string;
    quantity: number;
    unit: string;
    unit_price: number;
    tax_rate: number;
    discount_type: "percentage" | "fixed";
    discount_value: number;
    sort_order: number;
  }>;
}) {
  const mutation = await getMutationContext();
  if (!mutation) {
    throw new Error("Quote creation requires a live Supabase session.");
  }

  ensureCanManage(mutation.context);

  const lead = await ensureLeadInOrganization(mutation.client, mutation.context.organization.id, input.lead_id);
  for (const item of input.items) {
    await ensureProductInOrganization(mutation.client, mutation.context.organization.id, item.product_id || null);
  }

  const payload = mapQuotePayload(input);
  const { data, error } = await mutation.client
    .from("quotes")
    .insert({
      organization_id: mutation.context.organization.id,
      created_by: mutation.context.userId,
      ...payload.quote,
    })
    .select("id, organization_id, lead_id, quote_number, issue_date, expiry_date, status, currency, customer_name, customer_company, customer_email, customer_phone, notes, payment_terms, delivery_terms, subtotal, discount_total, tax_total, shipping_total, total, grand_total, discount_type, discount_value, created_by, created_at, updated_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to create quote.");
  }

  const quoteItems = payload.items.map((item) => ({
    quote_id: data.id,
    ...item,
  }));

  const { error: itemsError } = await mutation.client.from("quote_items").insert(quoteItems);
  if (itemsError) {
    throw new Error(itemsError.message ?? "Unable to save quote items.");
  }

  const { data: quoteItemsData } = await mutation.client
    .from("quote_items")
    .select("id, quote_id, product_id, name, description, quantity, unit, unit_price, discount, discount_type, discount_value, tax_rate, line_total, sort_order, created_at, updated_at")
    .eq("quote_id", data.id)
    .order("sort_order", { ascending: true });

  return {
    quote: mapQuoteRow(
      {
        ...(data as Quote),
        items: normalizeQuoteItems((quoteItemsData ?? []) as QuoteItem[]),
      },
      lead ? [lead] : [],
      mutation.context.organization ? [] : [],
      "live",
    ),
  };
}

export async function updateQuoteRecord(
  quoteId: string,
  input: Parameters<typeof createQuoteRecord>[0],
) {
  const mutation = await getMutationContext();
  if (!mutation) {
    throw new Error("Quote updates require a live Supabase session.");
  }

  ensureCanManage(mutation.context);
  await ensureLeadInOrganization(mutation.client, mutation.context.organization.id, input.lead_id);
  for (const item of input.items) {
    await ensureProductInOrganization(mutation.client, mutation.context.organization.id, item.product_id || null);
  }

  const payload = mapQuotePayload(input);
  const { data, error } = await mutation.client
    .from("quotes")
    .update({
      ...payload.quote,
      updated_at: new Date().toISOString(),
    })
    .eq("id", quoteId)
    .eq("organization_id", mutation.context.organization.id)
    .select("id, organization_id, lead_id, quote_number, issue_date, expiry_date, status, currency, customer_name, customer_company, customer_email, customer_phone, notes, payment_terms, delivery_terms, subtotal, discount_total, tax_total, shipping_total, total, grand_total, discount_type, discount_value, created_by, created_at, updated_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to update quote.");
  }

  await mutation.client.from("quote_items").delete().eq("quote_id", quoteId);
  const { error: itemsError } = await mutation.client.from("quote_items").insert(
    payload.items.map((item) => ({
      quote_id: quoteId,
      ...item,
    })),
  );

  if (itemsError) {
    throw new Error(itemsError.message ?? "Unable to save quote items.");
  }

  const [leadsResponse, productsResponse, quoteItemsResponse] = await Promise.all([
    mutation.client
      .from("leads")
      .select("id, organization_id, full_name, company, email, phone, city, source, status, estimated_value, currency, notes, assigned_to, next_follow_up_at, created_by, created_at, updated_at")
      .eq("organization_id", mutation.context.organization.id),
    mutation.client
      .from("products")
      .select("id, organization_id, sku, name, category, description, base_price, unit_price, currency, tax_rate, unit, active, specifications, created_by, created_at, updated_at")
      .eq("organization_id", mutation.context.organization.id),
    mutation.client
      .from("quote_items")
      .select("id, quote_id, product_id, name, description, quantity, unit, unit_price, discount, discount_type, discount_value, tax_rate, line_total, sort_order, created_at, updated_at")
      .eq("quote_id", quoteId)
      .order("sort_order", { ascending: true }),
  ]);

  return {
    quote: mapQuoteRow(
      {
        ...(data as Quote),
        items: normalizeQuoteItems((quoteItemsResponse.data ?? []) as QuoteItem[]),
      },
      (leadsResponse.data ?? []) as Lead[],
      (productsResponse.data ?? []) as Product[],
      "live",
    ),
  };
}

export async function changeQuoteStatusRecord(quoteId: string, status: Quote["status"]) {
  const mutation = await getMutationContext();
  if (!mutation) {
    throw new Error("Quote status updates require a live Supabase session.");
  }

  ensureCanManage(mutation.context);
  const { data, error } = await mutation.client
    .from("quotes")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", quoteId)
    .eq("organization_id", mutation.context.organization.id)
    .select("id, organization_id, lead_id, quote_number, issue_date, expiry_date, status, currency, customer_name, customer_company, customer_email, customer_phone, notes, payment_terms, delivery_terms, subtotal, discount_total, tax_total, shipping_total, total, grand_total, discount_type, discount_value, created_by, created_at, updated_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to update quote status.");
  }

  return { quote: data as Quote };
}

export async function deleteQuoteRecord(quoteId: string) {
  const mutation = await getMutationContext();
  if (!mutation) {
    throw new Error("Quote deletion requires a live Supabase session.");
  }

  ensureCanManage(mutation.context);
  const { error } = await mutation.client
    .from("quotes")
    .delete()
    .eq("id", quoteId)
    .eq("organization_id", mutation.context.organization.id);

  if (error) {
    throw new Error(error.message ?? "Unable to delete quote.");
  }
}

export function getQuoteStatusInfo(status: Quote["status"]) {
  return {
    label: getQuoteStatusLabel(status),
    tone: getQuoteStatusTone(status),
  };
}

export function getQuoteBadge(quote: QuoteRow) {
  return getQuoteRecordBadge(quote.recordMode);
}

export function getQuoteRestrictionMessage(quote: QuoteRow, role: WorkspaceMemberOption["role"] | null | undefined) {
  return getQuoteRecordRestrictionMessage(quote.recordMode, role);
}
