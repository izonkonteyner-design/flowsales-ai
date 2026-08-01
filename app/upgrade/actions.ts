"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createLemonSqueezyCheckout, getLemonSqueezyPortalUrl } from "@/server/services/lemonsqueezy-billing";

const planSchema = z.enum(["starter", "growth", "pro"]);

async function requireBillingContext() {
  const client = await createSupabaseServerClient();
  if (!client) redirect("/login");
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: membership } = await client
    .from("organization_members")
    .select("organization_id,role")
    .eq("user_id", auth.user.id)
    .limit(1)
    .maybeSingle();
  if (!membership) redirect("/onboarding");
  if (!["owner", "admin"].includes(String(membership.role))) throw new Error("Only workspace owners and administrators can manage billing.");
  const { data: isDemo } = await client.rpc("is_demo_organization", { p_organization_id: membership.organization_id });
  if (isDemo) throw new Error("Demo workspace billing is disabled.");
  return { client, user: auth.user, organizationId: String(membership.organization_id) };
}

export async function startCheckoutAction(formData: FormData) {
  const plan = planSchema.parse(formData.get("plan"));
  const context = await requireBillingContext();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!siteUrl) throw new Error("Application URL is not configured.");
  const url = await createLemonSqueezyCheckout({
    organizationId: context.organizationId,
    plan,
    email: context.user.email ?? "",
    name: context.user.user_metadata?.full_name ?? context.user.user_metadata?.name ?? null,
    redirectUrl: `${siteUrl.replace(/\/$/, "")}/upgrade?checkout=success`,
  });
  redirect(url);
}

export async function openCustomerPortalAction() {
  const context = await requireBillingContext();
  const { data: entitlement, error } = await context.client
    .from("organization_entitlements")
    .select("billing_subscription_id")
    .eq("organization_id", context.organizationId)
    .maybeSingle();
  if (error) throw new Error(`Unable to load billing subscription: ${error.message}`);
  const subscriptionId = entitlement?.billing_subscription_id;
  if (!subscriptionId) throw new Error("No active billing subscription was found.");
  redirect(await getLemonSqueezyPortalUrl(String(subscriptionId)));
}
