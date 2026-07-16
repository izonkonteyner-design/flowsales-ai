import { CURRENCY_CODES, QUOTE_STATUSES } from "@/lib/constants";
import { getLeadStatusLabel } from "@/server/services/lead-domain";
import { getQuoteStatusLabel, getQuoteStatusTone } from "@/server/services/quote-domain";
import type {
  DashboardBucketSize,
  DashboardComparison,
  DashboardComparisonDirection,
  DashboardFilters,
  DashboardMetricComparisons,
  DashboardMetrics,
  DashboardPeriod,
  DashboardReport,
  DashboardSourceData,
  DashboardWorkspaceContext,
  RevenueSeriesPoint,
  QuotePipelineMetric,
  TopProductMetric,
  TopRecipientMetric,
} from "@/types/reporting";
import type { CurrencyCode, QuoteStatus } from "@/types/crm";

const currencySet = new Set(CURRENCY_CODES.map((currency) => currency.value));
const rangeSet = new Set<DashboardFilters["range"]>([
  "current_month",
  "previous_month",
  "last_30_days",
  "last_90_days",
  "current_year",
  "all_time",
  "custom",
]);

type DashboardBuildOptions = {
  now?: Date;
};

type DashboardQuote = DashboardSourceData["quotes"][number];
type DashboardLead = DashboardSourceData["leads"][number];

function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === "string" && currencySet.has(value as CurrencyCode);
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function endOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

function toUtcDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function addMonths(date: Date, amount: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, date.getUTCDate()));
}

function startOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function endOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

function startOfYear(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
}

function todayUtc(now = new Date()) {
  return endOfUtcDay(now);
}

function durationInDays(start: Date, end: Date) {
  const diff = endOfUtcDay(end).getTime() - startOfUtcDay(start).getTime();
  return Math.max(1, Math.floor(diff / (1000 * 60 * 60 * 24)) + 1);
}

function isValidDateInput(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime());
}

function normalizeDateInput(value: string) {
  return isValidDateInput(value) ? value : "";
}

function resolveCustomRange(fromRaw: string, toRaw: string, now: Date): { from: string; to: string } {
  const from = normalizeDateInput(fromRaw);
  const to = normalizeDateInput(toRaw);

  if (!from && !to) {
    const monthStart = toIsoDate(startOfMonth(now));
    const monthEnd = toIsoDate(endOfUtcDay(now));
    return { from: monthStart, to: monthEnd };
  }

  if (from && to) {
    if (toUtcDate(from).getTime() <= toUtcDate(to).getTime()) {
      return { from, to };
    }

    return { from: to, to: from };
  }

  const single = from || to;
  return { from: single, to: single };
}

function buildRangeBounds(range: DashboardFilters["range"], from: string, to: string, now: Date) {
  const today = startOfUtcDay(now);

  switch (range) {
    case "current_month": {
      const start = startOfMonth(today);
      return { start, end: todayUtc(now), comparisonStart: startOfMonth(addMonths(start, -1)), comparisonEnd: endOfMonth(addMonths(start, -1)) };
    }
    case "previous_month": {
      const currentMonthStart = startOfMonth(today);
      const start = startOfMonth(addMonths(currentMonthStart, -1));
      const end = endOfMonth(start);
      const comparisonStart = startOfMonth(addMonths(start, -1));
      const comparisonEnd = endOfMonth(comparisonStart);
      return { start, end, comparisonStart, comparisonEnd };
    }
    case "last_30_days": {
      const start = startOfUtcDay(addDays(today, -29));
      const end = todayUtc(now);
      return { start, end, comparisonStart: startOfUtcDay(addDays(start, -30)), comparisonEnd: endOfUtcDay(addDays(start, -1)) };
    }
    case "last_90_days": {
      const start = startOfUtcDay(addDays(today, -89));
      const end = todayUtc(now);
      return { start, end, comparisonStart: startOfUtcDay(addDays(start, -90)), comparisonEnd: endOfUtcDay(addDays(start, -1)) };
    }
    case "current_year": {
      const start = startOfYear(today);
      const end = todayUtc(now);
      const comparisonStart = startOfYear(addMonths(start, -12));
      const comparisonEnd = endOfUtcDay(addDays(addMonths(today, -12), 0));
      return { start, end, comparisonStart, comparisonEnd };
    }
    case "custom": {
      const start = from ? startOfUtcDay(toUtcDate(from)) : startOfUtcDay(today);
      const end = to ? endOfUtcDay(toUtcDate(to)) : endOfUtcDay(today);
      const comparisonEnd = endOfUtcDay(addDays(start, -1));
      const comparisonStart = startOfUtcDay(addDays(comparisonEnd, -(durationInDays(start, end) - 1)));
      return { start, end, comparisonStart, comparisonEnd };
    }
    case "all_time":
    default:
      return { start: null, end: null, comparisonStart: null, comparisonEnd: null };
  }
}

