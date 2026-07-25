import { getRequiredSupabaseEnv } from "@/lib/supabase/env";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export default async function AiSettingsPage() {
  const workspace = await getWorkspaceContext();
  const env = getRequiredSupabaseEnv();
  
  if (!env.configured) return <div>AI is not configured.</div>;

  const cookieStore = await cookies();
  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll() {},
    },
  });

  const { data: agent } = await supabase
    .from("ai_agents")
    .select("*")
    .eq("organization_id", workspace.organization.id)
    .single();

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-950">
      <div className="pb-6">
        <h2 className="text-lg font-semibold">Agent Settings</h2>
        <p className="text-sm text-slate-500">Configure your primary AI sales agent.</p>
      </div>

      {!agent ? (
        <p className="text-sm text-slate-500">No agent found.</p>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Agent Name</label>
            <input type="text" readOnly value={agent.name} className="mt-1 block w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-500 dark:border-white/10 dark:bg-white/5" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Model</label>
            <input type="text" readOnly value={agent.model} className="mt-1 block w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-500 dark:border-white/10 dark:bg-white/5" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">System Prompt</label>
            <textarea readOnly rows={5} value={agent.system_prompt} className="mt-1 block w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-500 dark:border-white/10 dark:bg-white/5" />
          </div>
          <div className="mt-6 border-t border-slate-200 pt-4 dark:border-white/10">
            <p className="text-xs text-amber-600 dark:text-amber-400">Settings are read-only in this MVP phase.</p>
          </div>
        </div>
      )}
    </div>
  );
}
