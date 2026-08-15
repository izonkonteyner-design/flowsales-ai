import test from "node:test";
import assert from "node:assert/strict";

import { navLabel, normalizeLocale, t } from "@/lib/i18n";

test("i18n normalizes unsupported locales to Turkish", () => {
  assert.equal(normalizeLocale("tr"), "tr");
  assert.equal(normalizeLocale("en"), "en");
  assert.equal(normalizeLocale("de"), "tr");
  assert.equal(normalizeLocale(undefined), "tr");
});

test("shared error copy is available in both supported locales", () => {
  assert.equal(t("tr", "errorTitle"), "Bir şeyler ters gitti");
  assert.equal(t("tr", "retry"), "Tekrar dene");
  assert.equal(t("en", "errorTitle"), "Something went wrong");
  assert.equal(t("en", "retry"), "Retry");
});

test("navigation labels are localized instead of relying on English fallbacks", () => {
  assert.equal(navLabel("tr", "Leads"), "Potansiyel Müşteriler");
  assert.equal(navLabel("en", "Leads"), "Leads");
  assert.equal(navLabel("tr", "Revenue Intelligence"), "Gelir Zekâsı");
  assert.equal(navLabel("en", "Revenue Intelligence"), "Revenue Intelligence");
});
