import assert from "node:assert/strict";
import test from "node:test";

import { parseLemonSqueezyWebhook } from "../server/services/lemonsqueezy-billing";
import { verifyBillingWebhookSignature } from "../server/services/billing-webhook";
import { createHmac } from "node:crypto";

test("Lemon Squeezy subscription webhook maps to internal entitlement event", () => {
  const event = parseLemonSqueezyWebhook({
    meta: {
      event_name: "subscription_updated",
      custom_data: {
        organization_id: "11111111-1111-4111-8111-111111111111",
        plan_key: "growth",
      },
    },
    data: {
      id: "sub_123",
      type: "subscriptions",
      attributes: {
        status: "active",
        customer_id: 55,
        updated_at: "2026-08-01T12:00:00.000Z",
      },
    },
  });

  assert.equal(event?.type, "subscription.active");
  assert.equal(event?.organizationId, "11111111-1111-4111-8111-111111111111");
  assert.equal(event?.plan, "growth");
  assert.equal(event?.customerId, "55");
  assert.equal(event?.subscriptionId, "sub_123");
});

test("non-subscription Lemon Squeezy events are ignored", () => {
  const event = parseLemonSqueezyWebhook({
    meta: { event_name: "order_created", custom_data: {} },
    data: { id: "1", type: "orders", attributes: {} },
  });
  assert.equal(event, null);
});

test("webhook verification accepts Lemon Squeezy X-Signature HMAC", () => {
  const rawBody = JSON.stringify({ hello: "world" });
  const secret = "billing-secret";
  const signature = createHmac("sha256", secret).update(rawBody).digest("hex");
  assert.equal(verifyBillingWebhookSignature({ rawBody, signature, secret }), true);
  assert.equal(verifyBillingWebhookSignature({ rawBody, signature: "0".repeat(64), secret }), false);
});

test("subscription webhook rejects missing organization custom data", () => {
  assert.throws(() => parseLemonSqueezyWebhook({
    meta: { event_name: "subscription_created", custom_data: { plan_key: "starter" } },
    data: { id: "sub_1", type: "subscriptions", attributes: { status: "active", created_at: "2026-08-01T12:00:00.000Z" } },
  }), /organization_id/);
});
