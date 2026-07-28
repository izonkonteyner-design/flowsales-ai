import "server-only";

import Stripe from "stripe";

import { getSiteUrl } from "@/server/env";

type PlanId = "starter" | "pro" | "business" | "custom";

let cachedClient: Stripe | null = null;

export function hasStripeConfig(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export function getStripeClient(): Stripe {
  if (cachedClient) {
    return cachedClient;
  }
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new Error("Stripe is not configured. Set STRIPE_SECRET_KEY on the server.");
  }
  cachedClient = new Stripe(secretKey, {
    apiVersion: "2025-10-29.clover",
    typescript: true,
  });
  return cachedClient;
}

export function getStripePriceIdForPlan(plan: PlanId): string | null {
  switch (plan) {
    case "starter":
      return process.env.STRIPE_PRICE_STARTER?.trim() || null;
    case "pro":
      return process.env.STRIPE_PRICE_PRO?.trim() || null;
    case "business":
      return process.env.STRIPE_PRICE_BUSINESS?.trim() || null;
    case "custom":
      return null;
    default:
      return null;
  }
}

export function getPlanFromPriceId(priceId: string | null | undefined): PlanId | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_STARTER) return "starter";
  if (priceId === process.env.STRIPE_PRICE_PRO) return "pro";
  if (priceId === process.env.STRIPE_PRICE_BUSINESS) return "business";
  return null;
}

type CheckoutStartInput = {
  organizationId: string;
  plan: PlanId;
  seatQuantity: number;
  customerEmail?: string;
  customerId?: string;
  trialDays?: number;
};

export async function createCheckoutSession(input: CheckoutStartInput): Promise<{ url: string | null; sessionId: string }> {
  const stripe = getStripeClient();
  const priceId = getStripePriceIdForPlan(input.plan);
  if (!priceId) {
    throw new Error(`No Stripe price configured for plan "${input.plan}".`);
  }

  const appUrl = getSiteUrl();
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    line_items: [
      {
        price: priceId,
        quantity: input.seatQuantity,
      },
    ],
    client_reference_id: input.organizationId,
    success_url: `${appUrl}/billing?checkout_success=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/billing?checkout_canceled=1`,
    subscription_data: {
      metadata: {
        organization_id: input.organizationId,
        plan: input.plan,
      },
    },
    allow_promotion_codes: true,
    billing_address_collection: "auto",
  };

  if (input.customerId) {
    params.customer = input.customerId;
  } else if (input.customerEmail) {
    params.customer_email = input.customerEmail;
  }

  if (input.trialDays && input.trialDays > 0) {
    params.subscription_data!.trial_period_days = input.trialDays;
  }

  const session = await stripe.checkout.sessions.create(params);
  return { url: session.url, sessionId: session.id };
}

export type CustomerPortalInput = {
  customerId: string;
  returnUrl?: string;
};

export async function createBillingPortalSession(input: CustomerPortalInput): Promise<{ url: string }> {
  const stripe = getStripeClient();
  const appUrl = getSiteUrl();
  const session = await stripe.billingPortal.sessions.create({
    customer: input.customerId,
    return_url: input.returnUrl || `${appUrl}/billing`,
  });
  return { url: session.url };
}

export function reconstructWebhookEvent(payload: string | Buffer, signature: string): Stripe.Event {
  const stripe = getStripeClient();
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured.");
  }
  return stripe.webhooks.constructEvent(payload, signature, secret);
}

export type UpsertSubscriptionInput = {
  organizationId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  plan: PlanId;
  status: string;
  seatQuantity: number;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialEnd: string | null;
  metadata?: Record<string, unknown>;
};

export { Stripe };
export type { PlanId };
