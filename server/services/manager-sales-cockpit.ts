import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { listMissedOpportunities } from "@/server/services/missed-opportunities";
import { getSalesForecast, getWinLossIntelligence, listFollowUpAutomationV2 } from "@/server/services/revenue-intelligence-v4";
import { getPipelineIntelligence } from "@/server/services/sales-intelligence-v3";

export async function getManagerSalesCockpit(input: {
  organizationId: string;
  userId: string;
  userRole: string;
}) {
  const scope = { organizationId: input.organizationId, userId: input.userId, userRole: input.userRole };
  const admin = createSupabaseAdminClient();
  const [pipeline, forecast, winLoss, followUps, missed, voiceResult, leadResult] = await Promise.all([
    getPipelineIntelligence(scope),
    getSalesForecast(scope),
    getWinLossIntelligence(scope),
    listFollowUpAutomationV2(scope),
    listMissedOpportunities({ ...scope, limit: 25 }),
    admin
      .from("voice_calls")
      .select("id,state,lead_score,temperature,human_handoff_requested,duration_seconds,started_at")
      .eq("organization_id", input.organizationId)
      .gte("started_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order("started_at", { ascending: false })
      .limit(500),
    admin
      .from("leads")
      .select("id,assigned_to,status,estimated_value,created_at")
      .eq("organization_id", input.organizationId)
      .limit(1500),
  ]);

  const calls = voiceResult.data || [];
  const leads = leadResult.data || [];
  const completedCalls = calls.filter((call) => call.state === "completed");
  const avgCallScoreRows = calls.filter((call) => typeof call.lead_score === "number");
  const averagePhoneLeadScore = avgCallScoreRows.length
    ? Math.round(avgCallScoreRows.reduce((sum, call) => sum + Number(call.lead_score || 0), 0) / avgCallScoreRows.length)
    : 0;
  const avgDuration = completedCalls.length
    ? Math.round(completedCalls.reduce((sum, call) => sum + Number(call.duration_seconds || 0), 0) / completedCalls.length)
    : 0;

  const repMap = new Map<string, { leadCount: number; openCount: number; wonCount: number; pipelineValue: number }>();
  for (const lead of leads) {
    const key = lead.assigned_to || "unassigned";
    const current = repMap.get(key) || { leadCount: 0, openCount: 0, wonCount: 0, pipelineValue: 0 };
    current.leadCount += 1;
    current.openCount += ["won", "lost"].includes(lead.status) ? 0 : 1;
    current.wonCount += lead.status === "won" ? 1 : 0;
    current.pipelineValue += ["won", "lost"].includes(lead.status) ? 0 : Number(lead.estimated_value || 0);
    repMap.set(key, current);
  }

  const memberIds = [...repMap.keys()].filter((id) => id !== "unassigned");
  const { data: profiles } = memberIds.length
    ? await admin.from("profiles").select("id,full_name").in("id", memberIds)
    : { data: [] as Array<{ id: string; full_name: string | null }> };
  const names = new Map((profiles || []).map((profile) => [profile.id, profile.full_name || "Satış temsilcisi"]));
  const reps = [...repMap.entries()].map(([id, metrics]) => ({ id, name: id === "unassigned" ? "Atanmamış" : names.get(id) || "Satış temsilcisi", ...metrics })).sort((a, b) => b.pipelineValue - a.pipelineValue);

  return {
    pipeline,
    forecast,
    winLoss,
    followUps: followUps.slice(0, 10),
    missed: missed.slice(0, 10),
    phone: {
      calls30d: calls.length,
      completedCalls: completedCalls.length,
      handoffs: calls.filter((call) => call.human_handoff_requested).length,
      hotCalls: calls.filter((call) => call.temperature === "hot").length,
      averageLeadScore: averagePhoneLeadScore,
      averageDurationSeconds: avgDuration,
    },
    reps,
  };
}
