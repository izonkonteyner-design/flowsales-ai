import type { CurrencyCode, LeadStatus, Organization, Product, Quote, QuoteItem, QuoteStatus } from "@/types/crm";

export type DashboardRange =
  | "current_month"
  | "previous_month"
  | "last_30_days"
  | "last_90_days"
  | "current_year"
  | "all_time"
  | "custom";

export type DashboardBucketSize = "day" | "week" | "month";

export type DashboardFilters = {
  range: DashboardRange;
  from: string;
  to: string;
  currency: CurrencyCode;
};

export type DashboardPeriod = {
  range: DashboardRange;
  start: string | null;
  end: string | null;
  comparisonStart: string | null;
  comparisonEnd: string | null;
  bucketSize: DashboardBucketSize;
  label: string;
  comparisonLabel: string | null;
};

export type DashboardRecordMode = "demo" | "live";

export type DashboardWorkspaceContext = {
  mode: DashboardRecordMode;
  organization: Pick<Organization, "id" | "name" | "slug" | "currency">;
  role: Organization["role"];
  userId: string | null;
};

export type DashboardComparisonDirection = "up" | "down" | "flat" | "no_previous";

export type DashboardComparison = {
  current: number;
  previous: number;
  difference: number;
  percentChange: number | null;
  direction: DashboardComparisonDirection;
  previousLabel: string | null;
};

export type DashboardMetricComparisons = {
  totalLeads: DashboardComparison | null;
  activeLeads: DashboardComparison | null;
  qualifiedLeads: DashboardComparison | null;
  convertedLeads: DashboardComparison | null;
  totalQuotes: DashboardComparison | null;
  acceptedRevenue: DashboardComparison | null;
  openQuoteValue: DashboardComparison | null;
  averageQuoteValue: DashboardComparison | null;
  quoteConversionRate: DashboardComparison | null;
  averageAcceptedQuoteValue: DashboardComparison | null;
  totalQuotedValue: DashboardComparison | null;
};

export type DashboardMetrics = {
  totalLeads: number;
  activeLeads: number;
  qualifiedLeads: number;
  convertedLeads: number;
  totalProducts: number;
  activeProducts: number;
  totalQuotes: number;
  draftQuotes: number;
  sentQuotes: number;
  viewedQuotes: number;
  acceptedQuotes: number;
  rejectedQuotes: number;
  expiredQuotes: number;
  cancelledQuotes: number;
  acceptedRevenue: number;
  openQuoteValue: number;
  averageQuoteValue: number;
  quoteConversionRate: number;
  averageAcceptedQuoteValue: number;
  totalQuotedValue: number;
};

export type QuotePipelineMetric = {
  status: QuoteStatus;
  label: string;
  count: number;
  value: number;
  share: number;
  tone: "neutral" | "info" | "warning" | "success" | "danger";
};

export type RevenueSeriesPoint = {
  bucket: string;
  label: string;
  acceptedRevenue: number;
  totalQuotedValue: number;
  quoteCount: number;
  acceptedCount: number;
};

export type TopProductMetric = {
  key: string;
  name: string;
  sku: string | null;
  quantity: number;
  quotedValue: number;
  acceptedValue: number;
  quoteCount: number;
  currency: CurrencyCode;
};

export type TopRecipientMetric = {
  key: string;
  name: string;
  company: string | null;
  acceptedQuoteCount: number;
  acceptedValue: number;
  totalQuoteValue: number;
  currency: CurrencyCode;
};

export type RecentQuoteMetric = {
  id: string;
  quoteNumber: string;
  recipient: string;
  status: QuoteStatus;
  statusLabel: string;
  grandTotal: number;
  currency: CurrencyCode;
  updatedAt: string;
  href: string;
};

export type RecentLeadMetric = {
  id: string;
  fullName: string;
  company: string | null;
  status: LeadStatus;
  statusLabel: string;
  updatedAt: string;
  href: string;
};

export type DashboardReport = {
  context: DashboardWorkspaceContext;
  filters: DashboardFilters;
  period: DashboardPeriod;
  sourceLabel: string;
  sourceTone: "neutral" | "success";
  hasMultipleCurrencies: boolean;
  hasData: boolean;
  metrics: DashboardMetrics;
  comparisons: DashboardMetricComparisons;
  pipeline: QuotePipelineMetric[];
  revenueSeries: RevenueSeriesPoint[];
  topProducts: TopProductMetric[];
  topRecipients: TopRecipientMetric[];
  recentQuotes: RecentQuoteMetric[];
  recentLeads: RecentLeadMetric[];
};

export type QuoteReportingRow = Quote & {
  lead_name: string | null;
  lead_company: string | null;
  customer_name: string | null;
  customer_company: string | null;
  items: QuoteItem[];
};

export type DashboardSourceData = {
  leads: Array<Pick<
    DashboardLeadRecord,
    | "id"
    | "organization_id"
    | "full_name"
    | "company"
    | "status"
    | "estimated_value"
    | "currency"
    | "created_at"
    | "updated_at"
  >>;
  products: Array<Pick<Product, "id" | "organization_id" | "name" | "sku" | "active" | "currency">>;
  quotes: QuoteReportingRow[];
};

export type DashboardLeadRecord = {
  id: string;
  organization_id: string;
  full_name: string;
  company: string | null;
  status: LeadStatus;
  estimated_value: number;
  currency: CurrencyCode;
  created_at: string;
  updated_at: string;
};

