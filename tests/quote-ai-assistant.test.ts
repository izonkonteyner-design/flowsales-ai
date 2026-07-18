import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  QUOTE_AI_MAX_INSTRUCTION_LENGTH,
  QUOTE_AI_MAX_ITEMS,
  applyQuoteAiDraftToTextFields,
  buildQuoteAiDraftPrompt,
  parseQuoteAiDraftResponse,
  quoteAiDraftInputSchema,
  quoteAiDraftRequestSchema,
  quoteAiDraftSchema,
} from "@/lib/validations/quote-ai";

const testsDir = dirname(fileURLToPath(import.meta.url));
const serviceSource = readFileSync(join(testsDir, "..", "server", "services", "ai-quote-assistant.ts"), "utf8");
const routeSource = readFileSync(join(testsDir, "..", "app", "api", "quotes", "ai-draft", "route.ts"), "utf8");

const baseInput = quoteAiDraftInputSchema.parse({
  organization: {
    name: "FlowSales AI",
    industry: "Modular CRM",
    city: "Istanbul",
    defaultPaymentTerms: "50% upfront",
    defaultDeliveryTerms: "21 days",
  },
  customer: {
    name: "Ahmet Yilmaz",
    company: "Yilmaz Yapi",
    city: "Istanbul",
    notes: "Prefers concise formal quotes.",
  },
  quote: {
    currency: "TRY",
    issueDate: "2026-07-18",
    expiryDate: "2026-08-17",
  },
  items: [
    {
      name: "Container Office",
      sku: "CON-OF-001",
      quantity: 2,
      unit: "unit",
      unitPrice: 420000,
      taxRate: 20,
    },
  ],
  userInstruction: "Delivery wording should stay short.",
});

test("quote ai prompt contains anti-hallucination rules", () => {
  const prompt = buildQuoteAiDraftPrompt(baseInput);

  assert.match(prompt, /Yalnızca aşağıdaki CRM verisini kullan\./);
  assert.match(prompt, /Eksik ticari bilgileri uydurma\./);
  assert.match(prompt, /Toplam hesaplama yapma/);
  assert.match(prompt, /müşteriyle mutabık kalınacaktır/);
  assert.match(prompt, /Çıktı yalnızca JSON olmalı/);
  assert.match(prompt, /notes, paymentTerms, deliveryTerms, internalRecommendation/);
});

test("quote ai response schema rejects malformed json and mutation fields", () => {
  assert.throws(() => parseQuoteAiDraftResponse("{"), /SyntaxError/);
  assert.throws(
    () =>
      parseQuoteAiDraftResponse(
        JSON.stringify({
          notes: "Teklif notu",
          paymentTerms: "Ödeme",
          deliveryTerms: "Teslimat",
          product_id: "prod_001",
        }),
      ),
    /Unrecognized key|unrecognized key/i,
  );
  assert.throws(
    () =>
      parseQuoteAiDraftResponse(
        JSON.stringify({
          notes: "Teklif notu",
          deliveryTerms: "Teslimat",
        }),
      ),
    /paymentTerms|expected string|Invalid input/i,
  );
});

test("quote ai request validation rejects long instructions and too many items", () => {
  assert.equal(
    quoteAiDraftRequestSchema.safeParse({
      formId: "quote-form-1",
      leadId: null,
      customerId: "550e8400-e29b-41d4-a716-446655440000",
      quoteCurrency: "TRY",
      issueDate: "2026-07-18",
      expiryDate: "2026-08-17",
      userInstruction: "x".repeat(QUOTE_AI_MAX_INSTRUCTION_LENGTH + 1),
      items: [
        {
          name: "Container Office",
          description: "",
          sku: "CON-OF-001",
          quantity: 1,
          unit: "unit",
          unit_price: 420000,
          currency: "TRY",
          tax_rate: 20,
        },
      ],
    }).success,
    false,
  );

  assert.equal(
    quoteAiDraftRequestSchema.safeParse({
      formId: "quote-form-1",
      leadId: null,
      customerId: "550e8400-e29b-41d4-a716-446655440000",
      quoteCurrency: "TRY",
      issueDate: "2026-07-18",
      expiryDate: "2026-08-17",
      userInstruction: null,
      items: Array.from({ length: QUOTE_AI_MAX_ITEMS + 1 }, (_, index) => ({
        name: `Line ${index + 1}`,
        description: "",
        sku: "",
        quantity: 1,
        unit: "unit",
        unit_price: 100,
        currency: "TRY",
        tax_rate: 20,
      })),
    }).success,
    false,
  );
});

test("quote ai draft application only replaces approved text fields", () => {
  const next = applyQuoteAiDraftToTextFields({
    notes: "AI notes",
    paymentTerms: "AI payment",
    deliveryTerms: "AI delivery",
    internalRecommendation: "Use concise wording.",
  });

  assert.deepEqual(next, {
    notes: "AI notes",
    paymentTerms: "AI payment",
    deliveryTerms: "AI delivery",
  });
});

test("quote ai output contract keeps numeric mutation fields out", () => {
  assert.equal(
    quoteAiDraftSchema.safeParse({
      notes: "Teklif notu",
      paymentTerms: "Ödeme şartları",
      deliveryTerms: "Teslimat şartları",
      product_id: "prod_001",
      quantity: 1,
      unitPrice: 100,
    }).success,
    false,
  );
});

test("quote ai service source stays server only and uses structured json", () => {
  assert.match(serviceSource, /import "server-only";/);
  assert.match(serviceSource, /responseMimeType: "application\/json"/);
  assert.match(serviceSource, /responseSchema: quoteAiDraftResponseJsonSchema/);
  assert.match(serviceSource, /generateText\(prompt, \{/);
});

test("quote ai route enforces auth, tenancy, and safe public errors", () => {
  assert.match(routeSource, /auth\.getUser\(\)/);
  assert.match(routeSource, /organization_members/);
  assert.match(routeSource, /canManageQuotes\(membership\.role\)/);
  assert.match(routeSource, /loadQuoteRecipientResolution\(organization\.id/);
  assert.match(routeSource, /productLookup/);
  assert.match(routeSource, /usage_limit_reached/);
  assert.match(routeSource, /concurrent_request/);
  assert.match(routeSource, /success: false/);
  assert.doesNotMatch(routeSource, /GEMINI_API_KEY/);
  assert.doesNotMatch(routeSource, /SUPABASE_SERVICE_ROLE_KEY/);
});
