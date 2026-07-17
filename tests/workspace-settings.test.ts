import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeWorkspaceEmailValue,
  normalizeWorkspaceIbanValue,
  normalizeWorkspaceWebsiteValue,
  workspaceSettingsInputSchema,
} from "@/lib/validations/workspace-settings";
import { canManageWorkspaceSettings, getWorkspaceLogoPath, mapOrganizationToWorkspaceSettings } from "@/server/services/workspace-settings";

test("workspace settings schema normalizes branding and defaults", () => {
  const parsed = workspaceSettingsInputSchema.parse({
    company_name: "  FlowSales AI  ",
    legal_name: "FlowSales AI Demo Ltd.",
    website: "flowsales.ai",
    email: "HELLO@FLOWSALES.AI",
    phone: "+90 212 000 0000",
    secondary_phone: "",
    address_line_1: "Demo Street 1",
    address_line_2: "",
    district: "Sariyer",
    city: "Istanbul",
    postal_code: "34396",
    country: "Turkey",
    tax_office: "Maslak",
    tax_number: "1234567890",
    trade_registry_number: "987654",
    mersis_number: "0123456789012345",
    bank_name: "Demo Bank",
    bank_branch: "Maslak",
    iban: "tr12 0006 2000 0000 1234 5678 90",
    account_holder: "FlowSales AI Demo Ltd.",
    default_currency: "TRY",
    default_tax_rate: "20",
    default_payment_terms: "50% upfront",
    default_delivery_terms: "Delivery in 21 days",
    default_quote_notes: "Brand-safe defaults.",
    default_quote_validity_days: "30",
    quote_footer_text: "Thanks for choosing FlowSales AI.",
    signature_name: "Selin Kaya",
    signature_title: "Managing Director",
    company_slogan: "Premium modular sales automation.",
  });

  assert.equal(parsed.company_name, "FlowSales AI");
  assert.equal(parsed.website, "https://flowsales.ai/");
  assert.equal(parsed.email, "hello@flowsales.ai");
  assert.equal(parsed.iban, "TR120006200000001234567890");
  assert.equal(parsed.default_tax_rate, 20);
  assert.equal(parsed.default_quote_validity_days, 30);
});

test("workspace settings helpers keep roles and logo paths safe", () => {
  assert.equal(canManageWorkspaceSettings("owner"), true);
  assert.equal(canManageWorkspaceSettings("admin"), true);
  assert.equal(canManageWorkspaceSettings("sales"), false);
  assert.equal(canManageWorkspaceSettings("viewer"), false);
  assert.equal(getWorkspaceLogoPath("org_123", "image/png"), "organizations/org_123/logo.png");
  assert.equal(normalizeWorkspaceWebsiteValue("flowsales.ai"), "https://flowsales.ai/");
  assert.equal(normalizeWorkspaceEmailValue("TEAM@FLOWSALES.AI"), "team@flowsales.ai");
  assert.equal(normalizeWorkspaceIbanValue("tr12 3456 7890 1234 5678 9012 34"), "TR123456789012345678901234");
});

test("workspace settings mapping exposes company branding", () => {
  const settings = mapOrganizationToWorkspaceSettings({
    id: "org_123",
    name: "FlowSales AI",
    slug: "flowsales",
    currency: "EUR",
    role: "owner",
    logo_url: "https://example.com/logo.png",
    logo_path: "organizations/org_123/logo.png",
    legal_name: "FlowSales AI Demo Ltd.",
    company_slogan: "Premium modular sales automation.",
    quote_footer_text: "Thanks for choosing us.",
    default_tax_rate: 18,
    default_quote_validity_days: 21,
  } as never);

  assert.equal(settings.company_name, "FlowSales AI");
  assert.equal(settings.logo_path, "organizations/org_123/logo.png");
  assert.equal(settings.default_currency, "EUR");
  assert.equal(settings.default_tax_rate, 18);
  assert.equal(settings.default_quote_validity_days, 21);
  assert.equal(settings.quote_footer_text, "Thanks for choosing us.");
});

