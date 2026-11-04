import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canMergeDuplicateRecords,
  findDuplicateGroups,
  normalizeDuplicateEmail,
  normalizeDuplicateNameCompanyKey,
  normalizeDuplicatePhone,
  type DuplicateCandidate,
} from "../server/services/duplicate-detection";

const migration = new URL("../supabase/migrations/0069_lead_contact_duplicate_merge.sql", import.meta.url);
async function sql() {
  return readFile(migration, "utf8");
}

// ---------------------------------------------------------------------------
// Pure duplicate-detection matching logic (unit tested, no DB).
// ---------------------------------------------------------------------------

test("normalizeDuplicateEmail lowercases and trims, blank for non-strings", () => {
  assert.equal(normalizeDuplicateEmail("  Ahmet@Example.com "), "ahmet@example.com");
  assert.equal(normalizeDuplicateEmail(null), "");
  assert.equal(normalizeDuplicateEmail(undefined), "");
  assert.equal(normalizeDuplicateEmail(""), "");
});

test("normalizeDuplicatePhone strips formatting and Turkish prefixes to a comparable digit string", () => {
  assert.equal(normalizeDuplicatePhone("0532 123 45 67"), normalizeDuplicatePhone("+90 532 123 45 67"));
  assert.equal(normalizeDuplicatePhone("+90 (532) 123-4567"), normalizeDuplicatePhone("05321234567"));
  assert.equal(normalizeDuplicatePhone("123"), ""); // too short to be meaningful
  assert.equal(normalizeDuplicatePhone(null), "");
});

test("normalizeDuplicateNameCompanyKey requires both name and company to produce a key", () => {
  assert.equal(normalizeDuplicateNameCompanyKey("Ahmet Yilmaz", "Acme"), normalizeDuplicateNameCompanyKey(" ahmet   yilmaz ", "ACME"));
  assert.equal(normalizeDuplicateNameCompanyKey("Ahmet Yilmaz", null), "");
  assert.equal(normalizeDuplicateNameCompanyKey(null, "Acme"), "");
});

function lead(id: string, overrides: Partial<DuplicateCandidate> = {}): DuplicateCandidate {
  return { id, full_name: `Test Lead ${id}`, company: `Company ${id}`, email: null, phone: null, ...overrides };
}

test("findDuplicateGroups groups records sharing a normalized email", () => {
  const records = [
    lead("a", { email: "ahmet@example.com" }),
    lead("b", { email: "AHMET@EXAMPLE.COM " }),
    lead("c", { email: "someone-else@example.com" }),
  ];
  const groups = findDuplicateGroups(records);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].records.map((r) => r.id).sort(), ["a", "b"]);
  assert.ok(groups[0].reasons.includes("email"));
});

test("findDuplicateGroups groups records sharing a normalized phone regardless of formatting", () => {
  const records = [
    lead("a", { phone: "0532 123 45 67" }),
    lead("b", { phone: "+90 532 123 4567" }),
  ];
  const groups = findDuplicateGroups(records);
  assert.equal(groups.length, 1);
  assert.ok(groups[0].reasons.includes("phone"));
});

test("findDuplicateGroups groups records sharing normalized name+company only when both match", () => {
  const records = [
    lead("a", { full_name: "Mehmet Demir", company: "Izon Konteyner" }),
    lead("b", { full_name: "mehmet   demir", company: "IZON KONTEYNER" }),
    lead("c", { full_name: "Mehmet Demir", company: "Different Co" }),
  ];
  const groups = findDuplicateGroups(records);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].records.map((r) => r.id).sort(), ["a", "b"]);
  assert.ok(groups[0].reasons.includes("name_company"));
});

test("findDuplicateGroups transitively merges groups linked by different signals", () => {
  const records = [
    lead("a", { email: "shared@example.com", phone: "5551112222" }),
    lead("b", { email: "shared@example.com", phone: "5553334444" }),
    lead("c", { email: "other@example.com", phone: "5553334444" }),
  ];
  const groups = findDuplicateGroups(records);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].records.map((r) => r.id).sort(), ["a", "b", "c"]);
});

test("findDuplicateGroups never groups records with no shared signal", () => {
  const records = [
    lead("a", { full_name: "Ahmet Yilmaz", company: "A", email: "a@example.com" }),
    lead("b", { full_name: "Mehmet Demir", company: "B", email: "b@example.com" }),
  ];
  assert.deepEqual(findDuplicateGroups(records), []);
});

test("canMergeDuplicateRecords allows owner/admin/manager and rejects sales/sales_rep/viewer", () => {
  assert.equal(canMergeDuplicateRecords("owner"), true);
  assert.equal(canMergeDuplicateRecords("admin"), true);
  assert.equal(canMergeDuplicateRecords("manager"), true);
  assert.equal(canMergeDuplicateRecords("sales"), false);
  assert.equal(canMergeDuplicateRecords("sales_rep"), false);
  assert.equal(canMergeDuplicateRecords("viewer"), false);
  assert.equal(canMergeDuplicateRecords(null), false);
  assert.equal(canMergeDuplicateRecords(undefined), false);
});

// ---------------------------------------------------------------------------
// Migration SQL content: security definer RPC, permission gate, audit trail,
// cross-workspace rejection, and the exhaustive FK repoint surface.
// ---------------------------------------------------------------------------

