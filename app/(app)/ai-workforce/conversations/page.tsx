import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { AGENT_REGISTRY } from "@/server/ai-agents/agents/registry";
import type { AgentType } from "@/server/ai-agents/schema";
import Link from "next/link";
import { QuickStartDropdown } from "./quick-start-dropdown";

const RELATIVE_TIME = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

const TIME_DIVISIONS: Array<{ unit: Intl.RelativeTimeFormatUnit; ms: number }> = [
  { unit: "year", ms: 31_536_000_000 },
  { unit: "month", ms: 2_592_000_000 },
  { unit: "day", ms: 86_400_000 },
  { unit: "hour", ms: 3_600_000 },
  { unit: "minute", ms: 60_000 },
  { unit: "second", ms: 1_000 },
];

function formatRelativeTime(date: Date): string {
  const diffMs = date.getTime() - Date.now();
  for (const { unit, ms } of TIME_DIVISIONS) {
    if (Math.abs(diffMs) >= ms) {
      return RELATIVE_TIME.format(Math.round(diffMs / ms), unit);
    }
  }
  return RELATIVE_TIME.format(0, "second");
}

const AGENT_BADGE_STYLES: Record<AgentType, string> = {
  sales: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/10 dark:bg-blue-500/10 dark:text-blue-300",
  support:
    "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/10 dark:bg-emerald-500/10 dark:text-emerald-300",
  operations:
    "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/10 dark:bg-amber-500/10 dark:text-amber-300",
  reporting:
    "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-600/10 dark:bg-violet-500/10 dark:text-violet-300",
  social:
    "bg-pink-50 text-pink-700 ring-1 ring-inset ring-pink-600/10 dark:bg-pink-500/10 dark:text-pink-300",
};

const UNKNOWN_AGENT_TYPE = "sales" as AgentType;

export default async function AiConversationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;
  const workspace = await getWorkspaceContext();
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return <div>AI is not configured.</div>;
  }

  const { data: rows, error: queryError } = await supabase
    .from("ai_conversations")
    .select(
      "id, visitor_name, visitor_email, status, last_message_at, human_handoff_required, agent:ai_agents(name, type)"
    )
    .eq("organization_id", workspace.organization.id)
    .order("last_message_at", { ascending: false });

  if (queryError) {
    return <div>Error loading conversations: {queryError.message}</div>;
  }

  const conversations = (rows ?? []).map((row) => {
    const agentField = (row as { agent?: unknown }).agent;
    const agent = Array.isArray(agentField) ? agentField[0] : agentField;
    const agentObject = agent as { name: string | null; type: string | null } | null | undefined;
    const agentType: AgentType =
      agentObject?.type && agentObject.type in AGENT_REGISTRY ? (agentObject.type as AgentType) : UNKNOWN_AGENT_TYPE;
    return {
      id: row.id,
      visitor_name: row.visitor_name,
      visitor_email: row.visitor_email,
      status: row.status,
      last_message_at: row.last_message_at,
      human_handoff_required: row.human_handoff_required,
      agent_name: agentObject?.name ?? null,
      agent_type: agentType,
    };
  });

  const dropdownOptions = Object.values(AGENT_REGISTRY).map((def) => ({
    value: def.type,
    label: def.displayName,
    description: def.description,
  }));

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 ring-1 ring-inset ring-red-600/10 dark:bg-red-500/10 dark:text-red-300">
          Could not start a new conversation ({error}). Please try again.
        </div>
      )}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-950">
        <div className="flex items-center justify-between pb-6">
          <div>
            <h2 className="text-lg font-semibold">Conversations</h2>
            <p className="text-sm text-slate-500">Live chat interactions handled by AI agents.</p>
          </div>
          <QuickStartDropdown
            options={dropdownOptions}
            triggerLabel="New Chat"
            basePath="/ai-workforce/conversations/new"
          />
        </div>

        <div className="divide-y divide-slate-100 dark:divide-white/5">
          {conversations.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">No conversations found.</div>
          ) : (
            conversations.map((conv) => {
              const badgeStyle = AGENT_BADGE_STYLES[conv.agent_type];
              return (
                <Link
                  key={conv.id}
                  href={`/ai-workforce/conversations/${conv.id}`}
                  className="flex items-center justify-between py-4 transition hover:bg-slate-50 dark:hover:bg-white/5 px-2 rounded-xl"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{conv.visitor_name || "Unknown Visitor"}</p>
                    <p className="text-xs text-slate-500 truncate">{conv.visitor_email || "No email"}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`hidden sm:inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold ${badgeStyle}`}
                      title={conv.agent_name ?? undefined}
                    >
                      {conv.agent_name ?? conv.agent_type}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                        conv.human_handoff_required
                          ? "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/10 dark:bg-red-500/10 dark:text-red-400"
                          : "bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/10 dark:bg-green-500/10 dark:text-green-400"
                      }`}
                    >
                      {conv.human_handoff_required ? "Needs Human" : conv.status}
                    </span>
                    <span className="text-xs text-slate-400 w-28 text-right">
                      {formatRelativeTime(new Date(conv.last_message_at))}
                    </span>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
