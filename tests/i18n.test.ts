import test from "node:test";
import assert from "node:assert/strict";

import { navLabel, normalizeLocale, t } from "@/lib/i18n";

test("normalizes supported locales and defaults safely", () => {
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

test("quote AI copy is localized", () => {
  assert.equal(t("tr", "quoteAiTitle"), "Yapay zekâ ile taslak oluştur");
  assert.equal(t("en", "quoteAiTitle"), "Create a draft with AI");
  assert.equal(t("tr", "quoteAiGenerate"), "Taslak oluştur");
  assert.equal(t("en", "quoteAiGenerate"), "Create draft");
  assert.equal(t("tr", "quoteAiRetry"), "Yapay zekâ taslağı şu anda oluşturulamadı. Lütfen tekrar deneyin.");
  assert.equal(t("en", "quoteAiRetry"), "The AI draft could not be created right now. Please try again.");
});

test("navigation labels are localized", () => {
  assert.equal(navLabel("tr", "Leads"), "Potansiyel Müşteriler");
  assert.equal(navLabel("en", "Leads"), "Leads");
  assert.equal(navLabel("tr", "Revenue Intelligence"), "Gelir Zekâsı");
  assert.equal(navLabel("en", "Revenue Intelligence"), "Revenue Intelligence");
});