function formatRangeLabel(start: Date, end: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

function formatPeriodLabel(range: DashboardFilters["range"], start: Date | null, end: Date | null) {
  switch (range) {
    case "current_month":
      return "Current month";
    case "previous_month":
      return "Previous month";
    case "last_30_days":
      return "Last 30 days";
    case "last_90_days":
      return "Last 90 days";
    case "current_year":
      return "Current year";
    case "all_time":
      return "All time";
    case "custom":
      return start && end ? formatRangeLabel(start, end) : "Custom range";
    default:
      return "Current month";
  }
}

function formatComparisonLabel(range: DashboardFilters["range"]) {
  switch (range) {
    case "current_month":
      return "Previous month";
    case "previous_month":
      return "Two months earlier";
    case "last_30_days":
      return "Previous 30 days";
    case "last_90_days":
      return "Previous 90 days";
    case "current_year":
      return "Previous year to date";
    case "custom":
      return "Previous equivalent period";
    case "all_time":
      return null;
    default:
      return "Previous period";
  }
}

function resolveGranularity(range: DashboardFilters["range"], start: Date | null, end: Date | null): DashboardBucketSize {
  if (range === "all_time" || !start || !end) {
    return "month";
  }

  const days = durationInDays(start, end);
  if (days <= 35) {
    return "day";
  }

  if (days <= 120) {
    return "week";
  }

  return "month";
}

function formatBucketLabel(start: Date, end: Date, bucketSize: DashboardBucketSize) {
  const shortMonthDay = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

  const monthYear = new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

  if (bucketSize === "day") {
    return shortMonthDay.format(start);
  }

  if (bucketSize === "week") {
    return `${shortMonthDay.format(start)} - ${shortMonthDay.format(end)}`;
  }

  return monthYear.format(start);
}

function buildBuckets(start: Date | null, end: Date | null, bucketSize: DashboardBucketSize) {
  if (!start || !end) {
    return [] as Array<{ key: string; start: Date; end: Date; label: string }>;
  }

  const buckets: Array<{ key: string; start: Date; end: Date; label: string }> = [];
  let cursor = startOfUtcDay(start);
  const finalEnd = endOfUtcDay(end);

  while (cursor.getTime() <= finalEnd.getTime()) {
    let bucketStart = cursor;
    let bucketEnd = cursor;

    if (bucketSize === "week") {
      bucketEnd = endOfUtcDay(addDays(bucketStart, 6));
    } else if (bucketSize === "month") {
      bucketStart = startOfMonth(cursor);
      bucketEnd = endOfMonth(cursor);
    }

    if (bucketEnd.getTime() > finalEnd.getTime()) {
      bucketEnd = finalEnd;
    }

    buckets.push({
      key: toIsoDate(bucketStart),
      start: bucketStart,
      end: bucketEnd,
      label: formatBucketLabel(bucketStart, bucketEnd, bucketSize),
    });

    if (bucketSize === "day") {
      cursor = addDays(cursor, 1);
    } else if (bucketSize === "week") {
      cursor = addDays(bucketEnd, 1);
    } else {
      cursor = addMonths(startOfMonth(cursor), 1);
    }
  }

  return buckets;
}

function withinRange(dateValue: string, start: Date | null, end: Date | null) {
  const time = new Date(dateValue).getTime();
  if (Number.isNaN(time)) {
    return false;
  }

  if (start && time < start.getTime()) {
    return false;
  }

  if (end && time > end.getTime()) {
    return false;
  }

  return true;
}

function safeNumber(value: unknown, fallback = 0) {
  const next = typeof value === "number" ? value : Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function safeDateValue(value: string | null | undefined) {
  return value && !Number.isNaN(new Date(value).getTime()) ? new Date(value) : null;
}

function divide(current: number, previous: number) {
  if (previous === 0) {
    return null;
  }

  return ((current - previous) / previous) * 100;
}

function buildComparison(current: number, previous: number, previousLabel: string | null): DashboardComparison {
  const difference = current - previous;
  const percentChange = divide(current, previous);
  let direction: DashboardComparisonDirection = "flat";

  if (previous === 0 && current > 0) {
    direction = "no_previous";
  } else if (difference > 0) {
    direction = "up";
  } else if (difference < 0) {
    direction = "down";
  }

  return {
    current,
    previous,
    difference,
    percentChange,
    direction,
    previousLabel,
  };
}

function filterByPeriod<T extends { created_at: string }>(rows: T[], start: Date | null, end: Date | null) {
  return rows.filter((row) => withinRange(row.created_at, start, end));
}

function filterQuotesInPeriodAllCurrencies(quotes: DashboardQuote[], start: Date | null, end: Date | null) {
  return quotes.filter((quote) => withinRange(quote.issue_date, start, end));
}

function countStatus<T extends { status: QuoteStatus }>(rows: T[], status: QuoteStatus) {
  return rows.filter((row) => row.status === status).length;
}

function getRecipientLabel(quote: DashboardQuote) {
  if (quote.customer_name) {
    return quote.customer_company ? `${quote.customer_name} · ${quote.customer_company}` : quote.customer_name;
  }

  if (quote.lead_name) {
    return quote.lead_company ? `${quote.lead_name} · ${quote.lead_company}` : quote.lead_name;
  }

  return "Unassigned";
}

function getRecipientKey(quote: DashboardQuote) {
  if (quote.customer_id) {
    return `customer:${quote.customer_id}`;
  }

  if (quote.lead_id) {
    return `lead:${quote.lead_id}`;
  }

  return `quote:${quote.id}`;
}

function getProductKey(item: DashboardQuote["items"][number]) {
  if (item.product_id) {
    return `product:${item.product_id}`;
  }

  return `manual:${[item.name, item.sku, item.unit, item.currency].map((value) => value ?? "").join("|")}`;
}

function getProductName(item: DashboardQuote["items"][number]) {
  return item.name?.trim() || item.description?.trim() || "Manual line";
}

function getProductSku(item: DashboardQuote["items"][number]) {
  return item.sku?.trim() || null;
}

function buildPipeline(currentCurrencyQuotes: DashboardQuote[]): QuotePipelineMetric[] {
  const totalQuotes = currentCurrencyQuotes.length;
  const valueByStatus = new Map<QuoteStatus, number>();
  const countByStatus = new Map<QuoteStatus, number>();

  for (const quote of currentCurrencyQuotes) {
    countByStatus.set(quote.status, (countByStatus.get(quote.status) ?? 0) + 1);
    valueByStatus.set(quote.status, (valueByStatus.get(quote.status) ?? 0) + safeNumber(quote.grand_total ?? quote.total ?? 0));
  }

  return QUOTE_STATUSES.map((status) => ({
    status: status.value,
    label: status.label,
    count: countByStatus.get(status.value) ?? 0,
    value: valueByStatus.get(status.value) ?? 0,
    share: totalQuotes ? Math.round(((countByStatus.get(status.value) ?? 0) / totalQuotes) * 1000) / 10 : 0,
    tone: getQuoteStatusTone(status.value),
  }));
}

function buildTopProducts(quotes: DashboardQuote[], currency: CurrencyCode): TopProductMetric[] {
  const map = new Map<
    string,
    TopProductMetric & { quoteIds: Set<string> }
  >();

  for (const quote of quotes) {
    for (const item of quote.items) {
      const key = getProductKey(item);
      const total = safeNumber(item.line_total ?? 0);
      const quantity = safeNumber(item.quantity ?? 0);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          key,
          name: getProductName(item),
          sku: getProductSku(item),
          quantity,
          quotedValue: total,
          acceptedValue: quote.status === "accepted" ? total : 0,
          quoteCount: 1,
          currency,
          quoteIds: new Set([quote.id]),
        });
        continue;
      }

      existing.quantity += quantity;
      existing.quotedValue += total;
      if (quote.status === "accepted") {
        existing.acceptedValue += total;
      }
      if (!existing.quoteIds.has(quote.id)) {
        existing.quoteIds.add(quote.id);
        existing.quoteCount += 1;
      }
    }
  }

  return [...map.values()]
    .map((entry) => {
      void entry.quoteIds;
      const { quoteIds, ...rest } = entry;
      void quoteIds;
      return rest;
    })
    .sort((left, right) => right.quotedValue - left.quotedValue)
    .slice(0, 10);
}

