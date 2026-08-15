import test from "node:test";
import assert from "node:assert/strict";

import { normalizeLocale, t } from "@/lib/i18n";

test("normalizes supported locales and defaults safely", () => {
  assert.equal(normalizeLocale("tr"), "tr");
  assert.equal(normalizeLocale("en"), "en");
  assert.equal(normalizeLocale("de"), "tr");
  assert.equal(normalizeLocale(undefined), "tr");
});

test("quote AI copy is localized", () => {
  assert.equal(t("tr", "quoteAiTitle"), "Yapay zekâ ile taslak oluştur");
  assert.equal(t("en", "quoteAiTitle"), "Create a draft with AI");
  assert.equal(t("tr", "quoteAiGenerate"), "Taslak oluştur");
  assert.equal(t("en", "quoteAiGenerate"), "Create draft");
  assert.equal(t("tr", "quoteAiRetry"), "Yapay zekâ taslağı şu anda oluşturulamadı. Lütfen tekrar deneyin.");
  assert.equal(t("en", "quoteAiRetry"), "The AI draft could not be created right now. Please try again.");
});
