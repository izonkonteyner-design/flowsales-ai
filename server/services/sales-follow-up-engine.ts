import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";

export type FollowUpActionType = "reply_draft" | "call" | "task" | "reminder";

function addHours(base: Date, hours: number) { return new Date(base.getTime() + hours * 3_600_000).toISOString(); }

function buildActionSchedule(input: { score: number; temperature: string; nextBestAction: string; recommendedAt?: string | null }) {
  const now = new Date();
  const firstAt = input.recommendedAt || addHours(now, input.temperature === "hot" ? 2 : input.temperature === "warm" ? 24 : 72);
  const actions: Array<{ action_type: FollowUpActionType; scheduled_for: string; payload: Record<string, unknown> }> = [
    { action_type: "task", scheduled_for: firstAt, payload: { title: input.nextBestAction, source: "next_best_action" } },
  ];
  if (input.temperature === "hot" || input.score >= 70) {
    actions.push({ action_type: "reply_draft", scheduled_for: firstAt, payload: { instruction: "Draft a concise follow-up using current CRM and conversation facts only. Human review required before sending." } });
    actions.push({ action_type: "call", scheduled_for: addHours(new Date(firstAt), 24), payload: { title: "Call qualified lead if no response", source: "ai_qualification" } });
  } else if (input.temperature === "warm" || input.score >= 40) {
    actions.push({ action_type: "reminder", scheduled_for: addHours(new Date(firstAt), 48), payload: { title: "Review conversation and decide whether another follow-up is appropriate." } });
  }
  return actions;
}

export async function createFollowUpPlanFromQualification(params: {
  organizationId: string; userId: string; userRole: string; conversationId: string; qualificationId: string;
}) {
  if (params.userRole === "viewer") throw new Error("Read-only access.");
  const admin = createSupabaseAdminClient();
  const { data: qualification } = await admin.from("conversation_ai_qualifications")
    .select("id,conversation_id,lead_id,score,temperature,next_best_action,recommended_follow_up_at,status")
    .eq("id", params.qualificationId).eq("conversation_id", params.conversationId).eq("organization_id", params.organizationId).maybeSingle();
  if (!qualification) throw new Error("Qualification not found.");
  if (qualification.status !== "accepted") throw new Error("Qualification must be accepted by a human before a follow-up plan is created.");

  const { data: existing } = await admin.from("sales_follow_up_plans").select("id,status")
    .eq("organization_id", params.organizationId).eq("conversation_id", params.conversationId).eq("qualification_id", qualification.id)
    .in("status", ["active", "paused"]).maybeSingle();
  if (existing) return { planId: existing.id, duplicate: true };

  const strategy = qualification.temperature === "hot" ? "high_intent_fast_follow_up" : qualification.temperature === "warm" ? "value_led_follow_up" : "light_nurture";
  const schedule = buildActionSchedule({ score: qualification.score, temperature: qualification.temperature, nextBestAction: qualification.next_best_action, recommendedAt: qualification.recommended_follow_up_at });
  const nextActionAt = schedule.map((item) => item.scheduled_for).sort()[0] || null;
  const { data: plan, error: planError } = await admin.from("sales_follow_up_plans").insert({
    organization_id: params.organizationId, conversation_id: params.conversationId, lead_id: qualification.lead_id,
    qualification_id: qualification.id, status: "active", strategy, requires_human_approval: true,
    next_action_at: nextActionAt, created_by: params.userId,
  }).select("id").single();
  if (planError || !plan) throw new Error("Failed to create follow-up plan.");

  const { error: actionsError } = await admin.from("sales_follow_up_actions").insert(schedule.map((item) => ({
    organization_id: params.organizationId, plan_id: plan.id, conversation_id: params.conversationId,
    action_type: item.action_type, status: "approval_required", scheduled_for: item.scheduled_for, payload: item.payload,
  })));
  if (actionsError) throw new Error("Failed to create follow-up actions.");
  await admin.from("omnichannel_audit_events").insert({
    organization_id: params.organizationId, conversation_id: params.conversationId, actor_user_id: params.userId,
    event_type: "follow_up_plan_created", metadata: { plan_id: plan.id, qualification_id: qualification.id, action_count: schedule.length, strategy },
  });
  return { planId: plan.id, duplicate: false, actionCount: schedule.length };
}

export async function getFollowUpPlan(organizationId: string, conversationId: string) {
  const admin = createSupabaseAdminClient();
  const { data: plan } = await admin.from("sales_follow_up_plans").select("id,status,strategy,next_action_at,created_at")
    .eq("organization_id", organizationId).eq("conversation_id", conversationId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!plan) return null;
  const { data: actions } = await admin.from("sales_follow_up_actions")
    .select("id,action_type,status,scheduled_for,payload,approved_at,completed_at")
    .eq("organization_id", organizationId).eq("plan_id", plan.id).order("scheduled_for");
  return { ...plan, actions: actions || [] };
}

export async function updateFollowUpAction(params: {
  organizationId: string; userId: string; userRole: string; conversationId: string; actionId: string; decision: "approved" | "completed" | "cancelled";
}) {
  if (params.userRole === "viewer") throw new Error("Read-only access.");
  const admin = createSupabaseAdminClient();
  const { data: action } = await admin.from("sales_follow_up_actions")
    .select("id,plan_id,status,action_type").eq("id", params.actionId).eq("organization_id", params.organizationId).eq("conversation_id", params.conversationId).maybeSingle();
  if (!action) throw new Error("Follow-up action not found.");
  if (params.decision === "completed" && action.status !== "approved") throw new Error("Action must be explicitly approved before completion.");
  const patch = params.decision === "approved"
    ? { status: "approved", approved_by: params.userId, approved_at: new Date().toISOString() }
    : params.decision === "completed"
      ? { status: "completed", completed_by: params.userId, completed_at: new Date().toISOString() }
      : { status: "cancelled" };
  const { data, error } = await admin.from("sales_follow_up_actions").update(patch)
    .eq("id", params.actionId).eq("organization_id", params.organizationId).select("id,status,action_type").maybeSingle();
  if (error || !data) throw new Error("Follow-up action update failed.");

  await admin.from("omnichannel_audit_events").insert({ organization_id: params.organizationId, conversation_id: params.conversationId, actor_user_id: params.userId, event_type: `follow_up_action_${params.decision}`, metadata: { action_id: params.actionId, action_type: action.action_type } });

  const { data: remaining } = await admin.from("sales_follow_up_actions").select("id,scheduled_for,status").eq("organization_id", params.organizationId).eq("plan_id", action.plan_id).in("status", ["approval_required", "approved"]);
  const next = (remaining || []).map((item) => item.scheduled_for).sort()[0] || null;
  await admin.from("sales_follow_up_plans").update({ status: next ? "active" : "completed", next_action_at: next, updated_at: new Date().toISOString() })
    .eq("id", action.plan_id).eq("organization_id", params.organizationId);
  return data;
}

/**
 * Cron-safe due action discovery. It never sends customer messages.
 * A scheduler may use this to surface due approval-required actions to humans.
 */
export async function listDueFollowUpActions(organizationId: string, limit = 50) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("sales_follow_up_actions")
    .select("id,plan_id,conversation_id,action_type,status,scheduled_for,payload")
    .eq("organization_id", organizationId).eq("status", "approval_required").lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for").limit(Math.min(100, Math.max(1, limit)));
  if (error) throw new Error("Failed to load due follow-up actions.");
  return data || [];
}