function buildTopRecipients(quotes: DashboardQuote[], currency: CurrencyCode): TopRecipientMetric[] {
  const map = new Map<
    string,
    TopRecipientMetric & { quoteIds: Set<string> }
  >();

  for (const quote of quotes) {
    const key = getRecipientKey(quote);
    const recipientName = quote.customer_name ?? quote.lead_name ?? "Unassigned";
    const company = quote.customer_company ?? quote.lead_company ?? null;
    const totalValue = safeNumber(quote.grand_total ?? quote.total ?? 0);
    const acceptedValue = quote.status === "accepted" ? totalValue : 0;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        key,
        name: recipientName,
        company,
        acceptedQuoteCount: quote.status === "accepted" ? 1 : 0,
        acceptedValue,
        totalQuoteValue: totalValue,
        currency,
        quoteIds: new Set([quote.id]),
      });
      continue;
    }

    existing.totalQuoteValue += totalValue;
    if (quote.status === "accepted") {
      existing.acceptedValue += totalValue;
      existing.acceptedQuoteCount += 1;
    }
    if (!existing.quoteIds.has(quote.id)) {
      existing.quoteIds.add(quote.id);
    }
  }

  return [...map.values()]
    .map((entry) => {
      void entry.quoteIds;
      const { quoteIds, ...rest } = entry;
      void quoteIds;
      return rest;
    })
    .sort((left, right) => right.acceptedValue - left.acceptedValue)
    .slice(0, 10);
}

