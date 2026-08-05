import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ambiguous normalized phone matches remain unlinked", async () => {
  const sql = await readFile("supabase/migrations/0034_whatsapp_uuid_matching_fix.sql", "utf8");
  assert.match(sql, /case when count\(\*\) = 1 then \(array_agg\(id order by id\)\)\[1\] else null end/i);
  assert.doesNotMatch(sql, /min\(id\)/i);
  assert.match(sql, /when v_crm_contact_matches > 1 then 'ambiguous'/i);
  assert.match(sql, /when v_lead_matches > 1 then 'ambiguous'/i);
  assert.match(sql, /crm_contact_match' = 'ambiguous' then null/i);
  assert.match(sql, /v_lead_matches > 1 then null/i);
  assert.doesNotMatch(sql, /order by created_at asc limit 1/i);
});

test("inbound persistence RPC stays service-role only", async () => {
  const sql = await readFile("supabase/migrations/0034_whatsapp_uuid_matching_fix.sql", "utf8");
  assert.match(sql, /security definer set search_path = public/i);
  assert.match(sql, /revoke all on function[\s\S]+from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function[\s\S]+to service_role/i);
});
