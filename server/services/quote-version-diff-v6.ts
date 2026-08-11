import "server-only";

import { getQuoteVersionComparison } from "@/server/services/sales-growth-v6";

type QuoteSnapshot = {
  quote?: Record<string, unknown>;
  items?: Array<Record<string, unknown>>;
};

function snapshotValue(snapshot: unknown): QuoteSnapshot {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return {};
  const record = snapshot as Record<string, unknown>;
  return {
    quote: record.quote && typeof record.quote === "object" && !Array.isArray(record.quote) ? record.quote as Record<string, unknown> : {},
    items: Array.isArray(record.items) ? record.items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [],
  };
}

export async function getLatestQuoteVersionDiff(organizationId: string, quoteId: string) {
  const versions = await getQuoteVersionComparison(organizationId, quoteId);
  if (versions.length < 2) return { from: null, to: versions.at(-1) || null, changes: [] as Array<{ field: string; before: string; after: string }> };
  const from = versions.at(-2)!;
  const to = versions.at(-1)!;
  const a = snapshotValue(from.snapshot);
  const b = snapshotValue(to.snapshot);
  const fields = ["status", "expiry_date", "subtotal", "discount_total", "tax_total", "total", "payment_terms", "delivery_terms"];
  const changes: Array<{ field: string; before: string; after: string }> = [];
  for (const field of fields) {
    const before = String(a.quote?.[field] ?? "");
    const after = String(b.quote?.[field] ?? "");
    if (before !== after) changes.push({ field, before, after });
  }
  const beforeItems = a.items || [];
  const afterItems = b.items || [];
  if (beforeItems.length !== afterItems.length) changes.push({ field: "item_count", before: String(beforeItems.length), after: String(afterItems.length) });
  const beforeQuantity = beforeItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const afterQuantity = afterItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  if (beforeQuantity !== afterQuantity) changes.push({ field: "total_quantity", before: String(beforeQuantity), after: String(afterQuantity) });
  return { from, to, changes };
}
