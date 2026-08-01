"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  requestType: z.enum(["export", "delete_workspace", "delete_account"]),
  reason: z.string().trim().max(1000).optional(),
});

export async function createAccountLifecycleRequestAction(formData: FormData) {
  const client = await createSupabaseServerClient();
  if (!client) redirect("/login");
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect("/login");
  const input = requestSchema.parse({ requestType: formData.get("requestType"), reason: formData.get("reason") || undefined });
  const { data: memberships } = await client.from("organization_members").select("organization_id,role").eq("user_id", auth.user.id).limit(1);
  const membership = memberships?.[0];
  if (!membership) redirect("/onboarding");
  if (input.requestType === "delete_workspace" && !["owner", "admin"].includes(String(membership.role))) throw new Error("Workspace deletion requires owner or admin permission.");
  const { data: isDemo } = await client.rpc("is_demo_organization", { p_organization_id: membership.organization_id });
  if (isDemo) throw new Error("Demo workspace lifecycle changes are blocked.");
  const { error } = await client.from("account_lifecycle_requests").insert({ organization_id: membership.organization_id, requested_by: auth.user.id, request_type: input.requestType, reason: input.reason ?? null });
  if (error) throw new Error(`Unable to create lifecycle request: ${error.message}`);
  revalidatePath("/account/data");
}
