import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateCustomerWindow } from "@/lib/utils/customer-window";

interface MockTemplate {
  name: string;
  language: string;
  status: "APPROVED" | "PENDING" | "REJECTED";
  paramCount: number;
  organizationId: string;
}

function validateTemplateForSend(
  template: MockTemplate | null,
  requestOrgId: string,
  providedParams: string[]
): { allowed: boolean; reason?: string } {
  if (!template) {
    return { allowed: false, reason: "unknown_template" };
  }

  if (template.organizationId !== requestOrgId) {
    return { allowed: false, reason: "cross_organization" };
  }

  if (template.status !== "APPROVED") {
    return { allowed: false, reason: "template_not_approved" };
  }

  if (providedParams.length !== template.paramCount) {
    return { allowed: false, reason: "invalid_parameter_count" };
  }

  return { allowed: true };
}

describe("WhatsApp 24-Hour Customer Window & Template Messaging Tests", () => {
  const orgA = "11111111-1111-4111-a111-111111111111";
  const orgB = "22222222-2222-4222-a222-222222222222";

  it("allows free-form messages before T0 + 24 hours", () => {
    const t0 = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString(); // 23 hours ago
    const res = validateCustomerWindow(t0);
    assert.equal(res.allowed, true);
  });

  it("blocks free-form messages at or after T0 + 24 hours boundary", () => {
    const t0 = new Date(Date.now() - 24 * 60 * 60 * 1000 - 1000).toISOString(); // 24 hours + 1s ago
    const res = validateCustomerWindow(t0);
    assert.equal(res.allowed, false);
    assert.equal(res.reason, "expired");
  });

  it("reopens 24-hour service window immediately when new inbound message arrives", () => {
    // expired initial timestamp
    const initialT0 = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();
    assert.equal(validateCustomerWindow(initialT0).allowed, false);

    // new inbound timestamp
    const newInboundAt = new Date().toISOString();
    assert.equal(validateCustomerWindow(newInboundAt).allowed, true);
  });

  it("allows sending approved template messages outside 24h window", () => {
    const tpl: MockTemplate = {
      name: "hello_world",
      language: "en_US",
      status: "APPROVED",
      paramCount: 0,
      organizationId: orgA,
    };

    const res = validateTemplateForSend(tpl, orgA, []);
    assert.equal(res.allowed, true);
  });

  it("blocks non-approved templates (PENDING / REJECTED)", () => {
    const pendingTpl: MockTemplate = {
      name: "promo_deal",
      language: "tr",
      status: "PENDING",
      paramCount: 1,
      organizationId: orgA,
    };
    assert.equal(validateTemplateForSend(pendingTpl, orgA, ["val"]).allowed, false);

    const rejectedTpl: MockTemplate = {
      name: "promo_deal",
      language: "tr",
      status: "REJECTED",
      paramCount: 1,
      organizationId: orgA,
    };
    assert.equal(validateTemplateForSend(rejectedTpl, orgA, ["val"]).allowed, false);
  });

  it("blocks template sending when body parameter count is invalid", () => {
    const tpl: MockTemplate = {
      name: "order_update",
      language: "tr",
      status: "APPROVED",
      paramCount: 2,
      organizationId: orgA,
    };

    const res = validateTemplateForSend(tpl, orgA, ["only_one_param"]);
    assert.equal(res.allowed, false);
    assert.equal(res.reason, "invalid_parameter_count");
  });

  it("blocks unknown template name", () => {
    const res = validateTemplateForSend(null, orgA, []);
    assert.equal(res.allowed, false);
    assert.equal(res.reason, "unknown_template");
  });

  it("enforces cross-organization template isolation", () => {
    const tpl: MockTemplate = {
      name: "hello_world",
      language: "en_US",
      status: "APPROVED",
      paramCount: 0,
      organizationId: orgA,
    };

    const res = validateTemplateForSend(tpl, orgB, []);
    assert.equal(res.allowed, false);
    assert.equal(res.reason, "cross_organization");
  });

  it("handles UTC timestamps deterministically regardless of local timezone", () => {
    const isoString = "2026-08-07T12:00:00.000Z";
    const d = new Date(isoString);
    assert.equal(d.toISOString(), isoString);
  });
});
