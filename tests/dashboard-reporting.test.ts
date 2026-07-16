import assert from "node:assert/strict";
import test from "node:test";

import { buildDashboardReport, filterDashboardSourceByOrganization } from "@/server/services/dashboard-domain";
import type { DashboardSourceData, DashboardWorkspaceContext } from "@/types/reporting";
import type { CurrencyCode } from "@/types/crm";

const NOW = new Date("2026-07-16T12:00:00.000Z");
const ORG_ID = "org_1";
const OTHER_ORG_ID = "org_other";

const context: DashboardWorkspaceContext = {
  mode: "live",
  organization: {
    id: ORG_ID,
    name: "FlowSales",
    slug: "flowsales",
    currency: "TRY",
  },
  role: "owner",
  userId: "user_1",
};

const demoContext: DashboardWorkspaceContext = {
  mode: "demo",
  organization: {
    id: "demo_org",
    name: "Demo Workspace",
    slug: "demo",
    currency: "TRY",
  },
  role: "owner",
  userId: null,
};

function money(value: number) {
  return value;
}

function makeItem(input: {
  id: string;
  quoteId: string;
  productId: string | null;
  name: string;
  description: string;
  sku?: string | null;
  quantity: number;
  currency: CurrencyCode;
  unitPrice: number;
  lineTotal: number;
  sortOrder: number;
}) {
  return {
    id: input.id,
    quote_id: input.quoteId,
    product_id: input.productId,
    name: input.name,
    description: input.description,
    sku: input.sku ?? null,
    quantity: input.quantity,
    unit: "unit",
    currency: input.currency,
    unit_price: input.unitPrice,
    discount_type: "percentage" as const,
    discount_value: 0,
    tax_rate: 20,
    line_subtotal: input.lineTotal,
    line_discount: 0,
    taxable_subtotal: input.lineTotal,
    line_tax: 0,
    line_total: input.lineTotal,
    sort_order: input.sortOrder,
  };
}

