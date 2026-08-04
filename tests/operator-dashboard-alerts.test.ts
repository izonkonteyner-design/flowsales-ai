import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { operationalAlertsSchema, summarizeOperationalAlerts } from "../server/services/operational-alerts";

const migration = new URL("../supabase/migrations/0023_operator_dashboard_alerts.sql", import.meta.url);
async function source(path: string) { return readFile(new URL(`../${path}`, import.meta.url), "utf8"); }

test("operator migration keeps sensitive sources behind owner/admin RPC", async () => {
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /security definer/i);
  assert.match(sql, /has_org_permission\(p_organization_id, 'manage_workspace'\)/i);
  assert.match(sql, /billing_events/i);
  assert.match(sql, /account_lifecycle_requests/i);
  assert.match(sql, /revoke all on function public\.get_operational_alerts/i);
});

test("operator alerts cover failures, stale work and entitlement mismatches", async () => {
  const sql = await readFile(migration, "utf8");
  for (const category of ["ai_failure", "import_failure", "billing_failure", "lifecycle_request", "stale_approval", "entitlement_mismatch"]) {
    assert.match(sql, new RegExp(category));
  }
  assert.match(sql, /left\(b\.error_message, 160\)/i);
  assert.match(sql, /interval '24 hours'/i);
});

test("resolution audit is workspace scoped and demo safe", async () => {
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /primary key \(organization_id, alert_key\)/i);
  assert.match(sql, /resolved_by uuid not null/i);
  assert.match(sql, /is_demo_organization/i);
  assert.match(sql, /on conflict \(organization_id, alert_key\) do update/i);
});

test("operator UI is owner admin only and resolves through RPC", async () => {
  const page = await source("app/operations/page.tsx");
  const actions = await source("app/operations/actions.ts");
  assert.match(page, /\["owner", "admin"\]/);
  assert.match(page, /get_operational_alerts/);
  assert.match(page, /Mark resolved/);
  assert.match(actions, /resolve_operational_alert/);
  assert.match(actions, /auth\.getUser\(\)/);
});

test("operational alert schema and summary fail closed", () => {
  const alerts = operationalAlertsSchema.parse([{ key: "ai:1", category: "ai_failure", severity: "critical", title: "Failed", detail: "provider", occurredAt: "2026-08-01T12:00:00.000Z", href: "/ai-history" }]);
  assert.deepEqual(summarizeOperationalAlerts(alerts), { total: 1, critical: 1, high: 0, medium: 0 });
  assert.throws(() => operationalAlertsSchema.parse([{ key: "x", category: "unknown", severity: "debug", title: "", detail: "", occurredAt: "bad", href: "https://evil.test" }]));
});
