import test from "node:test";
import assert from "node:assert/strict";

import { t } from "@/lib/i18n";

test("quote AI copy stays localized in Turkish and English", () => {
  assert.equal(t("tr", "quoteAiTitle"), "Yapay zekâ ile taslak oluştur");
  assert.equal(t("en", "quoteAiTitle"), "Create a draft with AI");
  assert.equal(t("tr", "quoteAiGenerate"), "Taslak oluştur");
  assert.equal(t("en", "quoteAiGenerate"), "Create draft");
});
