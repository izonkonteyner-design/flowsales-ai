import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import Link from "next/link";

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

export default async function AiConversationsPage() {
  const workspace = await getWorkspaceContext();
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return <div>AI is not configured.</div>;
  }

  const { data: conversations, error } = await supabase
    .from("ai_conversations")
    .select("id, visitor_name, visitor_email, status, last_message_at, human_handoff_required")
    .eq("organization_id", workspace.organization.id)
    .order("last_message_at", { ascending: false });

  if (error) {
    return <div>Error loading conversations: {error.message}</div>;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-950">
      <div className="flex items-center justify-between pb-6">
        <div>
          <h2 className="text-lg font-semibold">Conversations</h2>
          <p className="text-sm text-slate-500">Live chat interactions handled by the AI.</p>
        </div>
        <Link 
          href="/ai-workforce/conversations/new" 
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Test Chat
        </Link>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-white/5">
        {!conversations || conversations.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">No conversations found.</div>
        ) : (
          conversations.map((conv) => (
            <Link 
              key={conv.id} 
              href={`/ai-workforce/conversations/${conv.id}`}
              className="flex items-center justify-between py-4 transition hover:bg-slate-50 dark:hover:bg-white/5 px-2 rounded-xl"
            >
              <div>
                <p className="font-medium">{conv.visitor_name || "Unknown Visitor"}</p>
                <p className="text-xs text-slate-500">{conv.visitor_email || "No email"}</p>
              </div>
              <div className="flex items-center gap-4">
                <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                  conv.human_handoff_required 
                    ? 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/10 dark:bg-red-500/10 dark:text-red-400' 
                    : 'bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/10 dark:bg-green-500/10 dark:text-green-400'
                }`}>
                  {conv.human_handoff_required ? "Needs Human" : conv.status}
                </span>
                <span className="text-xs text-slate-400 w-32 text-right">
                  {formatRelativeTime(new Date(conv.last_message_at))}
                </span>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
