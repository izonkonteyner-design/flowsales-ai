import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("onboarding validates company data and logo before completion", async () => {
  const [action, form, validation] = await Promise.all([
    source("app/onboarding/actions.ts"),
    source("app/onboarding/onboarding-form.tsx"),
    source("lib/validations/onboarding.ts"),
  ]);
  assert.match(action, /MAX_LOGO_SIZE/);
  assert.match(action, /workspace\.role !== "owner"/);
  assert.match(action, /onboarding_completed_at/);
  assert.doesNotMatch(action, /First product|First lead/);
  assert.match(form, /Kurulumu tamamla/);
  assert.doesNotMatch(form, /Skip for now/);
  assert.match(validation, /Europe\/Istanbul/);
});

test("0050 adds canonical roles without breaking legacy sales memberships", async () => {
  const sql = await source("supabase/migrations/0050_onboarding_roles.sql");
  assert.match(sql, /'manager'/);
  assert.match(sql, /'sales_rep'/);
  assert.match(sql, /'sales'/);
  assert.match(sql, /create or replace function public\.has_org_role/);
  assert.match(sql, /0050_onboarding_roles\.sql/);
});
