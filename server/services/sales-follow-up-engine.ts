import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";

export type FollowUpStepInput = {
  delayHours: number;
  actionType: "task" | "message_draft" | "call" | "quote_review";
  channel?: "whatsapp" | "instagram" | "facebook" | null;
  draftText?: string | null;
};

export async function createFollowUpPlan(params: {
  organizationId: string;
  userId: string;
  userRole: string;
  conversationId: string;
  name: string;
  steps: FollowUpStepInput[];
}) {
  if (params.userRole === "viewer") throw new Error("Read-only users cannot create follow-up plans.");
  if (!params.name.trim() || params.steps.length < 1 || params.steps.length > 10) throw new Error("A follow-up plan requires a name and 1-10 steps.");
  const admin = createSupabaseAdminClient();
  const { data: conversation } = await admin.from("conversations").select("id,lead_id,provider")
    .eq("id", params.conversationId).eq("organization_id", params.organizationId).maybeSingle();
  if (!conversation) throw new Error("Conversation not found.");

  const { data: plan, error: planError } = await admin.from("sales_follow_up_plans").insert({
    organization_id: params.organizationId,
    conversation_id: params.conversationId,
    lead_id: conversation.lead_id,
    name: params.name.trim().slice(0, 160),
    status: "active",
    created_by: params.userId,
  }).select("id").single();
  if (planError || !plan) throw new Error("Failed to create follow-up plan.");

  const now = Date.now();
  const rows = params.steps.map((step, index) => ({
    organization_id: params.organizationId,
    plan_id: plan.id,
    step_order: index + 1,
    action_type: step.actionType,
    channel: step.channel ?? (step.actionType === "message_draft" && ["whatsapp","instagram","facebook"].includes(conversation.provider) ? conversation.provider : null),
    due_at: new Date(now + Math.max(0, step.delayHours) * 3_600_000).toISOString(),
    status: "pending_approval",
    draft_text: step.draftText?.trim().slice(0, 4096) || null,
    requires_human_approval: true,
    metadata: { source: "flow_sales_follow_up_engine" },
  }));
  const { error: stepError } = await admin.from("sales_follow_up_steps").insert(rows);
  if (stepError) {
    await admin.from("sales_follow_up_plans").delete().eq("id", plan.id).eq("organization_id", params.organizationId);
    throw new Error("Failed to create follow-up steps.");
  }
  return { planId: plan.id, steps: rows.length };
}

export async function listDueFollowUpSteps(params: { organizationId: string; userRole: string }) {
  if (params.userRole === "viewer") return [];
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("sales_follow_up_steps")
    .select("id,plan_id,step_order,action_type,channel,due_at,status,draft_text,requires_human_approval,metadata,sales_follow_up_plans!inner(name,conversation_id,lead_id,status)")
    .eq("organization_id", params.organizationId)
    .eq("status", "pending_approval")
    .lte("due_at", new Date().toISOString())
    .order("due_at", { ascending: true }).limit(100);
  if (error) throw new Error("Failed to load due follow-up steps.");
  return data ?? [];
}

export async function approveFollowUpStep(params: {
  organizationId: string;
  userId: string;
  userRole: string;
  stepId: string;
  editedDraftText?: string;
}) {
  if (params.userRole === "viewer") throw new Error("Read-only users cannot approve follow-up steps.");
  const admin = createSupabaseAdminClient();
  const patch: Record<string, unknown> = {
    status: "approved",
    approved_by: params.userId,
    approved_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (typeof params.editedDraftText === "string") patch.draft_text = params.editedDraftText.trim().slice(0, 4096);
  const { data, error } = await admin.from("sales_follow_up_steps").update(patch)
    .eq("id", params.stepId).eq("organization_id", params.organizationId).eq("status", "pending_approval")
    .select("id,action_type,channel,draft_text").maybeSingle();
  if (error || !data) throw new Error("Follow-up step was not found or is no longer pending approval.");
  // Approval never sends a customer message. The user must explicitly execute the approved action in the Inbox.
  return { success: true, step: data, autoSent: false };
}

export async function completeFollowUpStep(params: { organizationId: string; userId: string; userRole: string; stepId: string }) {
  if (params.userRole === "viewer") throw new Error("Read-only users cannot complete follow-up steps.");
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("sales_follow_up_steps").update({ status: "completed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString(), metadata: { completed_by: params.userId } })
    .eq("id", params.stepId).eq("organization_id", params.organizationId).eq("status", "approved");
  if (error) throw new Error("Failed to complete follow-up step.");
  return { success: true };
}
