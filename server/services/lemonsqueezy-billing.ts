import { z } from "zod";

import type { BillingEvent } from "@/server/services/billing-webhook";

const planSchema = z.enum(["starter", "growth", "pro"]);
export type PaidPlan = z.infer<typeof planSchema>;

const API_BASE = "https://api.lemonsqueezy.com/v1";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export function getLemonSqueezyVariantId(plan: PaidPlan): string {
  const key = {
    starter: "LEMONSQUEEZY_STARTER_VARIANT_ID",
    growth: "LEMONSQUEEZY_GROWTH_VARIANT_ID",
    pro: "LEMONSQUEEZY_PRO_VARIANT_ID",
  }[plan];
  return requiredEnv(key);
}

async function lemonRequest(path: string, init?: RequestInit) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      Authorization: `Bearer ${requiredEnv("LEMONSQUEEZY_API_KEY")}`,
      ...init?.headers,
    },
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload?.errors?.[0]?.detail ?? `Lemon Squeezy API returned ${response.status}.`;
    throw new Error(detail);
  }
  return payload;
}

export async function createLemonSqueezyCheckout(input: {
  organizationId: string;
  plan: PaidPlan;
  email: string;
  name?: string | null;
  redirectUrl: string;
}) {
  const payload = await lemonRequest("/checkouts", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "checkouts",
        attributes: {
          checkout_data: {
            email: input.email,
            name: input.name ?? undefined,
            custom: {
              organization_id: input.organizationId,
              plan_key: input.plan,
            },
          },
          product_options: { redirect_url: input.redirectUrl },
          checkout_options: { embed: false, media: false, logo: true },
        },
        relationships: {
          store: { data: { type: "stores", id: requiredEnv("LEMONSQUEEZY_STORE_ID") } },
          variant: { data: { type: "variants", id: getLemonSqueezyVariantId(input.plan) } },
        },
      },
    }),
  });

  const url = payload?.data?.attributes?.url;
  if (typeof url !== "string" || !url.startsWith("https://")) throw new Error("Checkout URL was not returned.");
  return url;
}

export async function getLemonSqueezyPortalUrl(subscriptionId: string) {
  const payload = await lemonRequest(`/subscriptions/${encodeURIComponent(subscriptionId)}`);
  const url = payload?.data?.attributes?.urls?.customer_portal;
  if (typeof url !== "string" || !url.startsWith("https://")) throw new Error("Customer portal URL is unavailable.");
  return url;
}

const lemonWebhookSchema = z.object({
  meta: z.object({
    event_name: z.string(),
    custom_data: z.record(z.string(), z.unknown()).optional(),
  }),
  data: z.object({
    id: z.string(),
    type: z.string(),
    attributes: z.record(z.string(), z.unknown()),
  }),
});

function mapStatus(status: unknown): BillingEvent["type"] {
  if (status === "active") return "subscription.active";
  if (status === "on_trial") return "subscription.trialing";
  if (status === "past_due" || status === "paused") return "subscription.past_due";
  if (status === "cancelled") return "subscription.cancelled";
  return "subscription.expired";
}

export function parseLemonSqueezyWebhook(raw: unknown): BillingEvent | null {
  const payload = lemonWebhookSchema.parse(raw);
  if (!payload.meta.event_name.startsWith("subscription_")) return null;

  const custom = payload.meta.custom_data ?? {};
  const organizationId = custom.organization_id;
  const plan = custom.plan_key;
  if (typeof organizationId !== "string" || !z.string().uuid().safeParse(organizationId).success) {
    throw new Error("Webhook is missing a valid organization_id custom field.");
  }
  const parsedPlan = planSchema.safeParse(plan);
  if (!parsedPlan.success) throw new Error("Webhook is missing a supported plan_key custom field.");

  const attributes = payload.data.attributes;
  const createdAt = attributes.updated_at ?? attributes.created_at ?? new Date().toISOString();
  return {
    id: `lemonsqueezy:${payload.meta.event_name}:${payload.data.id}:${String(createdAt)}`,
    type: mapStatus(attributes.status),
    organizationId,
    customerId: attributes.customer_id == null ? undefined : String(attributes.customer_id),
    subscriptionId: payload.data.id,
    plan: parsedPlan.data,
    occurredAt: z.string().datetime().parse(String(createdAt)),
  };
}

export function getLemonSqueezyBillingConfigStatus() {
  const required = [
    "LEMONSQUEEZY_API_KEY",
    "LEMONSQUEEZY_STORE_ID",
    "LEMONSQUEEZY_STARTER_VARIANT_ID",
    "LEMONSQUEEZY_GROWTH_VARIANT_ID",
    "LEMONSQUEEZY_PRO_VARIANT_ID",
    "BILLING_WEBHOOK_SECRET",
  ];
  const missing = required.filter((key) => !process.env[key]?.trim());
  return { configured: missing.length === 0, missing };
}
