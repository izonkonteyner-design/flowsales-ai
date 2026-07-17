import assert from "node:assert/strict";
import test from "node:test";

import { leadConversionSchema } from "@/lib/validations/lead-conversion";
import { buildCustomerInsertFromLead, customerMatchesLead, normalizeEmail, normalizePhone } from "@/server/services/crm-integration";

test("lead conversion schema rejects invalid UUIDs", () => {
  assert.equal(
    leadConversionSchema.safeParse({
      lead_id: "lead_001",
    }).success,
    false,
  );
});

test("lead conversion maps safe lead fields into a customer insert payload", () => {
  const payload = buildCustomerInsertFromLead(
    {
      id: "lead-001",
      organization_id: "org-001",
      full_name: "Jane Doe",
      company: "Acme Build",
      email: "Jane@Example.com",
      phone: "+90 (555) 123-4567",
      city: "Istanbul",
      notes: "Interested in a modular office.",
    },
    "user-3",
  );

  assert.equal(payload.organization_id, "org-001");
  assert.equal(payload.full_name, "Jane Doe");
  assert.equal(payload.company, "Acme Build");
  assert.equal(payload.email, "Jane@Example.com");
  assert.equal(payload.phone, "+90 (555) 123-4567");
  assert.equal(payload.city, "Istanbul");
  assert.equal(payload.notes, "Interested in a modular office.");
  assert.equal(payload.created_by, "user-3");
  assert.equal(payload.source_lead_id, "lead-001");
});

test("customer duplicate helpers normalize email and phone values", () => {
  assert.equal(normalizeEmail("Jane@Example.com "), "jane@example.com");
  assert.equal(normalizePhone("+90 (555) 123-4567"), "905551234567");
});

test("customer duplicate helpers match normalized email and phone values", () => {
  const lead = {
    full_name: "Jane Doe",
    company: "Acme Build",
    email: "Jane@Example.com",
    phone: "+90 (555) 123-4567",
  };

  assert.equal(
    customerMatchesLead(
      {
        name: "Jane Doe",
        company: "Acme Build",
        email: "jane@example.com",
        phone: "+905551234567",
      },
      lead,
    ),
    true,
  );
});
