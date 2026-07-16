import { CURRENCY_CODES, QUOTE_DISCOUNT_TYPES, QUOTE_STATUSES } from "@/lib/constants";
import { calculateQuoteTotals, type QuoteMathItem, type QuoteMathOptions, type QuoteMathTotals } from "@/server/services/quote-math";
import type { WorkspaceRole } from "@/server/services/workspace-context";
import type { CurrencyCode, Organization, Quote, QuoteDiscountType, QuoteStatus } from "@/types/crm";

const currencySet = new Set(CURRENCY_CODES.map((currency) => currency.value));
const discountTypeSet = new Set(QUOTE_DISCOUNT_TYPES.map((discountType) => discountType.value));
const statusLabels = new Map(QUOTE_STATUSES.map((status) => [status.value, status.label]));
const statusIndex = new Map(QUOTE_STATUSES.map((status, index) => [status.value, index]));

export type QuoteRecordMode = "demo" | "live";

export type QuoteSortMode = "newest" | "oldest" | "total" | "expiring";

export type QuoteFilterState = {
  query: string;
  status: QuoteStatus | "";
  sort: QuoteSortMode;
  page: number;
  pageSize: number;
};

export type QuoteWorkspaceContext = {
  mode: QuoteRecordMode;
  organization: Organization;
  role: WorkspaceRole;
  userId: string | null;
};

type QuoteSearchable = Pick<Quote, "quote_number" | "notes" | "payment_terms" | "delivery_terms" | "status" | "currency" | "created_at"> & {
  lead_name?: string | null;
  lead_company?: string | null;
  customer_name?: string | null;
  customer_company?: string | null;
  grand_total?: number;
  total?: number;
  valid_until?: string | null;
  expiry_date?: string | null;
};

function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === "string" && currencySet.has(value as CurrencyCode);
}

function isDiscountType(value: unknown): value is QuoteDiscountType {
  return typeof value === "string" && discountTypeSet.has(value as QuoteDiscountType);
}

export function canManageQuotes(role: WorkspaceRole | null | undefined) {
  return role === "owner" || role === "admin" || role === "sales";
}

export function canMutateQuoteRecord(recordMode: QuoteRecordMode, role: WorkspaceRole | null | undefined) {
  return recordMode === "live" && canManageQuotes(role);
}

export function getQuoteRecordBadge(recordMode: QuoteRecordMode) {
  if (recordMode === "demo") {
    return {
      label: "Demo data",
      tone: "neutral" as const,
      title: "Connect live Supabase data or create a real quote to edit this record.",
    };
  }

  return {
    label: "Live data",
    tone: "success" as const,
    title: "This quote is stored in live Supabase data.",
  };
}

export function getQuoteRecordRestrictionMessage(recordMode: QuoteRecordMode, role: WorkspaceRole | null | undefined) {
  if (recordMode === "demo") {
    return "Connect live Supabase data or create a real quote to edit this record.";
  }

  if (!canManageQuotes(role)) {
    return "Viewer permissions can inspect quotes but cannot create, edit, delete, or change status.";
  }

  return "";
}

export function normalizeQuoteCurrency(value: unknown, fallback: CurrencyCode = "TRY"): CurrencyCode {
  return isCurrencyCode(value) ? value : fallback;
}

export function normalizeQuoteDiscountType(value: unknown, fallback: QuoteDiscountType = "percentage"): QuoteDiscountType {
  return isDiscountType(value) ? value : fallback;
}

export function normalizeQuoteMathItem(
  item: Partial<QuoteMathItem> & {
    unitPrice?: number;
    discountType?: QuoteDiscountType;
    discountValue?: number;
    taxRate?: number;
    currency?: unknown;
  },
  fallbackCurrency: CurrencyCode = "TRY",
): QuoteMathItem {
  const discountValue =
    typeof item.discount_value === "number"
      ? item.discount_value
      : typeof item.discountValue === "number"
        ? item.discountValue
        : typeof item.discount === "number"
          ? item.discount
          : 0;

  return {
    product_id:
      typeof item.product_id === "string" && item.product_id.trim().length > 0
        ? item.product_id.trim()
        : null,
    name: typeof item.name === "string" ? item.name.trim() : "",
    description: typeof item.description === "string" ? item.description.trim() : "",
    sku: typeof item.sku === "string" ? item.sku.trim() : "",
    quantity: typeof item.quantity === "number" ? item.quantity : 0,
    unit_price:
      typeof item.unit_price === "number"
        ? item.unit_price
        : typeof item.unitPrice === "number"
          ? item.unitPrice
          : 0,
    unit: typeof item.unit === "string" && item.unit.trim().length > 0 ? item.unit.trim() : "unit",
    discount_type: normalizeQuoteDiscountType(item.discount_type ?? item.discountType ?? "percentage"),
    discount_value: discountValue,
    tax_rate: typeof item.tax_rate === "number" ? item.tax_rate : typeof item.taxRate === "number" ? item.taxRate : 0,
    currency: normalizeQuoteCurrency(item.currency, fallbackCurrency),
    line_subtotal: typeof item.line_subtotal === "number" ? item.line_subtotal : undefined,
    line_discount: typeof item.line_discount === "number" ? item.line_discount : undefined,
    taxable_subtotal: typeof item.taxable_subtotal === "number" ? item.taxable_subtotal : undefined,
    line_tax: typeof item.line_tax === "number" ? item.line_tax : undefined,
  };
}

export function normalizeQuoteMathItems(items: Array<Partial<QuoteMathItem> & { unitPrice?: number }>, fallbackCurrency: CurrencyCode = "TRY") {
  return items.map((item) => normalizeQuoteMathItem(item, fallbackCurrency));
}

