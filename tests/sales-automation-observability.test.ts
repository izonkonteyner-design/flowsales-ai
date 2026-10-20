import test, { describe } from "node:test";
import assert from "node:assert/strict";

import { isCustomerOptedOut } from "@/lib/validations/sales-automation";
import {
  createOperationalAlertRecord,
  summarizeOperationalAlerts,
} from "@/server/services/operational-alerts";

describe("Sales Automation & Observability Upgrades", () => {
  test("isCustomerOptedOut detects opt-out tags and notes accurately", () => {
    assert.equal(isCustomerOptedOut(["VIP", "Istanbul"], "İlgileniyor"), false);
    assert.equal(isCustomerOptedOut(["opt-out"], "Normal not"), true);
    assert.equal(isCustomerOptedOut(["iptal"], "Normal not"), true);
    assert.equal(isCustomerOptedOut(["stop"], "Normal not"), true);
    assert.equal(isCustomerOptedOut([], "Müşteri iletişim istemiyor"), true);
    assert.equal(isCustomerOptedOut([], "do not contact"), true);
  });

  test("createOperationalAlertRecord creates typed operational alerts with severity summary", () => {
    const alert = createOperationalAlertRecord({
      key: "webhook_meta_signature_fail",
      category: "webhook_failure",
      severity: "high",
      title: "Meta Webhook İmza Doğrulama Hatası",
      detail: "Gelen webhook HMAC imzası eşleşmedi.",
    });

    assert.equal(alert.category, "webhook_failure");
    assert.equal(alert.severity, "high");

    const summary = summarizeOperationalAlerts([
      alert,
      createOperationalAlertRecord({
        key: "ollama_offline",
        category: "provider_outage",
        severity: "critical",
        title: "Ollama Sunucusu Çevrimdışı",
        detail: "Erişim reddedildi.",
      }),
    ]);

    assert.equal(summary.total, 2);
    assert.equal(summary.critical, 1);
    assert.equal(summary.high, 1);
  });
});
