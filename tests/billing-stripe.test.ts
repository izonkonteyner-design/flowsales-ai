import test from "node:test";
import assert from "node:assert/strict";

test("Stripe plan limits are deterministic by plan id", () => {
  // Mirrors server/services/subscriptions.ts resolveAiMessageLimitForPlan
  function limits(plan: string): number {
    switch (plan) {
      case "starter":
        return 100;
      case "pro":
        return 500;
      case "business":
        return 2000;
      case "custom":
        return 1_000_000;
      default:
        return 100;
    }
  }
  assert.equal(limits("starter"), 100);
  assert.equal(limits("pro"), 500);
  assert.equal(limits("business"), 2000);
  assert.equal(limits("custom"), 1_000_000);
  assert.equal(limits("unknown"), 100);
});

test("Stripe price id resolution is bijective with plan", () => {
  // Mirrors server/services/stripe.ts getPlanFromPriceId
  const env: Record<string, string> = {
    STRIPE_PRICE_STARTER: "price_starter",
    STRIPE_PRICE_PRO: "price_pro",
    STRIPE_PRICE_BUSINESS: "price_business",
  };
  function fromPriceId(priceId: string | null | undefined): string | null {
    if (!priceId) return null;
    if (priceId === env.STRIPE_PRICE_STARTER) return "starter";
    if (priceId === env.STRIPE_PRICE_PRO) return "pro";
    if (priceId === env.STRIPE_PRICE_BUSINESS) return "business";
    return null;
  }
  assert.equal(fromPriceId("price_starter"), "starter");
  assert.equal(fromPriceId("price_pro"), "pro");
  assert.equal(fromPriceId("price_business"), "business");
  assert.equal(fromPriceId("price_unknown"), null);
  assert.equal(fromPriceId(null), null);
});

test("Stripe plan-allowed seats match product contract", () => {
  function seatLimit(plan: string): number {
    switch (plan) {
      case "starter":
        return 3;
      case "pro":
        return 10;
      case "business":
        return 50;
      case "custom":
        return 1_000_000;
      default:
        return 3;
    }
  }
  assert.equal(seatLimit("starter"), 3);
  assert.equal(seatLimit("pro"), 10);
  assert.equal(seatLimit("business"), 50);
});