const source: DashboardSourceData = {
  leads: [
    {
      id: "lead_1",
      organization_id: ORG_ID,
      full_name: "Alpha Builders",
      company: "Alpha Co",
      status: "qualified",
      estimated_value: money(1000),
      currency: "TRY",
      created_at: "2026-07-02T10:00:00.000Z",
      updated_at: "2026-07-12T10:00:00.000Z",
    },
    {
      id: "lead_2",
      organization_id: ORG_ID,
      full_name: "Beta Hospitality",
      company: "Beta Group",
      status: "new",
      estimated_value: money(500),
      currency: "TRY",
      created_at: "2026-07-05T10:00:00.000Z",
      updated_at: "2026-07-15T10:00:00.000Z",
    },
    {
      id: "lead_3",
      organization_id: ORG_ID,
      full_name: "Gamma Solar",
      company: null,
      status: "won",
      estimated_value: money(400),
      currency: "TRY",
      created_at: "2026-06-10T10:00:00.000Z",
      updated_at: "2026-06-20T10:00:00.000Z",
    },
    {
      id: "lead_other",
      organization_id: OTHER_ORG_ID,
      full_name: "Other Org Lead",
      company: "Other Co",
      status: "won",
      estimated_value: money(9999),
      currency: "TRY",
      created_at: "2026-07-03T10:00:00.000Z",
      updated_at: "2026-07-03T10:00:00.000Z",
    },
  ],
  products: [
    {
      id: "prod_1",
      organization_id: ORG_ID,
      name: "Container Office",
      sku: "CON-OF-001",
      active: true,
      currency: "TRY",
    },
    {
      id: "prod_2",
      organization_id: ORG_ID,
      name: "Site Cabin",
      sku: "SIT-CA-001",
      active: false,
      currency: "TRY",
    },
    {
      id: "prod_other",
      organization_id: OTHER_ORG_ID,
      name: "Other Product",
      sku: "OTH-001",
      active: true,
      currency: "TRY",
    },
  ],
  quotes: [
    {
      id: "quote_1",
      organization_id: ORG_ID,
      lead_id: "lead_1",
      customer_id: null,
      quote_number: "FSA-2026-0010",
      issue_date: "2026-07-02",
      valid_until: "2026-07-20",
      expiry_date: "2026-07-20",
      status: "accepted",
      currency: "TRY",
      notes: "",
      payment_terms: "",
      delivery_terms: "",
      subtotal: money(1000),
      discount_total: 0,
      line_discount_total: 0,
      order_discount_type: "percentage",
      order_discount_value: 0,
      order_discount_total: 0,
      taxable_subtotal: money(1000),
      shipping_total: 0,
      tax_total: 0,
      grand_total: money(1000),
      total: money(1000),
      created_by: "user_1",
      created_at: "2026-07-02T10:00:00.000Z",
      updated_at: "2026-07-16T08:00:00.000Z",
      items: [
        makeItem({
          id: "item_1",
          quoteId: "quote_1",
          productId: "prod_1",
          name: "Container Office",
          description: "Container Office snapshot",
          sku: "CON-OF-001",
          quantity: 2,
          currency: "TRY",
          unitPrice: 100,
          lineTotal: 200,
          sortOrder: 0,
        }),
        makeItem({
          id: "item_2",
          quoteId: "quote_1",
          productId: null,
          name: "Installation",
          description: "Manual installation line",
          sku: null,
          quantity: 1,
          currency: "TRY",
          unitPrice: 800,
          lineTotal: 800,
          sortOrder: 1,
        }),
      ],
      lead_name: "Alpha Builders",
      lead_company: "Alpha Co",
      customer_name: null,
      customer_company: null,
    },
    {
      id: "quote_2",
      organization_id: ORG_ID,
      lead_id: "lead_2",
      customer_id: null,
      quote_number: "FSA-2026-0011",
      issue_date: "2026-07-05",
      valid_until: "2026-07-20",
      expiry_date: "2026-07-20",
      status: "sent",
      currency: "TRY",
      notes: "",
      payment_terms: "",
      delivery_terms: "",
      subtotal: money(500),
      discount_total: 0,
      line_discount_total: 0,
      order_discount_type: "percentage",
      order_discount_value: 0,
      order_discount_total: 0,
      taxable_subtotal: money(500),
      shipping_total: 0,
      tax_total: 0,
      grand_total: money(500),
      total: money(500),
      created_by: "user_1",
      created_at: "2026-07-05T10:00:00.000Z",
      updated_at: "2026-07-15T09:00:00.000Z",
      items: [
        makeItem({
          id: "item_3",
          quoteId: "quote_2",
          productId: "prod_1",
          name: "Container Office",
          description: "Container Office snapshot",
          sku: "CON-OF-001",
          quantity: 1,
          currency: "TRY",
          unitPrice: 500,
          lineTotal: 500,
          sortOrder: 0,
        }),
      ],
      lead_name: "Beta Hospitality",
      lead_company: "Beta Group",
      customer_name: null,
      customer_company: null,
    },
    {
      id: "quote_3",
      organization_id: ORG_ID,
      lead_id: "lead_2",
      customer_id: null,
      quote_number: "FSA-2026-0012",
      issue_date: "2026-07-08",
      valid_until: "2026-07-20",
      expiry_date: "2026-07-20",
      status: "viewed",
      currency: "USD",
      notes: "",
      payment_terms: "",
      delivery_terms: "",
      subtotal: money(700),
      discount_total: 0,
      line_discount_total: 0,
      order_discount_type: "percentage",
      order_discount_value: 0,
      order_discount_total: 0,
      taxable_subtotal: money(700),
      shipping_total: 0,
      tax_total: 0,
      grand_total: money(700),
      total: money(700),
      created_by: "user_1",
      created_at: "2026-07-08T10:00:00.000Z",
      updated_at: "2026-07-10T09:00:00.000Z",
      items: [
        makeItem({
          id: "item_4",
          quoteId: "quote_3",
          productId: null,
          name: "Custom USD Item",
          description: "USD snapshot line",
          sku: null,
          quantity: 1,
          currency: "USD",
          unitPrice: 700,
          lineTotal: 700,
          sortOrder: 0,
        }),
      ],
      lead_name: "Beta Hospitality",
      lead_company: "Beta Group",
      customer_name: null,
      customer_company: null,
    },
    {
      id: "quote_4",
      organization_id: ORG_ID,
      lead_id: "lead_2",
      customer_id: null,
      quote_number: "FSA-2026-0013",
      issue_date: "2026-07-10",
      valid_until: "2026-07-20",
      expiry_date: "2026-07-20",
      status: "rejected",
      currency: "TRY",
      notes: "",
      payment_terms: "",
      delivery_terms: "",
      subtotal: money(300),
      discount_total: 0,
      line_discount_total: 0,
      order_discount_type: "percentage",
      order_discount_value: 0,
      order_discount_total: 0,
      taxable_subtotal: money(300),
      shipping_total: 0,
      tax_total: 0,
      grand_total: money(300),
      total: money(300),
      created_by: "user_1",
      created_at: "2026-07-10T10:00:00.000Z",
      updated_at: "2026-07-14T09:00:00.000Z",
      items: [
        makeItem({
          id: "item_5",
          quoteId: "quote_4",
          productId: "prod_2",
          name: "Site Cabin",
          description: "Site cabin snapshot",
          sku: "SIT-CA-001",
          quantity: 1,
          currency: "TRY",
          unitPrice: 300,
          lineTotal: 300,
          sortOrder: 0,
        }),
      ],
      lead_name: "Beta Hospitality",
      lead_company: "Beta Group",
      customer_name: null,
      customer_company: null,
    },
    {
      id: "quote_5",
      organization_id: ORG_ID,
      lead_id: "lead_2",
      customer_id: null,
      quote_number: "FSA-2026-0014",
      issue_date: "2026-07-12",
      valid_until: "2026-07-20",
      expiry_date: "2026-07-20",
      status: "cancelled",
      currency: "TRY",
      notes: "",
      payment_terms: "",
      delivery_terms: "",
      subtotal: money(100),
      discount_total: 0,
      line_discount_total: 0,
      order_discount_type: "percentage",
      order_discount_value: 0,
      order_discount_total: 0,
      taxable_subtotal: money(100),
      shipping_total: 0,
      tax_total: 0,
      grand_total: money(100),
      total: money(100),
      created_by: "user_1",
      created_at: "2026-07-12T10:00:00.000Z",
      updated_at: "2026-07-15T12:00:00.000Z",
      items: [
        makeItem({
          id: "item_6",
          quoteId: "quote_5",
          productId: "prod_2",
          name: "Site Cabin",
          description: "Site cabin snapshot",
          sku: "SIT-CA-001",
          quantity: 1,
          currency: "TRY",
          unitPrice: 100,
          lineTotal: 100,
          sortOrder: 0,
        }),
      ],
      lead_name: "Beta Hospitality",
      lead_company: "Beta Group",
      customer_name: null,
      customer_company: null,
    },
    {
      id: "quote_6",
      organization_id: ORG_ID,
      lead_id: "lead_3",
      customer_id: null,
      quote_number: "FSA-2026-0009",
      issue_date: "2026-06-10",
      valid_until: "2026-06-20",
      expiry_date: "2026-06-20",
      status: "accepted",
      currency: "TRY",
      notes: "",
      payment_terms: "",
      delivery_terms: "",
      subtotal: money(400),
      discount_total: 0,
      line_discount_total: 0,
      order_discount_type: "percentage",
      order_discount_value: 0,
      order_discount_total: 0,
      taxable_subtotal: money(400),
      shipping_total: 0,
      tax_total: 0,
      grand_total: money(400),
      total: money(400),
      created_by: "user_1",
      created_at: "2026-06-10T10:00:00.000Z",
      updated_at: "2026-06-20T10:00:00.000Z",
      items: [
        makeItem({
          id: "item_7",
          quoteId: "quote_6",
          productId: "prod_1",
          name: "Container Office",
          description: "Container Office snapshot",
          sku: "CON-OF-001",
          quantity: 1,
          currency: "TRY",
          unitPrice: 400,
          lineTotal: 400,
          sortOrder: 0,
        }),
      ],
      lead_name: "Gamma Solar",
      lead_company: null,
      customer_name: null,
      customer_company: null,
    },
    {
      id: "quote_other",
      organization_id: OTHER_ORG_ID,
      lead_id: "lead_other",
      customer_id: null,
      quote_number: "FSA-2026-9999",
      issue_date: "2026-07-03",
      valid_until: "2026-07-20",
      expiry_date: "2026-07-20",
      status: "accepted",
      currency: "TRY",
      notes: "",
      payment_terms: "",
      delivery_terms: "",
      subtotal: money(9999),
      discount_total: 0,
      line_discount_total: 0,
      order_discount_type: "percentage",
      order_discount_value: 0,
      order_discount_total: 0,
      taxable_subtotal: money(9999),
      shipping_total: 0,
      tax_total: 0,
      grand_total: money(9999),
      total: money(9999),
      created_by: "other_user",
      created_at: "2026-07-03T10:00:00.000Z",
      updated_at: "2026-07-03T10:00:00.000Z",
      items: [
        makeItem({
          id: "item_other",
          quoteId: "quote_other",
          productId: "prod_other",
          name: "Other Product",
          description: "Other org line",
          sku: "OTH-001",
          quantity: 1,
          currency: "TRY",
          unitPrice: 9999,
          lineTotal: 9999,
          sortOrder: 0,
        }),
      ],
      lead_name: "Other Org Lead",
      lead_company: "Other Co",
      customer_name: null,
      customer_company: null,
    },
  ],
};

