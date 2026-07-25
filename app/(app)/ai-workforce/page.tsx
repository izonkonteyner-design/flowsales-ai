import { getRequiredSupabaseEnv } from "@/lib/supabase/env";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export default async function AiOverviewPage() {
  const workspace = await getWorkspaceContext();
  const env = getRequiredSupabaseEnv();
  
  if (!env.configured) {
    return <div>AI is not configured.</div>;
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll() {},
    },
  });

  const [convRes, actionRes, handoffRes] = await Promise.all([
    supabase.from("ai_conversations").select("id", { count: "exact" }).eq("organization_id", workspace.organization.id),
    supabase.from("ai_action_runs").select("id", { count: "exact" }).eq("organization_id", workspace.organization.id),
    supabase.from("ai_handoffs").select("id", { count: "exact" }).eq("organization_id", workspace.organization.id),
  ]);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-950">
          <p className="text-sm font-medium text-slate-500">Total Conversations</p>
          <p className="mt-2 text-3xl font-semibold">{convRes.count || 0}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-950">
          <p className="text-sm font-medium text-slate-500">Actions Proposed</p>
          <p className="mt-2 text-3xl font-semibold">{actionRes.count || 0}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-950">
          <p className="text-sm font-medium text-slate-500">Human Handoffs</p>
          <p className="mt-2 text-3xl font-semibold">{handoffRes.count || 0}</p>
        </div>
      </div>
    </div>
  );
}
