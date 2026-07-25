import { getRequiredSupabaseEnv } from "@/lib/supabase/env";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export default async function AiPlaybooksPage() {
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

  const { data: playbooks } = await supabase
    .from("ai_playbooks")
    .select("*")
    .eq("organization_id", workspace.organization.id)
    .order("created_at", { ascending: false });

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-950">
      <div className="flex items-center justify-between pb-6">
        <div>
          <h2 className="text-lg font-semibold">Playbooks</h2>
          <p className="text-sm text-slate-500">Structured instructions for handling specific scenarios.</p>
        </div>
      </div>

      <div className="space-y-4">
        {playbooks?.map((playbook) => (
          <div key={playbook.id} className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
            <h3 className="font-medium">{playbook.name}</h3>
            <p className="mt-1 text-sm text-slate-500">{playbook.description}</p>
            <div className="mt-3">
              <span className="text-xs font-semibold text-slate-500 uppercase">Instructions</span>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{playbook.instructions}</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(playbook.allowed_actions || []).map((action: string) => (
                <span key={action} className="inline-block rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-500/10 dark:text-blue-400">
                  {action}
                </span>
              ))}
            </div>
          </div>
        ))}
        {(!playbooks || playbooks.length === 0) && (
          <p className="text-sm text-slate-500">No playbooks found.</p>
        )}
      </div>
    </div>
  );
}
