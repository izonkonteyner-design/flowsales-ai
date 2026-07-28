import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { notFound } from "next/navigation";
import { ChatClient } from "./chat-client";
import type { AgentType } from "@/server/ai-agents/schema";
import { AGENT_REGISTRY } from "@/server/ai-agents/agents/registry";

const AGENT_BADGE_STYLES: Record<AgentType, string> = {
  sales:
    "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/10 dark:bg-blue-500/10 dark:text-blue-300",
  support:
    "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/10 dark:bg-emerald-500/10 dark:text-emerald-300",
  operations:
    "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/10 dark:bg-amber-500/10 dark:text-amber-300",
  reporting:
    "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-600/10 dark:bg-violet-500/10 dark:text-violet-300",
  social:
    "bg-pink-50 text-pink-700 ring-1 ring-inset ring-pink-600/10 dark:bg-pink-500/10 dark:text-pink-300",
};

export default async function ConversationDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const workspace = await getWorkspaceContext();
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return <div>AI is not configured.</div>;
  }

  const { data: row } = await supabase
    .from("ai_conversations")
    .select(
      "*, agent:ai_agents(name, type)"
    )
    .eq("id", params.id)
    .eq("organization_id", workspace.organization.id)
    .maybeSingle();

  if (!row) {
    notFound();
  }

  const agent = (row as { agent?: { name: string | null; type: string | null } | null }).agent;
  const agentType: AgentType =
    agent?.type && agent.type in AGENT_REGISTRY ? (agent.type as AgentType) : "sales";
  const definition = AGENT_REGISTRY[agentType];
  const badgeStyle = AGENT_BADGE_STYLES[agentType];

  const conversation = {
    ...row,
    agent_name: agent?.name ?? definition?.displayName ?? "Unknown Agent",
    agent_type: agentType,
  };

  const { data: messages } = await supabase
    .from("ai_messages")
    .select("*")
    .eq("conversation_id", params.id)
    .order("created_at", { ascending: true });

  const { data: actions } = await supabase
    .from("ai_action_runs")
    .select("*")
    .eq("conversation_id", params.id)
    .order("created_at", { ascending: true });

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-950">
      <div className="border-b border-slate-200 px-6 py-4 dark:border-white/10">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">{conversation.visitor_name || "Unknown Visitor"}</h2>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${badgeStyle}`}
            title={conversation.agent_name ?? undefined}
          >
            {conversation.agent_name}
          </span>
        </div>
        <p className="text-xs text-slate-500">
          Status: {conversation.status} {workspace.mode === "demo" ? " (Demo Read-Only)" : ""}
          {definition ? <span className="ml-2">· {definition.description}</span> : null}
        </p>
      </div>

      <ChatClient
        conversationId={params.id}
        initialMessages={messages || []}
        initialActions={actions || []}
        isDemo={workspace.mode === "demo"}
      />
    </div>
  );
}