test("dashboard report aggregates metrics, currency filtering, and rankings", () => {
  const report = buildDashboardReport(source, context, { range: "current_month", from: "", to: "", currency: "TRY" }, { now: NOW });

  assert.equal(report.sourceLabel, "Live Supabase data");
  assert.equal(report.sourceTone, "success");
  assert.equal(report.hasMultipleCurrencies, true);
  assert.equal(report.metrics.totalLeads, 2);
  assert.equal(report.metrics.activeLeads, 2);
  assert.equal(report.metrics.qualifiedLeads, 1);
  assert.equal(report.metrics.convertedLeads, 0);
  assert.equal(report.metrics.totalProducts, 2);
  assert.equal(report.metrics.activeProducts, 1);
  assert.equal(report.metrics.totalQuotes, 4);
  assert.equal(report.metrics.draftQuotes, 0);
  assert.equal(report.metrics.sentQuotes, 1);
  assert.equal(report.metrics.viewedQuotes, 0);
  assert.equal(report.metrics.acceptedQuotes, 1);
  assert.equal(report.metrics.rejectedQuotes, 1);
  assert.equal(report.metrics.expiredQuotes, 0);
  assert.equal(report.metrics.cancelledQuotes, 1);
  assert.equal(report.metrics.acceptedRevenue, 1000);
  assert.equal(report.metrics.openQuoteValue, 500);
  assert.equal(report.metrics.totalQuotedValue, 1800);
  assert.equal(report.metrics.averageQuoteValue, 450);
  assert.equal(report.metrics.averageAcceptedQuoteValue, 1000);
  assert.equal(report.metrics.quoteConversionRate, 50);

  assert.equal(report.comparisons.totalLeads?.current, 2);
  assert.equal(report.comparisons.totalLeads?.previous, 1);
  assert.equal(report.comparisons.acceptedRevenue?.current, 1000);
  assert.equal(report.comparisons.acceptedRevenue?.previous, 400);

  assert.equal(report.pipeline.length, 7);
  assert.equal(report.pipeline.find((item) => item.status === "accepted")?.count, 1);
  assert.equal(report.pipeline.find((item) => item.status === "sent")?.count, 1);
  assert.equal(report.pipeline.find((item) => item.status === "cancelled")?.count, 1);

  assert.equal(report.topProducts[0].name, "Installation");
  assert.equal(report.topProducts[0].quotedValue, 800);
  assert.equal(report.topProducts[0].acceptedValue, 800);
  assert.equal(report.topProducts[1].name, "Container Office");
  assert.equal(report.topProducts[1].quotedValue, 700);
  assert.equal(report.topProducts[1].acceptedValue, 200);

  assert.equal(report.topRecipients[0].name, "Alpha Builders");
  assert.equal(report.topRecipients[0].acceptedQuoteCount, 1);
  assert.equal(report.topRecipients[0].acceptedValue, 1000);
  assert.equal(report.topRecipients[0].totalQuoteValue, 1000);

  assert.equal(report.recentQuotes[0].quoteNumber, "FSA-2026-0010");
  assert.equal(report.recentLeads[0].fullName, "Beta Hospitality");
  assert.equal(report.recentLeads[1].fullName, "Alpha Builders");
});

