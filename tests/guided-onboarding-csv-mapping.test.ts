import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getLeadCsvHeaders, parseLeadCsv, suggestLeadColumnMapping } from "../server/services/csv-import";

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("CSV mapping suggests common Turkish and English lead headers", () => {
  const headers = getLeadCsvHeaders("Ad Soyad,E-posta,Firma,Telefon\nAda Lovelace,ada@example.com,Analytical Engines,555");
  assert.deepEqual(headers, ["Ad Soyad", "E-posta", "Firma", "Telefon"]);
  assert.deepEqual(suggestLeadColumnMapping(headers), {
    full_name: "Ad Soyad",
    email: "E-posta",
    phone: "Telefon",
    company: "Firma",
  });
});

test("CSV import applies explicit mapping and retains rejected source values", () => {
  const csv = "Müşteri,Mail,Firma\nJane Doe,jane@example.com,Acme\nBad,not-an-email,Example";
  const result = parseLeadCsv(csv, { full_name: "Müşteri", email: "Mail", company: "Firma" });
  assert.equal(result.accepted.length, 1);
  assert.equal(result.accepted[0]?.full_name, "Jane Doe");
  assert.equal(result.rejected.length, 1);
  assert.equal(result.rejected[0]?.row, 3);
  assert.equal(result.rejected[0]?.values.Mail, "not-an-email");
});

test("CSV mapping rejects duplicate source-column use and missing full-name mapping", () => {
  assert.throws(() => parseLeadCsv("Name,Email\nJane,jane@example.com", { full_name: "Name", email: "Name" }), /cannot be mapped/i);
  assert.throws(() => parseLeadCsv("Name,Email\nJane,jane@example.com", { email: "Email" }), /Full name/i);
});

test("guided onboarding UI exposes mapping, checklist and downloadable report", async () => {
  const page = await source("app/onboarding/import/page.tsx");
  const mapper = await source("app/onboarding/import/import-mapper.tsx");
  const action = await source("app/onboarding/import/actions.ts");
  const report = await source("app/onboarding/import/[jobId]/errors/route.ts");
  assert.match(page, /Setup checklist/);
  assert.match(page, /Download rejected rows report/);
  assert.match(mapper, /Match your columns/);
  assert.match(mapper, /importLeadsAction/);
  assert.match(action, /mapping/);
  assert.match(action, /jobId/);
  assert.match(report, /\.in\("organization_id", organizationIds\)/);
  assert.match(report, /Content-Disposition/);
  assert.match(report, /private, no-store/);
});
