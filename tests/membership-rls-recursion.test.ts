import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const testsDir = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(testsDir, "..", "supabase", "migrations", "0014_fix_membership_rls_recursion.sql");
const proxyPath = join(testsDir, "..", "proxy.ts");

const migration = readFileSync(migrationPath, "utf8");
const proxySource = readFileSync(proxyPath, "utf8");

test("membership helper functions are security definer helpers with fixed search path", () => {
  for (const helper of ["is_org_member", "has_org_role", "can_manage_organization_members"]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${helper}\\(`, "i"));
    assert.match(migration, new RegExp(`function public\\.${helper}\\([\\s\\S]*?security definer[\\s\\S]*?set search_path = public`, "i"));
    assert.match(migration, new RegExp(`revoke all on function public\\.${helper === "has_org_role" ? `${helper}\\(uuid, text\\[\\]\\)` : `${helper}\\(uuid\\)`} from public;`, "i"));
    assert.match(migration, new RegExp(`grant execute on function public\\.${helper === "has_org_role" ? `${helper}\\(uuid, text\\[\\]\\)` : `${helper}\\(uuid\\)`} to authenticated;`, "i"));
  }
});

test("organization memberships self-read policy avoids recursive helper calls", () => {
  assert.match(migration, /drop policy if exists "users can read organization memberships" on public\.organization_members;/i);
  assert.match(migration, /create policy "users can read their organization memberships"/i);
  assert.match(migration, /using \(\s*user_id = auth\.uid\(\)\s+or public\.can_manage_organization_members\(organization_id\)\s*\);/i);
  assert.doesNotMatch(migration, /using \(public\.is_org_member\(organization_id\)\);/i);
});

test("proxy logs membership lookup errors and returns safely instead of classifying them as missing membership", () => {
  assert.match(proxySource, /const \{ data, error: membershipError \} = await supabase/);
  assert.match(proxySource, /if \(membershipError\) \{/);
  assert.match(proxySource, /console\.error\("\[proxy\] membership lookup failed"/);
  assert.match(proxySource, /return response;/);
  assert.ok(proxySource.indexOf("if (membershipError)") < proxySource.indexOf("if (user && !membership)"));
});

