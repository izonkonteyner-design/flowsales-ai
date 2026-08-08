import { NextRequest, NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { createLemonSqueezyCheckout, getLemonSqueezyBillingConfigStatus, type PaidPlan } from "@/server/services/lemonsqueezy-billing";

const plans = new Set<PaidPlan>(["starter", "growth", "pro"]);

export async function GET(request: NextRequest) {
  const plan = request.nextUrl.searchParams.get("plan") as PaidPlan | null;
  if (!plan || !plans.has(plan)) return NextResponse.json({ error: "invalid_plan" }, { status: 400 });

  const config = getLemonSqueezyBillingConfigStatus();
  if (!config.configured) return NextResponse.json({ error: "billing_not_configured", missing: config.missing }, { status: 503 });

  const workspace = await getWorkspaceContext();
  if (workspace.mode === "demo") return NextResponse.json({ error: "demo_read_only" }, { status: 403 });
  if (workspace.role !== "owner" && workspace.role !== "admin") return NextResponse.json({ error: "permission_denied" }, { status: 403 });

  const client = await createSupabaseServerClient();
  if (!client) return NextResponse.json({ error: "auth_unavailable" }, { status: 503 });
  const { data } = await client.auth.getUser();
  if (!data.user?.email) return NextResponse.json({ error: "authentication_required" }, { status: 401 });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || request.nextUrl.origin;
  const url = await createLemonSqueezyCheckout({
    organizationId: workspace.organization.id,
    plan,
    email: data.user.email,
    name: data.user.user_metadata?.full_name ?? null,
    redirectUrl: `${siteUrl}/billing?checkout=success`,
  });
  return NextResponse.redirect(url);
}
