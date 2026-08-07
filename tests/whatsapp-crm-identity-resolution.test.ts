import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (/^05\d{9}$/.test(digits)) return `90${digits.slice(1)}`;
  if (/^5\d{9}$/.test(digits)) return `90${digits}`;
  if (/^905\d{9}$/.test(digits)) return digits;
  return digits;
}

type Match = { customerIds: string[]; leadIds: string[]; verifiedConversion?: boolean };

function resolve(match: Match) {
  if (match.customerIds.length > 1 || match.leadIds.length > 1) return "AMBIGUOUS";
  if (match.customerIds.length === 1 && match.leadIds.length === 1) {
    return match.verifiedConversion ? "MATCHED_CUSTOMER" : "AMBIGUOUS";
  }
  if (match.customerIds.length === 1) return "MATCHED_CUSTOMER";
  if (match.leadIds.length === 1) return "MATCHED_LEAD";
  return "UNMATCHED";
}

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

async function source(path: string) {
  return readFile(join(root, path), "utf8");
}

describe("WhatsApp CRM identity resolution", () => {
  it("canonicalizes supported Turkish phone variants to one value", () => {
    const expected = "905550743026";
    assert.equal(normalizePhone("05550743026"), expected);
    assert.equal(normalizePhone("5550743026"), expected);
    assert.equal(normalizePhone("905550743026"), expected);
    assert.equal(normalizePhone("+90 555 074 30 26"), expected);
  });

  it("resolves an exact customer match", () => {
    assert.equal(resolve({ customerIds: ["c1"], leadIds: [] }), "MATCHED_CUSTOMER");
  });

  it("resolves an exact lead match", () => {
    assert.equal(resolve({ customerIds: [], leadIds: ["l1"] }), "MATCHED_LEAD");
  });

  it("leaves an unknown phone unmatched", () => {
    assert.equal(resolve({ customerIds: [], leadIds: [] }), "UNMATCHED");
  });

  it("fails closed on duplicate customer or lead phone matches", () => {
    assert.equal(resolve({ customerIds: ["c1", "c2"], leadIds: [] }), "AMBIGUOUS");
    assert.equal(resolve({ customerIds: [], leadIds: ["l1", "l2"] }), "AMBIGUOUS");
  });

  it("prefers customer only for a verified lead conversion relationship", () => {
    assert.equal(resolve({ customerIds: ["c1"], leadIds: ["l1"], verifiedConversion: true }), "MATCHED_CUSTOMER");
    assert.equal(resolve({ customerIds: ["c1"], leadIds: ["l1"], verifiedConversion: false }), "AMBIGUOUS");
  });

  it("scopes automatic and manual resolution queries by organization", async () => {
    const migration = await source("supabase/migrations/0038_whatsapp_crm_identity_resolution.sql");
    assert.match(migration, /c\.organization_id = p_organization_id/);
    assert.match(migration, /l\.organization_id = p_organization_id/);
    assert.match(migration, /organization_id = p_organization_id/);
    assert.match(migration, /customer_not_found/);
    assert.match(migration, /lead_not_found/);
  });

  it("keeps manual decisions sticky across repeated inbound upserts", async () => {
    const migration = await source("supabase/migrations/0038_whatsapp_crm_identity_resolution.sql");
    assert.match(migration, /old\.identity_resolution_status = 'MANUALLY_RESOLVED'/);
    assert.match(migration, /old\.channel_contact_id is not distinct from new\.channel_contact_id/);
  });

  it("records manual link and unlink decisions in an audit table", async () => {
    const migration = await source("supabase/migrations/0038_whatsapp_crm_identity_resolution.sql");
    assert.match(migration, /conversation_identity_resolution_audit/);
    assert.match(migration, /manual_unlink/);
    assert.match(migration, /manual_customer/);
    assert.match(migration, /manual_lead/);
  });

  it("restricts candidate and manual-resolution RPCs to service_role", async () => {
    const migration = await source("supabase/migrations/0038_whatsapp_crm_identity_resolution.sql");
    assert.match(migration, /revoke all on function public\.get_whatsapp_identity_candidates/);
    assert.match(migration, /grant execute on function public\.get_whatsapp_identity_candidates\(uuid, uuid\) to service_role/);
    assert.match(migration, /revoke all on function public\.resolve_whatsapp_identity_manual/);
    assert.match(migration, /grant execute on function public\.resolve_whatsapp_identity_manual\(uuid, uuid, uuid, uuid, uuid\) to service_role/);
  });

  it("uses canonical normalization during inbound persistence instead of raw digit equality", async () => {
    const migration = await source("supabase/migrations/0039_whatsapp_canonical_phone_matching.sql");
    assert.match(migration, /v_normalized_sender := public\.normalize_crm_phone\(p_sender_external_id\)/);
    assert.match(migration, /public\.normalize_crm_phone\(coalesce\(phone, ''\)\) = v_normalized_sender/);
  });

  it("does not preserve stale CRM links when an inbound phone no longer matches", async () => {
    const migration = await source("supabase/migrations/0039_whatsapp_canonical_phone_matching.sql");
    assert.match(migration, /when excluded\.metadata->>'crm_contact_match' = 'none' then null/);
    assert.match(migration, /when excluded\.metadata->>'lead_match' = 'none' then null/);
  });

  it("requires explicit user action to create a CRM lead", async () => {
    const route = await source("app/api/inbox/conversations/[conversationId]/identity/route.ts");
    const service = await source("server/services/whatsapp-crm-identity.ts");
    assert.match(route, /body\.action === "create_lead"/);
    assert.match(service, /source: "WhatsApp"/);
    assert.match(service, /status: "new"/);
  });

  it("exposes resolve UI without leaking raw candidate phone numbers", async () => {
    const service = await source("server/services/whatsapp-crm-identity.ts");
    const panel = await source("components/inbox/crm-identity-panel.tsx");
    assert.match(service, /maskedPhone: maskPhoneNumber/);
    assert.match(panel, /Create Lead from WhatsApp/);
    assert.match(panel, /More than one CRM record matches/);
    assert.doesNotMatch(panel, /candidate\.phone/);
  });
});
