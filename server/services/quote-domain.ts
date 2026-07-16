import { QUOTE_STATUSES } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils";
import type { Lead, Organization, Product, Quote, QuoteItem } from "@/types/crm";
import type { WorkspaceRole } from "@/server/services/workspace-context";

export type QuoteRecordMode = "demo" | "live";
export type QuoteSortMode = "newest" | "oldest" | "value";

export type QuoteFilterState = {
  query: string;
  status: Quote["status"] | "";
  sort: QuoteSortMode;
};

export type QuoteWorkspaceContext = {
  mode: QuoteRecordMode;
  organization: Organization;
  role: WorkspaceRole;
  userId: string | null;
};

const quoteStatusLabels = new Map(QUOTE_STATUSES.map((status) => [status.value, status.label]));

const quoteRoleLabels: Record<WorkspaceRole, string> = {
  owner: "Owner",
  admin: "Admin",
  sales: "Sales",
  viewer: "Viewer",
};

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
    return `The ${role ? quoteRoleLabels[role] : "current"} role can only view quotes.`;
  }

  return "";
}

export function normalizeQuoteSearchParams(
  input: Partial<Record<string, string | string[] | undefined>>,
): QuoteFilterState {
  const query = typeof input.query === "string" ? input.query.trim() : "";
  const status = typeof input.status === "string" && quoteStatusLabels.has(input.status as Quote["status"])
    ? (input.status as Quote["status"])
    : "";
  const sort = input.sort === "oldest" || input.sort === "value" ? input.sort : "newest";

  return { query, status, sort };
}

export function getQuoteStatusLabel(status: Quote["status"]) {
  return quoteStatusLabels.get(status) ?? status.replace("_", " ");
}

export function getQuoteStatusInfo(status: Quote["status"]) {
  return {
    label: getQuoteStatusLabel(status),
    tone: getQuoteStatusTone(status),
  };
}

export function getQuoteStatusTone(status: Quote["status"]): "neutral" | "info" | "warning" | "success" | "danger" {
  if (status === "accepted") {
    return "success";
  }

  if (status === "rejected" || status === "cancelled") {
    return "danger";
  }

  if (status === "sent" || status === "viewed" || status === "expired") {
    return "warning";
  }

  return "info";
}

export function sortQuotes<T extends Quote>(quotes: T[], sort: QuoteSortMode) {
  return [...quotes].sort((a, b) => {
    if (sort === "oldest") {
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }

    if (sort === "value") {
      return (b.grand_total ?? b.total) - (a.grand_total ?? a.total);
    }

    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export function filterQuotes<T extends Quote>(quotes: T[], filters: QuoteFilterState, leads: Lead[], products: Product[]) {
  const query = filters.query.toLowerCase();
  const leadMap = new Map(leads.map((lead) => [lead.id, lead]));
  const quoteProductNames = new Map(
    products.map((product) => [product.id, product.name]),
  );

  return quotes.filter((quote) => {
    const lead = quote.lead_id ? leadMap.get(quote.lead_id) : null;
    const matchesQuery =
      !query ||
      [
        quote.quote_number,
        quote.customer_name ?? "",
        quote.customer_company ?? "",
        lead?.full_name ?? "",
        lead?.company ?? "",
        quote.notes ?? "",
        ...(quote.items ?? []).flatMap((item) => [
          item.description,
          item.name ?? "",
          item.product_id ? quoteProductNames.get(item.product_id) ?? "" : "",
        ]),
      ]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query));

    const matchesStatus = !filters.status || quote.status === filters.status;
    return matchesQuery && matchesStatus;
  });
}

export function formatQuoteMoney(value: number, currency: string) {
  return formatCurrency(value, currency);
}

export function generateQuoteNumber(sequence: number, year = new Date().getFullYear()) {
  const suffix = String(sequence).padStart(4, "0");
  return `FSA-${year}-${suffix}`;
}

export function getQuoteLeadLabel(quote: Quote, lead: Lead | null) {
  if (quote.customer_name) {
    return quote.customer_name;
  }

  if (lead) {
    return lead.full_name;
  }

  return "Unlinked quote";
}

export function getQuoteLeadCompany(quote: Quote, lead: Lead | null) {
  if (quote.customer_company) {
    return quote.customer_company;
  }

  if (lead) {
    return lead.company || "No company";
  }

  return "No company";
}

export function normalizeQuoteItems(items: QuoteItem[]) {
  return items.map((item, index) => ({
    ...item,
    name: item.name ?? item.description,
    unit: item.unit ?? "unit",
    sort_order: item.sort_order ?? index,
    discount_type: item.discount_type ?? (item.discount > 0 ? "percentage" : "fixed"),
    discount_value: item.discount_value ?? item.discount ?? 0,
  }));
}
