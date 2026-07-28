import "server-only";

import type Stripe from "stripe";

import { getPlanFromPriceId, type PlanId } from "@/server/services/stripe";
import {
  buildAdminClient,
  markWebhookProcessed,
  recordWebhookEvent,
  upsertInvoice,
  upsertSubscription,
} from "@/server/services/subscriptions";
import { logBillingEvent, logBillingError } from "@/server/services/billing-logger";

type SubscriptionPeriod = {
  start: string | null;
  end: string | null;
};

function readSubscriptionPeriod(subscription: Stripe.Subscription): SubscriptionPeriod {
  const item = subscription.items?.data?.[0];
  if (item?.current_period_start && item?.current_period_end) {
    return {
      start: new Date(item.current_period_start * 1000).toISOString(),
      end: new Date(item.current_period_end * 1000).toISOString(),
    };
  }
  return { start: null, end: null };
}

function readCustomerId(subscription: Stripe.Subscription): string {
  return typeof subscription.customer === "string"
    ? subscription.customer
    : (subscription.customer?.id ?? "");
}

function readInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const sub = (invoice as unknown as { subscription?: string | null }).subscription;
  return typeof sub === "string" ? sub : null;
}

function readInvoicePaidAt(invoice: Stripe.Invoice): string | null {
  if (invoice.status !== "paid") return null;
  const webhooksAt = (invoice as unknown as { webhooks_delivered_at?: number | null }).webhooks_delivered_at;
  if (webhooksAt) {
    return new Date(webhooksAt * 1000).toISOString();
  }
  return new Date().toISOString();
}

const RELEVANT_EVENTS = new Set<Stripe.Event.Type>([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.payment_succeeded",
  "invoice.finalized",
  "invoice.updated",
]);

export async function processStripeWebhookEvent(event: Stripe.Event): Promise<void> {
  const adminClient = buildAdminClient();
  const externalEventId = event.id;

  const { isFirstSeen, recordId } = await recordWebhookEvent(adminClient, {
    externalEventId,
    eventType: event.type,
    payload: event as unknown as Record<string, unknown>,
    status: "received",
    errorMessage: undefined,
  });

  if (!isFirstSeen) {
    logBillingEvent("webhook_deduplicated", { externalEventId, type: event.type });
    return;
  }

  if (!RELEVANT_EVENTS.has(event.type)) {
    if (recordId) {
      await markWebhookProcessed(adminClient, recordId, "ignored");
    }
    logBillingEvent("webhook_ignored", { externalEventId, type: event.type });
    return;
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(adminClient, event);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await handleSubscriptionUpdated(adminClient, event);
        break;
      case "invoice.paid":
      case "invoice.payment_succeeded":
      case "invoice.payment_failed":
      case "invoice.finalized":
      case "invoice.updated":
        await handleInvoiceEvent(adminClient, event);
        break;
      default:
        if (recordId) {
          await markWebhookProcessed(adminClient, recordId, "ignored");
        }
        return;
    }

    if (recordId) {
      await markWebhookProcessed(adminClient, recordId, "processed");
    }
  } catch (err) {
    logBillingError("webhook_processing_failed", err, { externalEventId, type: event.type });
    if (recordId) {
      await markWebhookProcessed(adminClient, recordId, "failed", err instanceof Error ? err.message : "unknown");
    }
    throw err;
  }
}

async function handleCheckoutCompleted(adminClient: ReturnType<typeof buildAdminClient>, event: Stripe.Event): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session;
  const organizationId = session.client_reference_id;
  if (!organizationId) {
    logBillingError("checkout_missing_org_ref", null, { sessionId: session.id });
    return;
  }

  const subscriptionId = session.subscription as string | null;
  const customerId = session.customer as string | null;
  if (!subscriptionId || !customerId) {
    logBillingError("checkout_missing_sub_or_customer", null, { sessionId: session.id });
    return;
  }

  const subscription = await fetchStripeSubscription(subscriptionId);
  if (!subscription) {
    logBillingError("checkout_sub_fetch_failed", null, { subscriptionId });
    return;
  }

  const plan = (subscription.metadata?.plan as PlanId) || getPlanFromPriceId(subscription.items?.data?.[0]?.price?.id) || "starter";

  await upsertSubscription(adminClient, {
    organizationId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    plan,
    status: subscription.status,
    seatQuantity: subscription.items?.data?.[0]?.quantity ?? 1,
    currentPeriodStart: readSubscriptionPeriod(subscription).start,
    currentPeriodEnd: readSubscriptionPeriod(subscription).end,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
    metadata: { checkout_session: session.id, ...subscription.metadata },
  });

  logBillingEvent("checkout_completed", { organizationId, subscriptionId, plan });
}

