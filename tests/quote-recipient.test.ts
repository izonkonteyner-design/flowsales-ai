import assert from "node:assert/strict";
import test from "node:test";

import { quoteRecipientSchema } from "@/lib/validations/quote-recipient";
import { chooseQuoteRecipient } from "@/server/services/crm-integration";

test("quote recipient schema requires at least one recipient", () => {
  assert.equal(
    quoteRecipientSchema.safeParse({
      lead_id: null,
      customer_id: null,
    }).success,
    false,
  );
});

test("quote recipient schema accepts lead or customer UUIDs", () => {
  assert.equal(
    quoteRecipientSchema.safeParse({
      lead_id: "550e8400-e29b-41d4-a716-446655440000",
      customer_id: null,
    }).success,
    true,
  );
});

test("customer precedence wins when both recipient IDs are present", () => {
  const selection = chooseQuoteRecipient(
    {
      id: "lead-001",
      converted_customer_id: "cust-001",
    },
    {
      id: "cust-001",
    },
  );

  assert.equal(selection.recipientType, "customer");
  assert.equal(selection.leadId, "lead-001");
  assert.equal(selection.customerId, "cust-001");
});

test("lead recipient remains available when no customer is selected", () => {
  const selection = chooseQuoteRecipient(
    {
      id: "lead-002",
      converted_customer_id: "cust-002",
    },
    null,
  );

  assert.equal(selection.recipientType, "lead");
  assert.equal(selection.leadId, "lead-002");
  assert.equal(selection.customerId, "cust-002");
});
