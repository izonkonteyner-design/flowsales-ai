import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

import {
  canManageLeads,
  canMutateLeadRecord,
  canViewLeads,
  getLeadRecordRestrictionMessage,
} from "@/server/services/lead-domain";

test("viewer role cannot create leads — viewer excluded from canManageLeads", () => {
  assert.equal(canManageLeads("viewer"), false, "viewer must not be in the manage set");
  assert.equal(canManageLeads("sales"), true);
  assert.equal(canManageLeads("admin"), true);
  assert.equal(canManageLeads("owner"), true);
  assert.equal(canManageLeads(null), false);
  assert.equal(canManageLeads(undefined), false);
});

test("viewer can view leads but cannot mutate them", () => {
  assert.equal(canViewLeads("viewer"), true);
  assert.equal(canViewLeads("sales"), true);
  assert.equal(canViewLeads("admin"), true);
  assert.equal(canViewLeads("owner"), true);
});

test("demo workspace blocks every lead mutation regardless of role", () => {
  assert.equal(canMutateLeadRecord("demo", "owner"), false);
  assert.equal(canMutateLeadRecord("demo", "admin"), false);
  assert.equal(canMutateLeadRecord("demo", "sales"), false);
  assert.equal(canMutateLeadRecord("demo", "viewer"), false);
});

test("live workspace blocks viewer from mutating leads", () => {
  assert.equal(canMutateLeadRecord("live", "viewer"), false);
  assert.equal(canMutateLeadRecord("live", "sales"), true);
  assert.equal(canMutateLeadRecord("live", "admin"), true);
  assert.equal(canMutateLeadRecord("live", "owner"), true);
});

test("viewer restriction message is user-facing (no developer jargon)", () => {
  const message = getLeadRecordRestrictionMessage("live", "viewer");
  assert.ok(message.length > 0);
  assert.match(message, /viewer/i);
  assert.doesNotMatch(message, /RLS|policy|database|stack/i, "must not leak implementation details");
});

test("demo restriction message tells the user to connect Supabase", () => {
  const message = getLeadRecordRestrictionMessage("demo", "owner");
  assert.match(message, /supabase|live data/i);
  assert.match(
    message,
    /edit|create|change/i,
    "must explain what the demo session cannot do",
  );
});

test("authorized member sees no restriction message", () => {
  assert.equal(getLeadRecordRestrictionMessage("live", "owner"), "");
  assert.equal(getLeadRecordRestrictionMessage("live", "sales"), "");
});

test("RLS policy for leads excludes viewer from write operations", () => {
  const initialMigrationPath = path.join(
    process.cwd(),
    "supabase/migrations/0001_initial.sql",
  );
  assert.ok(
    fs.existsSync(initialMigrationPath),
    "0001_initial.sql must exist",
  );
  const sql = fs.readFileSync(initialMigrationPath, "utf-8");

  // The "sales and admins can manage leads" policy is `for all` (covers
  // INSERT/UPDATE/DELETE/SELECT) and is the only write policy on the table.
  // Its role array MUST exclude `viewer`.
  const policyIndex = sql.indexOf("sales and admins can manage leads");
  assert.ok(policyIndex >= 0, "leads write/manage policy must exist in 0001_initial.sql");

  // Slice a window around the policy declaration (policy header + body).
  const policyBody = sql.slice(policyIndex, policyIndex + 600);
  assert.match(
    policyBody,
    /has_org_role\([^)]*array\s*\[\s*['"]owner['"]\s*,\s*['"]admin['"]\s*,\s*['"]sales['"]\s*\]/i,
    "leads write policy must scope writes to owner, admin, and sales",
  );
  assert.doesNotMatch(
    policyBody,
    /['"]viewer['"]/i,
    "leads write policy must NOT include the viewer role",
  );
});

test("backfill migration 0019 exists and is idempotent (guarded updates only)", () => {
  const migrationPath = path.join(
    process.cwd(),
    "supabase/migrations/0019_fix_quote_grand_total_backfill.sql",
  );
  assert.ok(fs.existsSync(migrationPath), "0019 backfill migration must exist");
  const sql = fs.readFileSync(migrationPath, "utf-8");

  assert.match(sql, /update public\.quotes/i, "must contain an UPDATE against public.quotes");
  assert.match(sql, /where grand_total\s*=\s*0/i, "must be guarded on grand_total = 0 (idempotent)");
  assert.match(
    sql,
    /grand_total\s*=\s*case/i,
    "must use a CASE expression so re-runs do not change already-repaired rows",
  );
  assert.doesNotMatch(
    sql,
    /drop\s+table|delete\s+from\s+public\.quotes\s*;/i,
    "must not drop or universally delete quote rows",
  );
  assert.doesNotMatch(
    sql,
    /status\s*=/i,
    "must not change quote.status",
  );
  assert.doesNotMatch(
    sql,
    /organization_id\s*=/i,
    "must not change organization_id (workspace isolation preserved)",
  );
});

test("the /leads/new page guards the create form behind canManageLeads via context.mode + role", () => {
  const pagePath = path.join(
    process.cwd(),
    "app/(app)/leads/new/page.tsx",
  );
  assert.ok(fs.existsSync(pagePath), "leads/new page must exist");
  const src = fs.readFileSync(pagePath, "utf-8");

  assert.match(
    src,
    /data\.context\.mode\s*===\s*['"]live['"]/,
    "page must check that the workspace context is live before rendering the active form",
  );
  assert.match(
    src,
    /canManageLeads\s*\(\s*data\.context\.role\s*\)/,
    "page must call canManageLeads(data.context.role) to gate the create form",
  );
  assert.match(
    src,
    /EmptyState/,
    "page must render an EmptyState when the viewer/demo is blocked (mirrors /leads/[id]/edit)",
  );
  assert.match(
    src,
    /getLeadRecordRestrictionMessage/,
    "page must pass a human-readable restriction message to the EmptyState",
  );
});

test("the /leads page hides the 'New lead' CTA from viewers and demo sessions", () => {
  const pagePath = path.join(process.cwd(), "app/(app)/leads/page.tsx");
  const src = fs.readFileSync(pagePath, "utf-8");

  assert.match(
    src,
    /canCreateLead\s*=\s*data\.context\.mode\s*===\s*['"]live['"]\s*&&\s*canManageLeads\s*\(\s*data\.context\.role\s*\)/,
    "page must compute canCreateLead from mode + canManageLeads(role)",
  );
  assert.match(
    src,
    /\{\s*canCreateLead\s*\?/,
    "page must guard the New lead CTA render behind canCreateLead",
  );
});
