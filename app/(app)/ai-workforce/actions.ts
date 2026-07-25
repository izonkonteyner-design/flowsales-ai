"use server";

import { getWorkspaceContext } from "@/server/services/workspace-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { processAiMessage } from "@/server/ai-agents/sales-agent";
import { executeAiAction } from "@/server/ai-agents/actions";

export async function sendChatMessage(conversationId: string, content: string) {
  const workspace = await getWorkspaceContext();
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("AI features require Supabase to be configured.");
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error: msgError } = await supabase
    .from("ai_messages")
    .insert({
      organization_id: workspace.organization.id,
      conversation_id: conversationId,
      role: "user",
      content
    });

  if (msgError) throw msgError;

  const isDemo = workspace.mode === "demo";
  const aiResponse = await processAiMessage(
    workspace.organization.id,
    user.id,
    conversationId,
    content,
    isDemo
  );

  if (aiResponse) {
    await supabase.from("ai_messages").insert({
      organization_id: workspace.organization.id,
      conversation_id: conversationId,
      role: "assistant",
      content: aiResponse.message,
      metadata: { intent: aiResponse.intent, confidence: aiResponse.confidence }
    });

    if (aiResponse.handoff_flag) {
      await supabase.from("ai_conversations")
        .update({ human_handoff_required: true, status: "waiting_human" })
        .eq("id", conversationId);

      await supabase.from("ai_handoffs").insert({
        organization_id: workspace.organization.id,
        conversation_id: conversationId,
        reason: "AI triggered human handoff based on user interaction",
      });
    }

    if (aiResponse.proposed_actions && aiResponse.proposed_actions.length > 0) {
      const runs = aiResponse.proposed_actions.map(act => ({
        organization_id: workspace.organization.id,
        conversation_id: conversationId,
        action_type: act.action_type,
        input_payload: act.payload,
        status: "proposed"
      }));

      await supabase.from("ai_action_runs").insert(runs);
    }
  }

  return { success: true };
}

export async function approveAiAction(actionRunId: string) {
  const workspace = await getWorkspaceContext();
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("AI features require Supabase to be configured.");
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const isDemo = workspace.mode === "demo";

  return await executeAiAction(
    workspace.organization.id,
    user.id,
    actionRunId,
    isDemo
  );
}

export async function startNewConversation() {
  const workspace = await getWorkspaceContext();
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("AI features require Supabase to be configured.");
  }

  const { data: agent } = await supabase
    .from("ai_agents")
    .select("id")
    .eq("organization_id", workspace.organization.id)
    .eq("type", "sales")
    .limit(1)
    .single();

  if (!agent) {
    throw new Error("No active sales agent found.");
  }

  const { data: conv, error } = await supabase
    .from("ai_conversations")
    .insert({
      organization_id: workspace.organization.id,
      agent_id: agent.id,
      visitor_name: "Test User",
      status: "open"
    })
    .select("id")
    .single();

  if (error) throw error;

  return { conversationId: conv.id };
}