test("merge_duplicate_records runs as a security definer RPC gated by manager/admin permission", async () => {
  const content = await sql();
  assert.match(content, /create or replace function public\.merge_duplicate_records/i);
  assert.match(content, /security definer/i);
  assert.match(content, /has_org_permission\(p_organization_id, 'manage_pipeline'\)/i);
  assert.match(content, /revoke all on function public\.merge_duplicate_records/i);
  assert.match(content, /grant execute on function public\.merge_duplicate_records.*to authenticated/i);
});

test("merge_duplicate_records rejects demo workspaces and mismatched entity types", async () => {
  const content = await sql();
  assert.match(content, /is_demo_organization\(p_organization_id\)/i);
  assert.match(content, /p_entity_type not in \('lead', 'contact'\)/i);
  assert.match(content, /Canonical and duplicate records must differ/i);
});

test("merge_duplicate_records rejects cross-workspace merge attempts", async () => {
  const content = await sql();
  assert.match(
    content,
    /v_canonical_org <> p_organization_id or v_duplicate_org <> p_organization_id/i,
    "must verify both canonical and duplicate records belong to the caller's organization before mutating anything",
  );
  assert.match(content, /Record does not belong to this organization/i);
});

test("merge_duplicate_records writes an audit trail of who merged what and when", async () => {
  const content = await sql();
  assert.match(content, /insert into public\.app_audit_logs \(organization_id, actor_id, action, entity_type, entity_id, metadata\)/i);
  assert.match(content, /'lead\.merge'/);
  assert.match(content, /'contact\.merge'/);
  assert.match(content, /auth\.uid\(\)/);
  assert.match(content, /'canonicalId', p_canonical_id/);
  assert.match(content, /'duplicateId', p_duplicate_id/);
  assert.match(content, /'mergedAt', now\(\)/);
});

test("merge_duplicate_records deletes the duplicate row only after repointing and auditing", async () => {
  const content = await sql();
  const leadAuditIndex = content.indexOf("'lead.merge'");
  const leadDeleteIndex = content.indexOf("delete from public.leads where id = p_duplicate_id");
  const contactAuditIndex = content.indexOf("'contact.merge'");
  const contactDeleteIndex = content.indexOf("delete from public.contacts where id = p_duplicate_id");

  assert.ok(leadAuditIndex > -1 && leadDeleteIndex > -1 && leadAuditIndex < leadDeleteIndex);
  assert.ok(contactAuditIndex > -1 && contactDeleteIndex > -1 && contactAuditIndex < contactDeleteIndex);
});

test("merge_duplicate_records re-points every known foreign key referencing leads(id)", async () => {
  const content = await sql();
  const leadDependentTables = [
    "public.quotes set lead_id",
    "public.activities set lead_id",
    "public.tasks set lead_id",
    "public.contacts set source_lead_id",
    "public.ai_runs set lead_id",
    "public.ai_approval_requests set lead_id",
    "public.channel_contacts set lead_id",
    "public.conversations set lead_id",
    "public.lead_source_events set lead_id",
    "public.conversation_identity_resolution_audit set previous_lead_id",
    "public.conversation_identity_resolution_audit set new_lead_id",
    "public.conversation_ai_qualifications set lead_id",
    "public.sales_follow_up_plans set lead_id",
    "public.calendar_events set lead_id",
    "public.sales_sessions set lead_id",
    "public.voice_calls set lead_id",
    "public.voice_handoffs set lead_id",
    "public.sales_callback_queue set lead_id",
    "public.sales_call_dispositions set lead_id",
    "public.lead_intent_history set lead_id",
    "public.sales_sequence_enrollments set lead_id",
    "public.sales_automation_drafts set lead_id",
    "public.sales_growth_opportunities set lead_id",
    "public.email_threads set lead_id",
    "public.customer_memories set lead_id",
    "public.ad_attributions set lead_id",
  ];
  for (const fragment of leadDependentTables) {
    assert.ok(content.includes(fragment), `missing lead_id repoint for: ${fragment}`);
  }
});

test("merge_duplicate_records re-points every known foreign key referencing contacts(id)", async () => {
  const content = await sql();
  const contactDependentTables = [
    "public.quotes set customer_id",
    "public.leads set converted_customer_id",
    "public.channel_contacts set contact_id",
    "public.conversations set customer_id",
    "public.conversation_identity_resolution_audit set previous_customer_id",
    "public.conversation_identity_resolution_audit set new_customer_id",
    "public.sales_sessions set customer_id",
    "public.voice_calls set customer_id",
    "public.sales_growth_opportunities set customer_id",
    "public.email_threads set contact_id",
    "public.customer_memories set customer_id",
  ];
  for (const fragment of contactDependentTables) {
    assert.ok(content.includes(fragment), `missing contact id repoint for: ${fragment}`);
  }
});

test("merge_duplicate_records avoids a unique-constraint violation on ad_attributions(organization_id, lead_id)", async () => {
  const content = await sql();
  assert.match(
    content,
    /delete from public\.ad_attributions\s+where lead_id = p_duplicate_id\s+and exists \(select 1 from public\.ad_attributions where lead_id = p_canonical_id\)/i,
  );
});

test("migration registers itself in deployment_migrations without colliding with 0065/0066", async () => {
  const content = await sql();
  assert.match(content, /values \('0069', '0069_lead_contact_duplicate_merge\.sql'/);
  assert.doesNotMatch(content, /values\s*\(\s*'0065'/);
  assert.doesNotMatch(content, /values\s*\(\s*'0066'/);
});