test("dashboard report keeps currencies separate and avoids NaN or Infinity", () => {
  const report = buildDashboardReport(source, context, { range: "current_month", from: "", to: "", currency: "USD" }, { now: NOW });

  assert.equal(report.metrics.totalQuotes, 1);
  assert.equal(report.metrics.acceptedRevenue, 0);
  assert.equal(report.metrics.openQuoteValue, 700);
  assert.equal(report.metrics.quoteConversionRate, 0);
  assert.equal(report.topRecipients[0].currency, "USD");
  assert.equal(report.topProducts[0].currency, "USD");

  const numericValues = [
    report.metrics.totalLeads,
    report.metrics.activeLeads,
    report.metrics.totalQuotes,
    report.metrics.acceptedRevenue,
    report.metrics.openQuoteValue,
    report.metrics.totalQuotedValue,
    report.metrics.averageQuoteValue,
    report.metrics.averageAcceptedQuoteValue,
    report.metrics.quoteConversionRate,
  ];

  for (const value of numericValues) {
    assert.equal(Number.isFinite(value), true);
  }

  for (const point of report.revenueSeries) {
    assert.equal(Number.isFinite(point.acceptedRevenue), true);
    assert.equal(Number.isFinite(point.totalQuotedValue), true);
  }
});

test("dashboard source filtering enforces workspace isolation", () => {
  const filtered = filterDashboardSourceByOrganization(source, ORG_ID);
  assert.equal(filtered.leads.every((lead) => lead.organization_id === ORG_ID), true);
  assert.equal(filtered.products.every((product) => product.organization_id === ORG_ID), true);
  assert.equal(filtered.quotes.every((quote) => quote.organization_id === ORG_ID), true);
  assert.equal(filtered.quotes.some((quote) => quote.id === "quote_other"), false);
});

test("dashboard demo and live indicators differ", () => {
  const liveReport = buildDashboardReport(source, context, { range: "current_month", from: "", to: "", currency: "TRY" }, { now: NOW });
  const demoReport = buildDashboardReport(source, demoContext, { range: "current_month", from: "", to: "", currency: "TRY" }, { now: NOW });

  assert.equal(liveReport.sourceLabel, "Live Supabase data");
  assert.equal(liveReport.sourceTone, "success");
  assert.equal(demoReport.sourceLabel, "Demo workspace data");
  assert.equal(demoReport.sourceTone, "neutral");
});
