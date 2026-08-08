import { NextRequest, NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { getLemonSqueezyPortalUrl } from "@/server/services/lemonsqueezy-billing";

export async function GET(request: NextRequest) {
  const workspace = await getWorkspaceContext();
  if (workspace.mode === "demo") return NextResponse.json({ error: "demo_read_only" }, { status: 403 });
  if (workspace.role !== "owner" && workspace.role !== "admin") return NextResponse.json({ error: "permission_denied" }, { status: 403 });

  const client = await createSupabaseServerClient();
  if (!client) return NextResponse.json({ error: "billing_unavailable" }, { status: 503 });
  const { data, error } = await client
    .from("organization_entitlements")
    .select("billing_subscription_id")
    .eq("organization_id", workspace.organization.id)
    .maybeSingle();
  if (error || !data?.billing_subscription_id) return NextResponse.redirect(new URL("/billing?portal=unavailable", request.url));

  const url = await getLemonSqueezyPortalUrl(data.billing_subscription_id);
  return NextResponse.redirect(url);
}