export function assertQuoteCurrencyConsistency(items: QuoteMathItem[], currency?: CurrencyCode) {
  const resolvedCurrency = normalizeQuoteCurrency(currency ?? items.find((item) => item.currency)?.currency, "TRY");

  for (const item of items) {
    if (item.currency && item.currency !== resolvedCurrency) {
      throw new Error("All quote items must use the same currency.");
    }
  }

  return resolvedCurrency;
}

export function calculateNormalizedQuoteTotals(
  items: Array<Partial<QuoteMathItem> & { unitPrice?: number }>,
  options: QuoteMathOptions & { currency?: unknown } = {},
): QuoteMathTotals {
  const normalizedItems = normalizeQuoteMathItems(items, normalizeQuoteCurrency(options.currency, "TRY"));
  const currency = assertQuoteCurrencyConsistency(normalizedItems, normalizeQuoteCurrency(options.currency, "TRY"));
  return calculateQuoteTotals(normalizedItems, { ...options, currency });
}

export function normalizeQuoteSearchParams(input: Partial<Record<string, string | string[] | undefined>>): QuoteFilterState {
  const query = typeof input.query === "string" ? input.query.trim() : "";
  const status =
    typeof input.status === "string" && statusLabels.has(input.status as QuoteStatus)
      ? (input.status as QuoteStatus)
      : "";
  const sortValue = typeof input.sort === "string" ? input.sort : "newest";
  const page = Number.parseInt(typeof input.page === "string" ? input.page : "1", 10);
  const pageSize = Number.parseInt(typeof input.pageSize === "string" ? input.pageSize : "8", 10);

  return {
    query,
    status,
    sort: sortValue === "oldest" || sortValue === "total" || sortValue === "expiring" ? sortValue : "newest",
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 50) : 8,
  };
}

export function getQuoteStatusLabel(status: QuoteStatus) {
  return statusLabels.get(status) ?? status.replace("_", " ");
}

export function getQuoteStatusTone(status: QuoteStatus): "neutral" | "info" | "warning" | "success" | "danger" {
  if (status === "accepted") {
    return "success";
  }

  if (status === "rejected" || status === "cancelled") {
    return "danger";
  }

  if (status === "sent" || status === "viewed" || status === "expired") {
    return "warning";
  }

  if ((statusIndex.get(status) ?? 0) <= 1) {
    return "info";
  }

  return "neutral";
}

export function isQuoteOverdue(validUntil: string | null | undefined, now = new Date()) {
  if (!validUntil) {
    return false;
  }

  return new Date(validUntil).getTime() < now.getTime();
}

export function isQuoteExpiringSoon(validUntil: string | null | undefined, now = new Date()) {
  if (!validUntil) {
    return false;
  }

  const expiresAt = new Date(validUntil).getTime();
  return expiresAt >= now.getTime() && expiresAt <= now.getTime() + 1000 * 60 * 60 * 24 * 7;
}

export function formatQuoteFollowUpState(validUntil: string | null | undefined, now = new Date()) {
  if (!validUntil) {
    return { label: "Not set", tone: "neutral" as const };
  }

  if (isQuoteOverdue(validUntil, now)) {
    return { label: "Expired", tone: "danger" as const };
  }

  if (isQuoteExpiringSoon(validUntil, now)) {
    return { label: "Expiring soon", tone: "warning" as const };
  }

  return { label: "Scheduled", tone: "info" as const };
}

export function sortQuotes<T extends QuoteSearchable>(quotes: T[], sort: QuoteSortMode) {
  return [...quotes].sort((a, b) => {
    if (sort === "oldest") {
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }

    if (sort === "total") {
      const left = Number(b.grand_total ?? b.total ?? 0);
      const right = Number(a.grand_total ?? a.total ?? 0);
      return left - right;
    }

    if (sort === "expiring") {
      const left = a.valid_until ?? a.expiry_date ?? "";
      const right = b.valid_until ?? b.expiry_date ?? "";
      return new Date(left).getTime() - new Date(right).getTime();
    }

    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export function filterQuotes<T extends QuoteSearchable>(quotes: T[], filters: Pick<QuoteFilterState, "query" | "status">) {
  const query = filters.query.toLowerCase();

  return quotes.filter((quote) => {
    const matchesQuery =
      !query ||
      [
        quote.quote_number,
        quote.notes,
        quote.payment_terms,
        quote.delivery_terms,
        quote.lead_name ?? "",
        quote.lead_company ?? "",
        quote.customer_name ?? "",
        quote.customer_company ?? "",
      ]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query));

    const matchesStatus = !filters.status || quote.status === filters.status;

    return matchesQuery && matchesStatus;
  });
}

export function paginateQuotes<T>(quotes: T[], page: number, pageSize: number) {
  const total = quotes.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const start = (currentPage - 1) * pageSize;

  return {
    currentPage,
    totalPages,
    total,
    items: quotes.slice(start, start + pageSize),
  };
}

export function generateQuoteNumber(existingNumbers: string[], now = new Date()) {
  const year = now.getFullYear();
  const prefix = `FSA-${year}-`;
  let highestSequence = 0;

  for (const quoteNumber of existingNumbers) {
    if (!quoteNumber.startsWith(prefix)) {
      continue;
    }

    const sequence = Number.parseInt(quoteNumber.slice(prefix.length), 10);
    if (Number.isFinite(sequence) && sequence > highestSequence) {
      highestSequence = sequence;
    }
  }

  return `${prefix}${String(highestSequence + 1).padStart(4, "0")}`;
}

export function getQuoteSortLabel(sort: QuoteSortMode) {
  if (sort === "oldest") {
    return "Oldest";
  }

  if (sort === "total") {
    return "Highest total";
  }

  if (sort === "expiring") {
    return "Expiring soon";
  }

  return "Newest";
}
