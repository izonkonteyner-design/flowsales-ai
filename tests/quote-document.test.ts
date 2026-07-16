import assert from "node:assert/strict";
import test from "node:test";

import { demoOrganization, demoLeads, demoProducts } from "@/server/services/crm-data";
import {
  buildQuoteDocumentModel,
  canReadQuoteDocument,
  getQuoteDocumentData,
  getQuoteDocumentRecipientLabel,
  isQuoteDocumentDemo,
  normalizeQuoteImageUrl,
} from "@/server/services/quote-document";

const baseQuote = {
  id: "11111111-1111-4111-8111-111111111111",
  organization_id: demoOrganization.id,
  lead_id: demoLeads[0].id,
  customer_id: null,
  quote_number: "FSA-2026-0314",
  issue_date: "2026-07-16",
  valid_until: "2026-08-15",
  expiry_date: "2026-08-15",
  status: "sent" as const,
  currency: "TRY" as const,
  notes: "Turkish characters: Ç, Ğ, İ, Ö, Ş, Ü, ı.",
  payment_terms: "50% upfront",
  delivery_terms: "Delivery in 21 days",
  shipping_total: 500,
  subtotal: 2500,
  line_discount_total: 100,
  order_discount_total: 50,
  taxable_subtotal: 2350,
  tax_total: 423,
  grand_total: 3273,
  total: 3273,
  items: [
    {
      id: "item-001",
      product_id: demoProducts[0].id,
      name: "Container Office",
      description: "Premium modular office",
      sku: "CON-OF-001",
      quantity: 1,
      unit: "unit",
      currency: "TRY" as const,
      unit_price: 2000,
      discount_type: "percentage" as const,
      discount_value: 5,
      tax_rate: 20,
      line_subtotal: 2000,
      line_discount: 100,
      taxable_subtotal: 1900,
      line_tax: 380,
      line_total: 2280,
      sort_order: 0,
    },
  ],
  created_by: "user-001",
  created_at: "2026-07-16T08:00:00.000Z",
  updated_at: "2026-07-16T09:00:00.000Z",
  recordMode: "demo" as const,
  lead_name: demoLeads[0].full_name,
  lead_company: demoLeads[0].company,
  customer_name: null,
  customer_company: null,
  item_count: 1,
  status_label: "Sent",
  status_tone: "warning" as const,
  record_badge: { label: "Demo data", tone: "neutral" as const, title: "Demo data" },
  follow_up_state: { label: "Scheduled", tone: "info" as const },
};

test("valid document mapping preserves saved snapshot values", () => {
  const document = buildQuoteDocumentModel(
    baseQuote,
    demoOrganization,
    {
      type: "lead",
      name: demoLeads[0].full_name,
      company: demoLeads[0].company,
      email: demoLeads[0].email,
      phone: demoLeads[0].phone,
      city: demoLeads[0].city,
      notes: demoLeads[0].notes,
    },
    null,
    new Map([[demoProducts[0].id, demoProducts[0].image_url ?? null]]),
  );

  assert.equal(document.quote_number, "FSA-2026-0314");
  assert.equal(document.status_label, "Sent");
  assert.equal(document.subtotal, 2500);
  assert.equal(document.grand_total, 3273);
  assert.equal(document.items[0].unit_price, 2000);
  assert.equal(document.items[0].line_total, 2280);
});

test("current product price is not used for saved snapshot lines", () => {
  const document = buildQuoteDocumentModel(
    baseQuote,
    demoOrganization,
    {
      type: "lead",
      name: demoLeads[0].full_name,
      company: demoLeads[0].company,
      email: demoLeads[0].email,
      phone: demoLeads[0].phone,
      city: demoLeads[0].city,
      notes: demoLeads[0].notes,
    },
    null,
    new Map([[demoProducts[0].id, "https://example.com/snapshot.png"]]),
  );

  assert.equal(document.items[0].unit_price, 2000);
  assert.notEqual(document.items[0].unit_price, demoProducts[0].unit_price);
});

test("document mapping handles empty optional fields and no recipient fallback", () => {
  const document = buildQuoteDocumentModel(
    {
      ...baseQuote,
      lead_id: null,
      notes: "",
      payment_terms: "",
      delivery_terms: "",
      items: [
        {
          ...baseQuote.items[0],
          description: "",
          sku: "",
        },
      ],
      customer_id: null,
      lead_name: null,
      lead_company: null,
      customer_name: null,
      customer_company: null,
    },
    demoOrganization,
    null,
    null,
    new Map(),
  );

  assert.equal(document.recipient.type, "none");
  assert.equal(getQuoteDocumentRecipientLabel(document), "No recipient information");
  assert.equal(document.notes, "");
  assert.equal(document.payment_terms, "");
  assert.equal(document.delivery_terms, "");
});

