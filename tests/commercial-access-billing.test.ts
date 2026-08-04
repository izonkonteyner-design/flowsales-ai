import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { evaluateEntitlement, roleHasPermission } from "../server/services/commercial-access";
import { parseLeadCsv } from "../server/services/csv-import";
import { processBillingEvent, verifyBillingWebhookSignature, type BillingEventRepository } from "../server/services/billing-webhook";

test("role permissions separate billing, approval and CRM access", () => {
  assert.equal(roleHasPermission("owner", "manage_billing"), true);
  assert.equal(roleHasPermission("sales_manager", "review_ai"), true);
  assert.equal(roleHasPermission("sales_rep", "review_ai"), false);
  assert.equal(roleHasPermission("viewer", "edit_crm"), false);
  assert.equal(roleHasPermission("viewer", "view_crm"), true);
});

test("trial and plan limits fail closed", () => {
  assert.deepEqual(evaluateEntitlement({ plan: "trial", status: "trialing", trialEndsAt: "2026-07-01T00:00:00.000Z", seatLimit: 3, monthlyAiRunLimit: 100, currentAiRuns: 0 }, { capability: "ai_run", now: new Date("2026-08-01T00:00:00.000Z") }), { allowed: false, reason: "trial_expired" });
  assert.deepEqual(evaluateEntitlement({ plan: "growth", status: "active", seatLimit: 10, monthlyAiRunLimit: 100, currentAiRuns: 100 }, { capability: "ai_run" }), { allowed: false, reason: "ai_limit_reached" });
});

test("CSV parser validates rows and quoted values", () => {
  const result = parseLeadCsv('full_name,email,company\n"Doe, Jane",jane@example.com,Acme\nBad,not-an-email,Test');
  assert.equal(result.accepted.length, 1);
  assert.equal(result.accepted[0]?.full_name, "Doe, Jane");
  assert.equal(result.rejected.length, 1);
});

test("billing signatures use HMAC and reject malformed values", () => {
  const rawBody = JSON.stringify({ id: "evt_1" });
  const secret = "test-secret";
  const signature = createHmac("sha256", secret).update(rawBody).digest("hex");
  assert.equal(verifyBillingWebhookSignature({ rawBody, secret, signature }), true);
  assert.equal(verifyBillingWebhookSignature({ rawBody, secret, signature: "bad" }), false);
});

test("billing events are idempotent", async () => {
  const calls: string[] = [];
  const repository: BillingEventRepository = {
    hasProcessed: async () => false,
    recordReceived: async () => { calls.push("received"); },
    applyEntitlement: async () => { calls.push("applied"); },
    markProcessed: async () => { calls.push("processed"); },
    markFailed: async () => { calls.push("failed"); },
  };
  const event = { id: "evt_1", type: "subscription.active" as const, organizationId: "11111111-1111-4111-8111-111111111111", customerId: "cus_1", subscriptionId: "sub_1", plan: "growth" as const, occurredAt: "2026-08-01T10:00:00.000Z" };
  assert.equal(await processBillingEvent(repository, "test", event), "processed");
  assert.deepEqual(calls, ["received", "applied", "processed"]);
});

test("commercial migration keeps billing events service-only and protects imports", async () => {
  const sql = await readFile(new URL("../supabase/migrations/0020_commercial_access_onboarding_billing.sql", import.meta.url), "utf8");
  assert.match(sql, /billing events are service-role only/i);
  assert.doesNotMatch(sql, /create policy .*billing_events/i);
  assert.match(sql, /has_org_permission\(organization_id, 'import_data'\)/i);
  assert.match(sql, /check_workspace_entitlement/i);
  assert.match(sql, /is_demo_organization/i);
});
