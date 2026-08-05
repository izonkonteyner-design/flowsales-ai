import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("signed rebind is explicit single-org non-demo and conflict-safe", async () => {
  const route = await readFile("app/api/webhooks/meta/route.ts", "utf8");
  assert.match(route, /META_AUTO_BIND_SINGLE_OWNER !== "true"/);
  assert.match(route, /organizationIds\.length !== 1/);
  assert.match(route, /neq\("organization_id", DEMO_ORGANIZATION_ID\)/);
  assert.match(route, /conflict && conflict\.organization_id !== organizationId/);
  assert.match(route, /current\.status !== "connected"/);
  assert.match(route, /reconcileWhatsAppAccount/);
});

test("account reconciliation rejects ambiguity and scopes the update", async () => {
  const repository = await readFile("server/repositories/supabase/whatsapp-connections.ts", "utf8");
  assert.match(repository, /async reconcileWhatsAppAccount/);
  assert.match(repository, /\(existing\?\.length \?\? 0\) > 1/);
  assert.match(repository, /\.eq\('id', existing\[0\]\.id\)\.eq\('organization_id', organizationId\)/);
});