test("document mapping supports customer present and lead fallback", () => {
  const customerDocument = buildQuoteDocumentModel(
    {
      ...baseQuote,
      customer_id: "22222222-2222-4222-8222-222222222222",
      lead_id: null,
      customer_name: "ACME Customer",
      customer_company: "ACME Inc",
    },
    demoOrganization,
    null,
    {
      type: "customer",
      name: "ACME Customer",
      company: "ACME Inc",
      email: "customer@example.com",
      phone: "+90 555 000 0000",
      city: "Istanbul",
      notes: "VIP",
    },
    new Map(),
  );

  const leadDocument = buildQuoteDocumentModel(
    baseQuote,
    demoOrganization,
    {
      type: "lead",
      name: demoLeads[0].full_name,
      company: demoLeads[0].company,
      email: demoLeads[0].email,
      phone: demoLeads[0].phone,
      city: demoLeads[0].city,
      notes: demoLeads[0].notes,
    },
    null,
    new Map(),
  );

  assert.equal(customerDocument.recipient.type, "customer");
  assert.equal(customerDocument.recipient.name, "ACME Customer");
  assert.equal(leadDocument.recipient.type, "lead");
  assert.equal(leadDocument.recipient.name, demoLeads[0].full_name);
});

test("document mapping keeps totals stable across many items", () => {
  const document = buildQuoteDocumentModel(
    {
      ...baseQuote,
      items: Array.from({ length: 24 }, (_, index) => ({
        id: `item-${index + 1}`,
        product_id: null,
        name: `Line ${index + 1}`,
        description: `Description ${index + 1}`,
        sku: "",
        quantity: 1,
        unit: "unit",
        currency: "TRY" as const,
        unit_price: 100 + index,
        discount_type: "percentage" as const,
        discount_value: 0,
        tax_rate: 20,
        line_subtotal: 100 + index,
        line_discount: 0,
        taxable_subtotal: 100 + index,
        line_tax: 20 + index,
        line_total: 120 + index,
        sort_order: index,
      })),
      subtotal: 2664,
      tax_total: 720,
      grand_total: 3884,
      total: 3884,
    },
    demoOrganization,
    {
      type: "lead",
      name: demoLeads[0].full_name,
      company: demoLeads[0].company,
      email: demoLeads[0].email,
      phone: demoLeads[0].phone,
      city: demoLeads[0].city,
      notes: demoLeads[0].notes,
    },
    null,
    new Map(),
  );

  assert.equal(document.items.length, 24);
  assert.equal(document.grand_total, 3884);
});

test("document mapping keeps Turkish characters intact and avoids NaN output", () => {
  const document = buildQuoteDocumentModel(
    {
      ...baseQuote,
      quote_number: "FSA-2026-ÇİĞ-001",
      notes: "İstanbul - Çanakkale - Üsküdar",
      subtotal: Number.NaN,
      line_discount_total: Number.POSITIVE_INFINITY,
      order_discount_total: Number.NEGATIVE_INFINITY,
      taxable_subtotal: Number.NaN,
      tax_total: Number.NaN,
      grand_total: Number.NaN,
      total: Number.NaN,
    },
    demoOrganization,
    {
      type: "lead",
      name: demoLeads[0].full_name,
      company: demoLeads[0].company,
      email: demoLeads[0].email,
      phone: demoLeads[0].phone,
      city: demoLeads[0].city,
      notes: demoLeads[0].notes,
    },
    null,
    new Map(),
  );

  assert.equal(document.quote_number, "FSA-2026-ÇİĞ-001");
  assert.equal(Number.isNaN(document.subtotal), false);
  assert.equal(Number.isNaN(document.grand_total), false);
  assert.equal(Number.isFinite(document.line_discount_total), true);
});

test("status label mapping and read behavior cover demo, viewer, and unauthorized cases", async () => {
  const document = buildQuoteDocumentModel(baseQuote, demoOrganization, null, null, new Map());
  assert.equal(isQuoteDocumentDemo(document), true);
  assert.equal(canReadQuoteDocument("demo", "viewer"), true);
  assert.equal(canReadQuoteDocument("live", "viewer"), true);
  assert.equal(canReadQuoteDocument("live", null), false);
  assert.equal(canReadQuoteDocument("live", "viewer", false), false);

  const invalid = await getQuoteDocumentData("not-a-uuid");
  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.equal(invalid.status, 400);
  }
});

test("image url normalization rejects invalid values", () => {
  assert.equal(normalizeQuoteImageUrl(null), null);
  assert.equal(normalizeQuoteImageUrl(""), null);
  assert.equal(normalizeQuoteImageUrl("javascript:alert(1)"), null);
  assert.equal(normalizeQuoteImageUrl("https://example.com/image.png"), "https://example.com/image.png");
});
