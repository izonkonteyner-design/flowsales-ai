import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createBillingPortalSession, hasStripeConfig } from "@/server/services/stripe";
import { getActiveSubscription, buildAdminClient } from "@/server/services/subscriptions";
import { logBillingError } from "@/server/services/billing-logger";

export const runtime = "nodejs";

export async function POST() {
  if (!hasStripeConfig()) {
    return NextResponse.json({ error: "Stripe billing is not configured." }, { status: 503 });
  }

  const serverClient = await createSupabaseServerClient();
  if (!serverClient) {
    return NextResponse.json({ error: "Authentication is not configured." }, { status: 503 });
  }

  const { data: userData, error: userError } = await serverClient.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const { data: membership } = await serverClient
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", userData.user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "No workspace membership found." }, { status: 404 });
  }

  if ((membership as { role: string }).role !== "owner" && (membership as { role: string }).role !== "admin") {
    return NextResponse.json({ error: "Only workspace owners and admins can open the billing portal." }, { status: 403 });
  }

  const adminClient = buildAdminClient();
  const subscription = await getActiveSubscription(adminClient, membership.organization_id);
  if (!subscription || !subscription.stripe_customer_id) {
    return NextResponse.json({ error: "No active subscription to manage." }, { status: 404 });
  }

  try {
    const { url } = await createBillingPortalSession({ customerId: subscription.stripe_customer_id });
    return NextResponse.json({ url });
  } catch (err) {
    logBillingError("portal_session_failed", err, { organizationId: membership.organization_id });
    return NextResponse.json({ error: "Failed to open billing portal." }, { status: 500 });
  }
}
