import assert from "node:assert/strict";
import test from "node:test";

import { demoOrganization } from "@/server/services/crm-data";
import {
  buildQuoteDocumentModel,
  buildQuotePdfFileName,
} from "@/server/services/quote-document";
import { buildQuotePdfResponse, renderQuotePdfBuffer } from "@/server/services/quote-pdf";

const pdfDocument = buildQuoteDocumentModel(
  {
    id: "33333333-3333-4333-8333-333333333333",
    organization_id: demoOrganization.id,
    lead_id: null,
    customer_id: null,
    quote_number: "FSA-2026-0401",
    issue_date: "2026-07-16",
    valid_until: "2026-08-15",
    expiry_date: "2026-08-15",
    status: "draft" as const,
    currency: "TRY" as const,
    notes: "Türkçe metin: Ç, Ğ, İ, Ö, Ş, Ü, ı.",
    payment_terms: "Net 30",
    delivery_terms: "Delivery within 14 days",
    shipping_total: 0,
    subtotal: 1200,
    line_discount_total: 0,
    order_discount_total: 0,
    taxable_subtotal: 1200,
    tax_total: 240,
    grand_total: 1440,
    total: 1440,
    items: [
      {
        id: "item-001",
        product_id: null,
        name: "Manual service",
        description: "Detailed line item description that should wrap safely in PDF output.",
        sku: null,
        quantity: 2,
        unit: "hour",
        currency: "TRY" as const,
        unit_price: 600,
        discount_type: "fixed" as const,
        discount_value: 0,
        tax_rate: 20,
        line_subtotal: 1200,
        line_discount: 0,
        taxable_subtotal: 1200,
        line_tax: 240,
        line_total: 1440,
        sort_order: 0,
      },
    ],
    created_by: "user-001",
    created_at: "2026-07-16T08:00:00.000Z",
    updated_at: "2026-07-16T09:00:00.000Z",
    recordMode: "live" as const,
    lead_name: null,
    lead_company: null,
    customer_name: null,
    customer_company: null,
    item_count: 1,
    status_label: "Draft",
    status_tone: "info" as const,
    record_badge: { label: "Live data", tone: "success" as const, title: "Live data" },
    follow_up_state: { label: "Scheduled", tone: "info" as const },
  },
  demoOrganization,
  null,
  null,
  new Map(),
);

test("safe file name removes traversal and keeps the quote number readable", () => {
  const safeName = buildQuotePdfFileName("../../FlowSales Quote / FS-2026-001.pdf");

  assert.equal(safeName.endsWith(".pdf"), true);
  assert.equal(safeName.includes(".."), false);
  assert.equal(safeName.includes("/"), false);
  assert.match(safeName, /FS-2026-001/);
});

test("pdf response headers are safe and include the filename", async () => {
  const response = await buildQuotePdfResponse(pdfDocument);
  const contentDisposition = response.headers.get("content-disposition") ?? "";

  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(contentDisposition, /attachment/);
  assert.match(contentDisposition, /Quote-FSA-2026-0401\.pdf/);
});

test("pdf buffer renders a PDF and supports Turkish text", async () => {
  const buffer = await renderQuotePdfBuffer(pdfDocument);
  const signature = buffer.subarray(0, 4).toString("ascii");

  assert.equal(signature, "%PDF");
  assert.equal(buffer.byteLength > 0, true);
});
