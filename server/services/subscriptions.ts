import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { serializeSupabaseError } from "@/server/services/ai-usage-errors";
import { logBillingError, logBillingEvent } from "@/server/services/billing-logger";

export type SubscriptionRow = {
  id: string;
  organization_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
  plan: string;
  status: string;
  seat_quantity: number;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  trial_end: string | null;
  created_at: string;
  updated_at: string;
};

export type InvoiceRow = {
  id: string;
  organization_id: string;
  subscription_id: string | null;
  stripe_invoice_id: string;
  number: string | null;
  currency: string;
  amount_due: number;
  amount_paid: number;
  amount_remaining: number;
  status: string;
  period_start: string | null;
  period_end: string | null;
  hosted_invoice_url: string | null;
  invoice_pdf_url: string | null;
  paid_at: string | null;
  created_at: string;
};

export type SubscriptionUsage = {
  plan: string;
  status: string;
  seatLimit: number;
  currentSeats: number;
  aiMessageLimit: number;
  currentAiMessages: number;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

export async function getActiveSubscription(
  adminClient: SupabaseClient,
  organizationId: string
): Promise<SubscriptionRow | null> {
  const { data, error } = await adminClient
    .from("subscriptions")
    .select("*")
    .eq("organization_id", organizationId)
    .in("status", ["incomplete", "trialing", "active", "past_due", "unpaid", "paused"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logBillingError("get_active_subscription_failed", error, { organizationId });
    throw new Error(`Failed to load subscription: ${serializeSupabaseError(error)}`);
  }

  return (data as SubscriptionRow | null) ?? null;
}

export async function getOrgPlanId(adminClient: SupabaseClient, organizationId: string): Promise<string> {
  const { data, error } = await adminClient.rpc("get_org_plan", { target_org: organizationId });
  if (error) {
    return "starter";
  }
  return (data as string) || "starter";
}

export async function upsertSubscription(
  adminClient: SupabaseClient,
  input: {
    organizationId: string;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    plan: string;
    status: string;
    seatQuantity: number;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    trialEnd: string | null;
    aiMessageLimit?: number;
    metadata?: Record<string, unknown>;
  }
): Promise<SubscriptionRow> {
  const aiMessageLimit = input.aiMessageLimit ?? resolveAiMessageLimitForPlan(input.plan);
  const { data, error } = await adminClient
    .from("subscriptions")
    .upsert(
      {
        organization_id: input.organizationId,
        stripe_customer_id: input.stripeCustomerId,
        stripe_subscription_id: input.stripeSubscriptionId,
        plan: input.plan,
        status: input.status,
        seat_quantity: input.seatQuantity,
        current_period_start: input.currentPeriodStart,
        current_period_end: input.currentPeriodEnd,
        cancel_at_period_end: input.cancelAtPeriodEnd,
        trial_end: input.trialEnd,
        ai_message_limit: aiMessageLimit,
        metadata: input.metadata ?? {},
      },
      { onConflict: "stripe_subscription_id" }
    )
    .select("*")
    .single();

  if (error || !data) {
    logBillingError("upsert_subscription_failed", error, { organizationId: input.organizationId });
    throw new Error(`Failed to upsert subscription: ${serializeSupabaseError(error)}`);
  }

  logBillingEvent("subscription_upserted", {
    organizationId: input.organizationId,
    stripeSubscriptionId: input.stripeSubscriptionId,
    plan: input.plan,
    status: input.status,
  });

  return data as SubscriptionRow;
}

function resolveAiMessageLimitForPlan(plan: string): number {
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

export async function upsertInvoice(
  adminClient: SupabaseClient,
  input: {
    organizationId: string;
    subscriptionId: string | null;
    stripeInvoiceId: string;
    number: string | null;
    currency: string;
    amountDue: number;
    amountPaid: number;
    amountRemaining: number;
    status: string;
    periodStart: string | null;
    periodEnd: string | null;
    hostedInvoiceUrl: string | null;
    invoicePdfUrl: string | null;
    paidAt: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const { error } = await adminClient
    .from("invoices")
    .upsert(
      {
        organization_id: input.organizationId,
        subscription_id: input.subscriptionId,
        stripe_invoice_id: input.stripeInvoiceId,
        number: input.number,
        currency: input.currency,
        amount_due: input.amountDue,
        amount_paid: input.amountPaid,
        amount_remaining: input.amountRemaining,
        status: input.status,
        period_start: input.periodStart,
        period_end: input.periodEnd,
        hosted_invoice_url: input.hostedInvoiceUrl,
        invoice_pdf_url: input.invoicePdfUrl,
        paid_at: input.paidAt,
        metadata: input.metadata ?? {},
      },
      { onConflict: "stripe_invoice_id" }
    );

  if (error) {
    logBillingError("upsert_invoice_failed", error, { organizationId: input.organizationId });
  }
}

export async function listInvoices(
  adminClient: SupabaseClient,
  organizationId: string,
  limit = 25
): Promise<InvoiceRow[]> {
  const { data, error } = await adminClient
    .from("invoices")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    logBillingError("list_invoices_failed", error, { organizationId });
    return [];
  }

  return (data ?? []) as InvoiceRow[];
}

export async function recordWebhookEvent(
  adminClient: SupabaseClient,
  input: {
    externalEventId: string;
    eventType: string;
    payload: Record<string, unknown>;
    status?: string;
    errorMessage?: string;
  }
): Promise<{ isFirstSeen: boolean; recordId: string | null }> {
  const safeStatus = input.status ?? "received";
  const { data, error } = await adminClient
    .from("webhook_events")
    .upsert(
      {
        source: "stripe",
        external_event_id: input.externalEventId,
        event_type: input.eventType,
        payload: input.payload,
        status: safeStatus,
        error: input.errorMessage,
      },
      { onConflict: "external_event_id" }
    )
    .select("id")
    .maybeSingle();

  if (error) {
    if (String(error.code ?? "").toUpperCase() === "23505") {
      // Already processed — deduplicated
      return { isFirstSeen: false, recordId: null };
    }
    logBillingError("record_webhook_event_failed", error, { externalEventId: input.externalEventId });
    return { isFirstSeen: false, recordId: null };
  }

  return { isFirstSeen: Boolean(data?.id), recordId: data?.id ?? null };
}

export async function markWebhookProcessed(
  adminClient: SupabaseClient,
  recordId: string,
  status: "processed" | "failed" | "ignored",
  errorMessage?: string
): Promise<void> {
  const { error } = await adminClient
    .from("webhook_events")
    .update({
      status,
      error: errorMessage ?? null,
      processed_at: new Date().toISOString(),
    })
    .eq("id", recordId);

  if (error) {
    logBillingError("mark_webhook_processed_failed", error, { recordId });
  }
}

export async function getSubscriptionUsage(
  adminClient: SupabaseClient,
  organizationId: string
): Promise<SubscriptionUsage> {
  const [seatLimitRes, aiLimitRes, subscription] = await Promise.all([
    adminClient.rpc("get_org_seat_limit", { target_org: organizationId }),
    adminClient.rpc("get_org_ai_message_limit", { target_org: organizationId }),
    getActiveSubscription(adminClient, organizationId),
  ]);

  const currentMembersRes = await adminClient
    .from("organization_members")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);

  const periodStart = subscription?.current_period_start ?? defaultPeriodStart();
  const currentAiMessagesRes = await adminClient
    .from("ai_usage_events")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .gte("created_at", periodStart);

  const seatLimit = Number(seatLimitRes.data ?? 3);
  const aiMessageLimit = Number(aiLimitRes.data ?? 100);
  const currentSeats = currentMembersRes.count ?? 0;
  const currentAiMessages = currentAiMessagesRes.count ?? 0;

  return {
    plan: subscription?.plan ?? "starter",
    status: subscription?.status ?? "active",
    seatLimit,
    currentSeats,
    aiMessageLimit,
    currentAiMessages,
    currentPeriodEnd: subscription?.current_period_end ?? null,
    cancelAtPeriodEnd: subscription?.cancel_at_period_end ?? false,
  };
}

function defaultPeriodStart(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

export async function assertSeatAvailable(
  adminClient: SupabaseClient,
  organizationId: string,
  candidateCount: number
): Promise<void> {
  const { error } = await adminClient.rpc("assert_seat_capacity", {
    target_org: organizationId,
    candidate_count: candidateCount,
  });

  if (error) {
    logBillingEvent("seat_capacity_exceeded", { organizationId, candidateCount });
    throw new Error(error.message || "Seat capacity exceeded.");
  }
}

export function buildAdminClient() {
  return createSupabaseAdminClient();
}
