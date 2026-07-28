import { NextRequest, NextResponse } from "next/server";

import { reconstructWebhookEvent } from "@/server/services/stripe";
import { processStripeWebhookEvent } from "@/server/services/webhook-handler";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY?.trim() || !process.env.STRIPE_WEBHOOK_SECRET?.trim()) {
    return NextResponse.json({ error: "Stripe webhook not configured." }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header." }, { status: 400 });
  }

  const rawBody = await req.text();

  let event;
  try {
    event = reconstructWebhookEvent(rawBody, signature);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    await processStripeWebhookEvent(event);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook processing failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
