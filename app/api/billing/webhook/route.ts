import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { SupabaseBillingEventRepository } from "@/server/repositories/supabase/billing-events";
import { processBillingEvent, verifyBillingWebhookSignature } from "@/server/services/billing-webhook";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = process.env.BILLING_WEBHOOK_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "Billing webhook is not configured." }, { status: 503 });

  const rawBody = await request.text();
  const signature = request.headers.get("x-flowsales-signature");
  if (!verifyBillingWebhookSignature({ rawBody, signature, secret })) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  try {
    const repository = new SupabaseBillingEventRepository(createSupabaseAdminClient());
    const result = await processBillingEvent(repository, "configured-provider", payload);
    return NextResponse.json({ received: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Billing webhook processing failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
