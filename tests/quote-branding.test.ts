import assert from "node:assert/strict";
import test from "node:test";

import { buildQuotePdfFileName, buildQuoteDocumentModel } from "@/server/services/quote-document";

test("quote document branding uses workspace company details", () => {
  const document = buildQuoteDocumentModel(
    {
      id: "quote_1",
      organization_id: "org_1",
      lead_id: null,
      customer_id: null,
      quote_number: "FSA-2026-0420",
      issue_date: "2026-07-17",
      valid_until: "2026-08-16",
      expiry_date: "2026-08-16",
      status: "draft",
      currency: "TRY",
      notes: "",
      payment_terms: "",
      delivery_terms: "",
      subtotal: 0,
      tax_total: 0,
      total: 0,
      items: [],
      created_by: "user_1",
      created_at: "2026-07-17T00:00:00.000Z",
      updated_at: "2026-07-17T00:00:00.000Z",
    } as never,
    {
      id: "org_1",
      name: "FlowSales AI",
      slug: "flowsales",
      currency: "TRY",
      role: "owner",
      logo_url: "https://example.com/logo.png",
      logo_path: "organizations/org_1/logo.png",
      company_slogan: "Premium modular sales automation.",
      quote_footer_text: "Thanks for choosing FlowSales AI.",
      signature_name: "Selin Kaya",
      signature_title: "Managing Director",
      legal_name: "FlowSales AI Demo Ltd.",
      website: "https://flowsales.ai",
      email: "hello@flowsales.ai",
      phone: "+90 212 000 0000",
      default_quote_validity_days: 30,
    } as never,
    null,
    null,
    new Map(),
  );

  assert.equal(document.company.name, "FlowSales AI");
  assert.equal(document.company.logo_url, "https://example.com/logo.png");
  assert.equal(document.company.company_slogan, "Premium modular sales automation.");
  assert.equal(document.company.quote_footer_text, "Thanks for choosing FlowSales AI.");
  assert.equal(document.company.signature_name, "Selin Kaya");
});

test("quote pdf file names are generated without hard-coded brand text", () => {
  assert.equal(buildQuotePdfFileName("FSA-2026-0420"), "Quote-FSA-2026-0420.pdf");
});