function buildRecentQuotes(quotes: DashboardQuote[]) {
  return [...quotes]
    .sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime())
    .slice(0, 5)
    .map((quote) => ({
      id: quote.id,
      quoteNumber: quote.quote_number,
      recipient: getRecipientLabel(quote),
      status: quote.status,
      statusLabel: getQuoteStatusLabel(quote.status),
      grandTotal: safeNumber(quote.grand_total ?? quote.total ?? 0),
      currency: quote.currency as CurrencyCode,
      updatedAt: quote.updated_at,
      href: `/quotes/${quote.id}`,
    }));
}

function buildRecentLeads(leads: DashboardLead[]) {
  return [...leads]
    .sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime())
    .slice(0, 5)
    .map((lead) => ({
      id: lead.id,
      fullName: lead.full_name,
      company: lead.company ?? null,
      status: lead.status,
      statusLabel: getLeadStatusLabel(lead.status),
      updatedAt: lead.updated_at,
      href: `/leads/${lead.id}`,
    }));
}

function buildComparisons(
  currentLeads: DashboardLead[],
  previousLeads: DashboardLead[],
  currentQuotes: DashboardQuote[],
  previousQuotes: DashboardQuote[],
  period: DashboardPeriod,
): DashboardMetricComparisons {
  const currentMetrics = buildCurrentQuoteMetrics(currentQuotes);
  const previousMetrics = buildCurrentQuoteMetrics(previousQuotes);
  const currentLeadSummary = buildLeadSummary(currentLeads);
  const previousLeadSummary = buildLeadSummary(previousLeads);

  return {
    totalLeads: period.comparisonLabel ? buildComparison(currentLeadSummary.totalLeads, previousLeadSummary.totalLeads, period.comparisonLabel) : null,
    activeLeads: period.comparisonLabel ? buildComparison(currentLeadSummary.activeLeads, previousLeadSummary.activeLeads, period.comparisonLabel) : null,
    qualifiedLeads: period.comparisonLabel ? buildComparison(currentLeadSummary.qualifiedLeads, previousLeadSummary.qualifiedLeads, period.comparisonLabel) : null,
    convertedLeads: period.comparisonLabel ? buildComparison(currentLeadSummary.convertedLeads, previousLeadSummary.convertedLeads, period.comparisonLabel) : null,
    totalQuotes: period.comparisonLabel ? buildComparison(currentMetrics.totalQuotes, previousMetrics.totalQuotes, period.comparisonLabel) : null,
    acceptedRevenue: period.comparisonLabel ? buildComparison(currentMetrics.acceptedRevenue, previousMetrics.acceptedRevenue, period.comparisonLabel) : null,
    openQuoteValue: period.comparisonLabel ? buildComparison(currentMetrics.openQuoteValue, previousMetrics.openQuoteValue, period.comparisonLabel) : null,
    averageQuoteValue: period.comparisonLabel ? buildComparison(currentMetrics.averageQuoteValue, previousMetrics.averageQuoteValue, period.comparisonLabel) : null,
    quoteConversionRate: period.comparisonLabel ? buildComparison(currentMetrics.quoteConversionRate, previousMetrics.quoteConversionRate, period.comparisonLabel) : null,
    averageAcceptedQuoteValue: period.comparisonLabel
      ? buildComparison(currentMetrics.averageAcceptedQuoteValue, previousMetrics.averageAcceptedQuoteValue, period.comparisonLabel)
      : null,
    totalQuotedValue: period.comparisonLabel ? buildComparison(currentMetrics.totalQuotedValue, previousMetrics.totalQuotedValue, period.comparisonLabel) : null,
  };
}

