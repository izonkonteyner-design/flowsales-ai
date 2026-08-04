import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const billingEventSchema = z.object({
  id: z.string().min(1).max(255),
  type: z.enum([
    "subscription.trialing",
    "subscription.active",
    "subscription.past_due",
    "subscription.cancelled",
    "subscription.expired",
  ]),
  organizationId: z.string().uuid(),
  customerId: z.string().min(1).max(255).optional(),
  subscriptionId: z.string().min(1).max(255).optional(),
  plan: z.enum(["trial", "starter", "growth", "pro", "enterprise"]),
  occurredAt: z.string().datetime(),
});
export type BillingEvent = z.infer<typeof billingEventSchema>;

export function verifyBillingWebhookSignature(input: {
  rawBody: string;
  signature: string | null;
  secret: string;
}): boolean {
  if (!input.signature || !input.secret) return false;
  const expected = createHmac("sha256", input.secret).update(input.rawBody).digest("hex");
  const supplied = input.signature.replace(/^sha256=/, "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(supplied)) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(supplied, "hex"));
}

export interface BillingEventRepository {
  hasProcessed(eventId: string): Promise<boolean>;
  recordReceived(provider: string, event: BillingEvent, payload: unknown): Promise<void>;
  applyEntitlement(event: BillingEvent): Promise<void>;
  markProcessed(eventId: string): Promise<void>;
  markFailed(eventId: string, message: string): Promise<void>;
}

export async function processBillingEvent(
  repository: BillingEventRepository,
  provider: string,
  rawEvent: unknown,
): Promise<"processed" | "duplicate"> {
  const event = billingEventSchema.parse(rawEvent);
  if (await repository.hasProcessed(event.id)) return "duplicate";
  await repository.recordReceived(provider, event, rawEvent);
  try {
    await repository.applyEntitlement(event);
    await repository.markProcessed(event.id);
    return "processed";
  } catch (error) {
    await repository.markFailed(event.id, error instanceof Error ? error.message : "Unknown billing error");
    throw error;
  }
}
