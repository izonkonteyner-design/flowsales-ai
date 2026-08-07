import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Meta webhook fails closed when WABA or phone cannot be resolved", async () => {
  const route = await readFile("app/api/webhooks/meta/route.ts", "utf8");
  assert.doesNotMatch(route, /META_AUTO_BIND_SINGLE_OWNER/);
  assert.doesNotMatch(route, /rebindSignedSingleOrganizationConnection/);
  assert.match(route, /findActiveConnectionForWebhook\(wabaId, phoneNumberId\)/);
  assert.match(route, /unknown_connection/);
  assert.match(route, /status: "ignored"/);
});

test("account reconciliation rejects ambiguity and scopes the update", async () => {
  const repository = await readFile("server/repositories/supabase/whatsapp-connections.ts", "utf8");
  assert.match(repository, /async reconcileWhatsAppAccount/);
  assert.match(repository, /\(existing\?\.length \?\? 0\) > 1/);
  assert.match(repository, /\.eq\('id', existing\[0\]\.id\)\.eq\('organization_id', organizationId\)/);
});