function buildLeadSummary(leads: DashboardLead[]) {
  return {
    totalLeads: leads.length,
    activeLeads: leads.filter((lead) => lead.status !== "won" && lead.status !== "lost").length,
    qualifiedLeads: leads.filter((lead) => lead.status === "qualified").length,
    convertedLeads: leads.filter((lead) => lead.status === "won").length,
  };
}

function buildCurrentQuoteMetrics(quotes: DashboardQuote[]) {
  const totalQuotes = quotes.length;
  const draftQuotes = countStatus(quotes, "draft");
  const sentQuotes = countStatus(quotes, "sent");
  const viewedQuotes = countStatus(quotes, "viewed");
  const acceptedQuotes = countStatus(quotes, "accepted");
  const rejectedQuotes = countStatus(quotes, "rejected");
  const expiredQuotes = countStatus(quotes, "expired");
  const cancelledQuotes = countStatus(quotes, "cancelled");
  const acceptedRevenue = quotes
    .filter((quote) => quote.status === "accepted")
    .reduce((total, quote) => total + safeNumber(quote.grand_total ?? quote.total ?? 0), 0);
  const openQuoteValue = quotes
    .filter((quote) => quote.status === "draft" || quote.status === "sent" || quote.status === "viewed")
    .reduce((total, quote) => total + safeNumber(quote.grand_total ?? quote.total ?? 0), 0);
  const totalQuotedValue = quotes
    .filter((quote) => quote.status !== "cancelled")
    .reduce((total, quote) => total + safeNumber(quote.grand_total ?? quote.total ?? 0), 0);
  const averageQuoteValue = totalQuotes ? totalQuotedValue / totalQuotes : 0;
  const averageAcceptedQuoteValue = acceptedQuotes ? acceptedRevenue / acceptedQuotes : 0;
  const quoteConversionRate = acceptedQuotes + rejectedQuotes ? (acceptedQuotes / (acceptedQuotes + rejectedQuotes)) * 100 : 0;

  return {
    totalQuotes,
    draftQuotes,
    sentQuotes,
    viewedQuotes,
    acceptedQuotes,
    rejectedQuotes,
    expiredQuotes,
    cancelledQuotes,
    acceptedRevenue,
    openQuoteValue,
    averageQuoteValue,
    quoteConversionRate,
    averageAcceptedQuoteValue,
    totalQuotedValue,
  };
}

