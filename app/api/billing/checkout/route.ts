import { NextRequest, NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createCheckoutSession, hasStripeConfig } from "@/server/services/stripe";
import { logBillingEvent, logBillingError } from "@/server/services/billing-logger";
import { getOrgPlanId, getSubscriptionUsage, buildAdminClient } from "@/server/services/subscriptions";

export const runtime = "nodejs";

const VALID_PLANS = ["starter", "pro", "business"] as const;
type Plan = (typeof VALID_PLANS)[number];

function parsePlan(value: string | null): Plan | null {
  return (VALID_PLANS as readonly string[]).includes(value ?? "") ? (value as Plan) : null;
}

export async function POST(req: NextRequest) {
  if (!hasStripeConfig()) {
    return NextResponse.json({ error: "Stripe billing is not configured." }, { status: 503 });
  }

  const serverClient = await createSupabaseServerClient();
  if (!serverClient) {
    return NextResponse.json({ error: "Authentication is not configured." }, { status: 503 });
  }

  const { data: userData, error: userError } = await serverClient.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "You must be signed in to start checkout." }, { status: 401 });
  }

  const { data: membership, error: membershipError } = await serverClient
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", userData.user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership) {
    return NextResponse.json({ error: "No active workspace membership found." }, { status: 404 });
  }

  const role = (membership as { role: string }).role;
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json({ error: "Only workspace owners and admins can manage billing." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const plan = parsePlan(body?.plan);
  if (!plan) {
    return NextResponse.json({ error: "Valid plan is required (starter | pro | business)." }, { status: 400 });
  }

  const requestedSeats = Number(body?.seats);
  const seats = Number.isInteger(requestedSeats) && requestedSeats > 0 ? requestedSeats : 1;

  const adminClient = buildAdminClient();
  const currentPlanId = await getOrgPlanId(adminClient, membership.organization_id);
  const usage = await getSubscriptionUsage(adminClient, membership.organization_id);
  if (usage.currentSeats > seats) {
    return NextResponse.json(
      { error: `Cannot reduce seats below current usage (${usage.currentSeats} in use).` },
      { status: 409 }
    );
  }
  if (plan === "starter" && seats > 3) {
    return NextResponse.json({ error: "Starter plan supports up to 3 seats." }, { status: 422 });
  }
  if (plan === currentPlanId && usage.plan !== "starter" && usage.status === "active") {
    logBillingEvent("checkout_redirect_to_portal", { organizationId: membership.organization_id, plan });
  }

  try {
    const { url } = await createCheckoutSession({
      organizationId: membership.organization_id,
      plan,
      seatQuantity: seats,
      customerEmail: userData.user.email,
      trialDays: 0,
    });

    return NextResponse.json({ url });
  } catch (err) {
    logBillingError("checkout_session_failed", err, { organizationId: membership.organization_id, plan });
    return NextResponse.json({ error: "Failed to start checkout." }, { status: 500 });
  }
}
