import test from "node:test";
import assert from "node:assert/strict";

import { leadFormSchema } from "@/lib/validations/lead";

test("lead validation accepts a valid lead", () => {
  const parsed = leadFormSchema.parse({
    full_name: "Aylin Toprak",
    company: "Toprak Group",
    email: "aylin@toprak.com",
    phone: "+90 533 111 2222",
    city: "Bursa",
    source: "Website",
    status: "qualified",
    estimated_value: 1250000,
    currency: "TRY",
    notes: "Ready for a quote.",
    assigned_to: "Selin Kaya",
    next_follow_up_at: "2026-07-18",
  });

  assert.equal(parsed.full_name, "Aylin Toprak");
  assert.equal(parsed.status, "qualified");
});

test("lead validation rejects invalid status", () => {
  assert.throws(() =>
    leadFormSchema.parse({
      full_name: "Bad Lead",
      company: "",
      email: "bad@example.com",
      phone: "",
      city: "",
      source: "Website",
      status: "unknown",
      estimated_value: 1,
      currency: "TRY",
      notes: "",
      assigned_to: "",
      next_follow_up_at: "",
    }),
  );
});