export function normalizeDashboardSearchParams(
  input: Partial<Record<string, string | string[] | undefined>>,
  fallbackCurrency: CurrencyCode = "TRY",
  now = new Date(),
): DashboardFilters {
  const rawRange = typeof input.range === "string" && rangeSet.has(input.range as DashboardFilters["range"]) ? (input.range as DashboardFilters["range"]) : "current_month";
  const rawCurrency = normalizeDashboardCurrency(input.currency, fallbackCurrency);

  if (rawRange === "custom") {
    const { from, to } = resolveCustomRange(typeof input.from === "string" ? input.from : "", typeof input.to === "string" ? input.to : "", now);
    return {
      range: rawRange,
      from,
      to,
      currency: rawCurrency,
    };
  }

  return {
    range: rawRange,
    from: "",
    to: "",
    currency: rawCurrency,
  };
}

export function normalizeDashboardCurrency(value: unknown, fallback: CurrencyCode = "TRY"): CurrencyCode {
  return isCurrencyCode(value) ? value : fallback;
}

export function buildDashboardPeriod(filters: DashboardFilters, now = new Date()): DashboardPeriod {
  const bounds = buildRangeBounds(filters.range, filters.from, filters.to, now);
  const start = bounds.start ? toIsoDate(bounds.start) : null;
  const end = bounds.end ? toIsoDate(bounds.end) : null;
  return {
    range: filters.range,
    start,
    end,
    comparisonStart: bounds.comparisonStart ? toIsoDate(bounds.comparisonStart) : null,
    comparisonEnd: bounds.comparisonEnd ? toIsoDate(bounds.comparisonEnd) : null,
    bucketSize: resolveGranularity(filters.range, bounds.start, bounds.end),
    label: formatPeriodLabel(filters.range, bounds.start, bounds.end),
    comparisonLabel: formatComparisonLabel(filters.range),
  };
}

export function formatDashboardComparison(comparison: DashboardComparison | null, decimals = 1) {
  if (!comparison) {
    return null;
  }

  if (comparison.direction === "no_previous") {
    return `New vs ${comparison.previousLabel ?? "previous period"}`;
  }

  if (comparison.previous === 0 && comparison.current === 0) {
    return `No change vs ${comparison.previousLabel ?? "previous period"}`;
  }

  const value = comparison.percentChange ?? 0;
  const sign = value > 0 ? "+" : "";

  if (comparison.direction === "flat") {
    return `No change vs ${comparison.previousLabel ?? "previous period"}`;
  }

  return `${sign}${value.toFixed(decimals)}% vs ${comparison.previousLabel ?? "previous period"}`;
}

