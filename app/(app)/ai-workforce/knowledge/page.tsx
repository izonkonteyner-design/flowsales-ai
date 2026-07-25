import { getRequiredSupabaseEnv } from "@/lib/supabase/env";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export default async function AiKnowledgePage() {
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

  const { data: knowledge } = await supabase
    .from("ai_knowledge_items")
    .select("*")
    .eq("organization_id", workspace.organization.id)
    .order("created_at", { ascending: false });

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-950">
      <div className="flex items-center justify-between pb-6">
        <div>
          <h2 className="text-lg font-semibold">Knowledge Base</h2>
          <p className="text-sm text-slate-500">Information the AI agent knows about your business.</p>
        </div>
      </div>

      <div className="space-y-4">
        {knowledge?.map((item) => (
          <div key={item.id} className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
            <h3 className="font-medium">{item.title}</h3>
            <span className="inline-block mt-1 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300">
              {item.category}
            </span>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{item.content}</p>
          </div>
        ))}
        {(!knowledge || knowledge.length === 0) && (
          <p className="text-sm text-slate-500">No knowledge items found.</p>
        )}
      </div>
    </div>
  );
}
