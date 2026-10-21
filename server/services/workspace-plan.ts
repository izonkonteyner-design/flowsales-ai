import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceContext, type WorkspaceContext } from "@/server/services/workspace-context";
import { isDemoWorkspace } from "@/lib/workspace-access";

export async function getWorkspacePlan(context?: WorkspaceContext) {
  const workspace = context ?? await getWorkspaceContext();
  const client = workspace.mode === "live" ? await createSupabaseServerClient() : null;
  const { data, error } = client
    ? await client.from("organization_entitlements").select("plan_key,subscription_status,trial_ends_at,seat_limit,monthly_ai_run_limit,billing_subscription_id").eq("organization_id", workspace.organization.id).maybeSingle()
    : { data: null, error: null };
  return {
    workspace,
    demo: isDemoWorkspace(workspace),
    configured: Boolean(data && !error),
    planKey: data?.plan_key ?? "unconfigured",
    status: data?.subscription_status ?? "unconfigured",
    trialEndsAt: data?.trial_ends_at as string | null ?? null,
    seatLimit: data?.seat_limit == null ? null : Number(data.seat_limit),
    monthlyAiRunLimit: data?.monthly_ai_run_limit == null ? null : Number(data.monthly_ai_run_limit),
    subscriptionId: data?.billing_subscription_id as string | null ?? null,
  };
}