function resolveSeriesRange(quotes: DashboardQuote[], period: DashboardPeriod) {
  if (period.start && period.end) {
    return {
      start: new Date(`${period.start}T00:00:00.000Z`),
      end: new Date(`${period.end}T00:00:00.000Z`),
    };
  }

  const dates = quotes
    .map((quote) => safeDateValue(quote.issue_date))
    .filter((date): date is Date => Boolean(date));

  if (!dates.length) {
    return null;
  }

  return {
    start: startOfUtcDay(new Date(Math.min(...dates.map((date) => date.getTime())))),
    end: endOfUtcDay(new Date(Math.max(...dates.map((date) => date.getTime())))),
  };
}

function buildRevenueBuckets(quotes: DashboardQuote[], period: DashboardPeriod) {
  const range = resolveSeriesRange(quotes, period);
  if (!range) {
    return [] as RevenueSeriesPoint[];
  }

  const bucketSize = period.bucketSize;
  const buckets = buildBuckets(range.start, range.end, bucketSize);
  if (!buckets.length) {
    return [];
  }

  const points = buckets.map((bucket) => ({
    bucket: bucket.key,
    label: bucket.label,
    acceptedRevenue: 0,
    totalQuotedValue: 0,
    quoteCount: 0,
    acceptedCount: 0,
  }));

  for (const quote of quotes) {
    const quoteDate = safeDateValue(quote.issue_date);
    if (!quoteDate) {
      continue;
    }

    const bucketIndex = buckets.findIndex((bucket) => quoteDate.getTime() >= bucket.start.getTime() && quoteDate.getTime() <= bucket.end.getTime());
    if (bucketIndex < 0) {
      continue;
    }

    const point = points[bucketIndex];
    point.quoteCount += 1;
    point.totalQuotedValue += safeNumber(quote.grand_total ?? quote.total ?? 0);

    if (quote.status === "accepted") {
      point.acceptedCount += 1;
      point.acceptedRevenue += safeNumber(quote.grand_total ?? quote.total ?? 0);
    }
  }

  return points;
}

