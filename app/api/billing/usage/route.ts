import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildAdminClient, getSubscriptionUsage, listInvoices, getActiveSubscription } from "@/server/services/subscriptions";
import { hasStripeConfig } from "@/server/services/stripe";

export const runtime = "nodejs";

export async function GET() {
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

  const adminClient = buildAdminClient();
  const [usage, invoices, subscription] = await Promise.all([
    getSubscriptionUsage(adminClient, membership.organization_id),
    listInvoices(adminClient, membership.organization_id, 12),
    getActiveSubscription(adminClient, membership.organization_id),
  ]);

  return NextResponse.json({
    stripeConfigured: hasStripeConfig(),
    role: (membership as { role: string }).role,
    usage,
    subscription,
    invoices,
  });
}
