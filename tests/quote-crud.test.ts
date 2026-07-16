import assert from "node:assert/strict";
import test from "node:test";

import { buildQuoteLineFromProduct } from "@/components/quotes/quote-form";
import { buildDuplicateQuoteInput, buildQuotePayload } from "@/server/services/quotes";
import type { QuoteFormInput } from "@/lib/validations/quote";
import type { QuoteRow } from "@/server/services/quotes";

test("catalog product snapshot mapping copies product details into the quote line", () => {
  const line = buildQuoteLineFromProduct(
    {
      id: "prod-001",
      label: "Solar Inverter",
      subtitle: "Energy Systems",
      sku: "INV-10K",
      unit: "piece",
      currency: "EUR",
      unit_price: 1299.5,
      active: true,
    },
    "TRY",
    "line-1",
  );

  assert.equal(line.id, "line-1");
  assert.equal(line.product_id, "prod-001");
  assert.equal(line.name, "Solar Inverter");
  assert.equal(line.description, "Energy Systems");
  assert.equal(line.sku, "INV-10K");
  assert.equal(line.unit, "piece");
  assert.equal(line.currency, "EUR");
  assert.equal(line.unit_price, "1299.5");
});

test("duplicate quote helper resets status and generates a fresh number and date", () => {
  const source = {
    id: "quote-source",
    organization_id: "org-001",
    lead_id: "lead-001",
    customer_id: null,
    quote_number: "FSA-2026-0042",
    issue_date: "2026-06-01",
    valid_until: "2026-06-30",
    expiry_date: "2026-06-30",
    status: "sent",
    currency: "TRY",
    notes: "Original quote",
    payment_terms: "Net 30",
    delivery_terms: "Delivery in 14 days",
    shipping_total: 25,
    subtotal: 1000,
    discount_total: 50,
    line_discount_total: 50,
    order_discount_type: "percentage",
    order_discount_value: 5,
    order_discount_total: 0,
    taxable_subtotal: 950,
    tax_total: 171,
    grand_total: 1121,
    total: 1121,
    items: [
      {
        id: "item-001",
        quote_id: "quote-source",
        product_id: "prod-001",
        name: "Solar Inverter",
        description: "Energy Systems",
        sku: "INV-10K",
        quantity: 2,
        unit: "piece",
        currency: "TRY",
        unit_price: 500,
        discount_type: "percentage",
        discount_value: 5,
        tax_rate: 18,
        line_subtotal: 1000,
        line_discount: 50,
        taxable_subtotal: 950,
        line_tax: 171,
        line_total: 1121,
        sort_order: 0,
      },
    ],
    created_by: "user-001",
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    recordMode: "live",
    lead_name: "Acme Energy",
    lead_company: "Acme",
    customer_name: null,
    customer_company: null,
    item_count: 1,
    status_label: "Sent",
    status_tone: "warning",
    record_badge: { label: "Live data", tone: "success", title: "Live data" },
    follow_up_state: { label: "Scheduled", tone: "info" },
  } as QuoteRow;

  const duplicated = buildDuplicateQuoteInput(source, ["FSA-2026-0042"], new Date("2026-07-16T10:15:00.000Z"));

  assert.equal(duplicated.quote_number, "FSA-2026-0043");
  assert.equal(duplicated.issue_date, "2026-07-16");
  assert.equal(duplicated.status, "draft");
  assert.equal(duplicated.items.length, 1);
  assert.equal(duplicated.items[0].product_id, "prod-001");
  assert.equal(duplicated.items[0].name, "Solar Inverter");
  assert.equal(duplicated.items[0].quantity, 2);
});

test("server payload recalculates totals and ignores client-supplied totals", () => {
  const maliciousInput = {
    lead_id: "550e8400-e29b-41d4-a716-446655440000",
    customer_id: null,
    quote_number: "FSA-2026-0500",
    issue_date: "2026-07-16",
    valid_until: "2026-08-15",
    status: "draft",
    currency: "TRY",
    shipping_total: 10,
    order_discount_type: "percentage",
    order_discount_value: 10,
    notes: "",
    payment_terms: "",
    delivery_terms: "",
    items: [
      {
        product_id: null,
        name: "Consulting",
        description: "Manual service line",
        sku: "",
        quantity: 2,
        unit: "hour",
        unit_price: 100,
        currency: "TRY",
        discount_type: "percentage",
        discount_value: 0,
        tax_rate: 20,
        sort_order: 0,
      },
    ],
    subtotal: 999999,
    discount_total: 999999,
    tax_total: 999999,
    grand_total: 999999,
  } as QuoteFormInput & {
    subtotal: number;
    discount_total: number;
    tax_total: number;
    grand_total: number;
  };

  const payload = buildQuotePayload(maliciousInput);

  assert.equal(payload.quote.subtotal, 200);
  assert.equal(payload.quote.discount_total, 20);
  assert.equal(payload.quote.tax_total, 36);
  assert.equal(payload.quote.grand_total, 226);
  assert.equal(payload.quote.total, 226);
  assert.equal(payload.items[0].line_total, 240);
});