function buildDashboardReportFromData(
  source: DashboardSourceData,
  context: DashboardWorkspaceContext,
  filters: DashboardFilters,
  period: DashboardPeriod,
): DashboardReport {
  const currentLeads = period.start && period.end ? filterByPeriod(source.leads, new Date(`${period.start}T00:00:00.000Z`), new Date(`${period.end}T23:59:59.999Z`)) : [...source.leads];
  const previousLeads =
    period.comparisonStart && period.comparisonEnd
      ? filterByPeriod(source.leads, new Date(`${period.comparisonStart}T00:00:00.000Z`), new Date(`${period.comparisonEnd}T23:59:59.999Z`))
      : [];

  const quotesInPeriodAllCurrencies = period.start && period.end
    ? filterQuotesInPeriodAllCurrencies(source.quotes, new Date(`${period.start}T00:00:00.000Z`), new Date(`${period.end}T23:59:59.999Z`))
    : [...source.quotes];
  const previousQuotesAllCurrencies =
    period.comparisonStart && period.comparisonEnd
      ? filterQuotesInPeriodAllCurrencies(source.quotes, new Date(`${period.comparisonStart}T00:00:00.000Z`), new Date(`${period.comparisonEnd}T23:59:59.999Z`))
      : [];

  const currentQuotes = quotesInPeriodAllCurrencies.filter((quote) => quote.currency === filters.currency);
  const previousQuotes = previousQuotesAllCurrencies.filter((quote) => quote.currency === filters.currency);

  const currentLeadSummary = buildLeadSummary(currentLeads);
  const currentQuoteSummary = buildCurrentQuoteMetrics(currentQuotes);
  const productSummary = {
    totalProducts: source.products.length,
    activeProducts: source.products.filter((product) => product.active).length,
  };

  const metrics: DashboardMetrics = {
    totalLeads: currentLeadSummary.totalLeads,
    activeLeads: currentLeadSummary.activeLeads,
    qualifiedLeads: currentLeadSummary.qualifiedLeads,
    convertedLeads: currentLeadSummary.convertedLeads,
    totalProducts: productSummary.totalProducts,
    activeProducts: productSummary.activeProducts,
    totalQuotes: currentQuoteSummary.totalQuotes,
    draftQuotes: currentQuoteSummary.draftQuotes,
    sentQuotes: currentQuoteSummary.sentQuotes,
    viewedQuotes: currentQuoteSummary.viewedQuotes,
    acceptedQuotes: currentQuoteSummary.acceptedQuotes,
    rejectedQuotes: currentQuoteSummary.rejectedQuotes,
    expiredQuotes: currentQuoteSummary.expiredQuotes,
    cancelledQuotes: currentQuoteSummary.cancelledQuotes,
    acceptedRevenue: currentQuoteSummary.acceptedRevenue,
    openQuoteValue: currentQuoteSummary.openQuoteValue,
    averageQuoteValue: currentQuoteSummary.averageQuoteValue,
    quoteConversionRate: currentQuoteSummary.quoteConversionRate,
    averageAcceptedQuoteValue: currentQuoteSummary.averageAcceptedQuoteValue,
    totalQuotedValue: currentQuoteSummary.totalQuotedValue,
  };

  const comparisons = buildComparisons(currentLeads, previousLeads, currentQuotes, previousQuotes, period);
  const pipeline = buildPipeline(currentQuotes);
  const revenueSeries = buildRevenueBuckets(currentQuotes, period);
  const topProducts = buildTopProducts(currentQuotes, filters.currency);
  const topRecipients = buildTopRecipients(currentQuotes, filters.currency);
  const recentQuotes = buildRecentQuotes(currentQuotes);
  const recentLeads = buildRecentLeads(currentLeads);
  const currencies = new Set(quotesInPeriodAllCurrencies.map((quote) => quote.currency));

  return {
    context,
    filters,
    period,
    sourceLabel: context.mode === "live" ? "Live Supabase data" : "Demo workspace data",
    sourceTone: context.mode === "live" ? "success" : "neutral",
    hasMultipleCurrencies: currencies.size > 1,
    hasData: currentLeads.length > 0 || currentQuotes.length > 0 || source.products.length > 0,
    metrics,
    comparisons,
    pipeline,
    revenueSeries,
    topProducts,
    topRecipients,
    recentQuotes,
    recentLeads,
  };
}

export function buildDashboardReport(
  source: DashboardSourceData,
  context: DashboardWorkspaceContext,
  filters: DashboardFilters,
  options: DashboardBuildOptions = {},
): DashboardReport {
  const period = buildDashboardPeriod(filters, options.now ?? new Date());
  return buildDashboardReportFromData(filterDashboardSourceByOrganization(source, context.organization.id), context, filters, period);
}

export function getDashboardMetricComparisons(report: DashboardReport) {
  return report.comparisons;
}

export function createEmptyDashboardReport(
  context: DashboardWorkspaceContext,
  filters: DashboardFilters,
  options: DashboardBuildOptions = {},
): DashboardReport {
  const period = buildDashboardPeriod(filters, options.now ?? new Date());
  return buildDashboardReportFromData(
    {
      leads: [],
      products: [],
      quotes: [],
    },
    context,
    filters,
    period,
  );
}

export function filterDashboardSourceByOrganization(source: DashboardSourceData, organizationId: string): DashboardSourceData {
  return {
    leads: source.leads.filter((lead) => lead.organization_id === organizationId),
    products: source.products.filter((product) => product.organization_id === organizationId),
    quotes: source.quotes.filter((quote) => quote.organization_id === organizationId),
  };
}
