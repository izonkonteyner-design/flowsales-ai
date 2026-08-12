import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("0051 readiness checks the canonical organization entitlement table", async () => {
  const sql = await readFile(new URL("../supabase/migrations/0051_readiness_entitlements_fix.sql", import.meta.url), "utf8");
  assert.match(sql, /'organization_entitlements'/);
  assert.doesNotMatch(sql, /'workspace_entitlements'/);
  assert.match(sql, /v_required_version constant text := '0051'/);
  assert.match(sql, /0051_readiness_entitlements_fix\.sql/);
});