async function handleSubscriptionUpdated(adminClient: ReturnType<typeof buildAdminClient>, event: Stripe.Event): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription;
  const organizationId = (subscription.metadata?.organization_id as string) || null;

  let resolvedOrgId = organizationId;
  if (!resolvedOrgId) {
    const existing = await findSubscriptionByStripeId(adminClient, subscription.id);
    resolvedOrgId = existing?.organization_id ?? null;
  }

  if (!resolvedOrgId) {
    logBillingEvent("subscription_event_without_org", { subscriptionId: subscription.id, type: event.type });
    return;
  }

  const plan = (subscription.metadata?.plan as PlanId) || getPlanFromPriceId(subscription.items?.data?.[0]?.price?.id) || "starter";
  const period = readSubscriptionPeriod(subscription);

  await upsertSubscription(adminClient, {
    organizationId: resolvedOrgId,
    stripeCustomerId: readCustomerId(subscription),
    stripeSubscriptionId: subscription.id,
    plan,
    status: subscription.status,
    seatQuantity: subscription.items?.data?.[0]?.quantity ?? 1,
    currentPeriodStart: period.start,
    currentPeriodEnd: period.end,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
    metadata: subscription.metadata ?? {},
  });

  logBillingEvent("subscription_updated", { organizationId: resolvedOrgId, subscriptionId: subscription.id, status: subscription.status });
}

async function handleInvoiceEvent(adminClient: ReturnType<typeof buildAdminClient>, event: Stripe.Event): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  const stripeSubscriptionId = readInvoiceSubscriptionId(invoice);

  let resolvedOrgId: string | null = null;
  let resolvedSubscriptionId: string | null = null;

  if (stripeSubscriptionId) {
    const existing = await findSubscriptionByStripeId(adminClient, stripeSubscriptionId);
    if (existing) {
      resolvedOrgId = existing.organization_id;
      resolvedSubscriptionId = existing.id;
    }
  }

  if (!resolvedOrgId) {
    logBillingEvent("invoice_event_without_org", { invoiceId: invoice.id, type: event.type });
    return;
  }

  const periodStart = invoice.period_start ? new Date(invoice.period_start * 1000).toISOString() : null;
  const periodEnd = invoice.period_end ? new Date(invoice.period_end * 1000).toISOString() : null;

  await upsertInvoice(adminClient, {
    organizationId: resolvedOrgId,
    subscriptionId: resolvedSubscriptionId,
    stripeInvoiceId: invoice.id,
    number: invoice.number ?? null,
    currency: invoice.currency ?? "try",
    amountDue: invoice.amount_due ?? 0,
    amountPaid: invoice.amount_paid ?? 0,
    amountRemaining: invoice.amount_remaining ?? 0,
    status: invoice.status ?? "open",
    periodStart,
    periodEnd,
    hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
    invoicePdfUrl: invoice.invoice_pdf ?? null,
    paidAt: readInvoicePaidAt(invoice),
    metadata: {},
  });

  logBillingEvent("invoice_recorded", { organizationId: resolvedOrgId, invoiceId: invoice.id, status: invoice.status });
}

async function findSubscriptionByStripeId(
  adminClient: ReturnType<typeof buildAdminClient>,
  stripeSubscriptionId: string
): Promise<{ id: string; organization_id: string } | null> {
  const { data, error } = await adminClient
    .from("subscriptions")
    .select("id, organization_id")
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as { id: string; organization_id: string };
}

let _stripeModule: typeof import("stripe") | null = null;
async function fetchStripeSubscription(subscriptionId: string): Promise<Stripe.Subscription | null> {
  if (!_stripeModule) {
    _stripeModule = await import("stripe");
  }
  const { getStripeClient } = await import("@/server/services/stripe");
  try {
    const stripe = getStripeClient();
    return await stripe.subscriptions.retrieve(subscriptionId);
  } catch (err) {
    logBillingError("stripe_subscription_retrieve_failed", err, { subscriptionId });
    return null;
  }
}

export { RELEVANT_EVENTS };
