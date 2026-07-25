import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { notFound } from "next/navigation";
import { ChatClient } from "./chat-client";

export default async function ConversationDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const workspace = await getWorkspaceContext();
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return <div>AI is not configured.</div>;
  }

  const { data: conversation } = await supabase
    .from("ai_conversations")
    .select("*")
    .eq("id", params.id)
    .eq("organization_id", workspace.organization.id)
    .single();

  if (!conversation) {
    notFound();
  }

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
        <h2 className="font-semibold">{conversation.visitor_name || "Unknown Visitor"}</h2>
        <p className="text-xs text-slate-500">
          Status: {conversation.status} {workspace.mode === "demo" ? " (Demo Read-Only)" : ""}
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
