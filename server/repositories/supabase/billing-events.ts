import type { SupabaseClient } from "@supabase/supabase-js";
import type { BillingEvent, BillingEventRepository } from "@/server/services/billing-webhook";

export class SupabaseBillingEventRepository implements BillingEventRepository {
  constructor(private readonly client: SupabaseClient) {}

  async hasProcessed(eventId: string): Promise<boolean> {
    const { data, error } = await this.client.from("billing_events").select("status").eq("id", eventId).maybeSingle();
    if (error) throw new Error(`Billing event lookup failed: ${error.message}`);
    return data?.status === "processed" || data?.status === "ignored";
  }

  async recordReceived(provider: string, event: BillingEvent, payload: unknown): Promise<void> {
    const { error } = await this.client.from("billing_events").upsert({
      id: event.id,
      provider,
      event_type: event.type,
      organization_id: event.organizationId,
      payload,
      status: "received",
      received_at: new Date().toISOString(),
    }, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw new Error(`Billing event persistence failed: ${error.message}`);
  }

  async applyEntitlement(event: BillingEvent): Promise<void> {
    const status = event.type.split(".")[1];
    const limits = {
      trial: { seats: 3, ai: 100 },
      starter: { seats: 3, ai: 250 },
      growth: { seats: 10, ai: 1500 },
      pro: { seats: 25, ai: 5000 },
      enterprise: { seats: 1000, ai: 100000 },
    }[event.plan];
    const { error } = await this.client.from("organization_entitlements").upsert({
      organization_id: event.organizationId,
      plan_key: event.plan,
      subscription_status: status,
      billing_customer_id: event.customerId ?? null,
      billing_subscription_id: event.subscriptionId ?? null,
      seat_limit: limits.seats,
      monthly_ai_run_limit: limits.ai,
      updated_at: new Date().toISOString(),
    }, { onConflict: "organization_id" });
    if (error) throw new Error(`Entitlement update failed: ${error.message}`);
  }

  async markProcessed(eventId: string): Promise<void> {
    const { error } = await this.client.from("billing_events").update({ status: "processed", processed_at: new Date().toISOString(), error_message: null }).eq("id", eventId);
    if (error) throw new Error(`Billing event completion failed: ${error.message}`);
  }

  async markFailed(eventId: string, message: string): Promise<void> {
    const { error } = await this.client.from("billing_events").update({ status: "failed", processed_at: new Date().toISOString(), error_message: message.slice(0, 2000) }).eq("id", eventId);
    if (error) throw new Error(`Billing event failure persistence failed: ${error.message}`);
  }
}
