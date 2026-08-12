import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { isSalesRepresentativeRole } from "@/lib/workspace-roles";

export type LeadScoreHistoryPoint = {
  id: string;
  score: number;
  delta: number | null;
  priority: string;
  salesStage: string;
  summary: string;
  nextBestAction: string;
  status: string;
  createdAt: string;
};

export type StaleOpportunity = {
  leadId: string;
  conversationId: string;
  name: string;
  score: number;
  priority: string;
  salesStage: string;
  lastActivityAt: string;
  followUpAt: string | null;
  inactiveHours: number;
  riskScore: number;
  reason: string;
  nextBestAction: string;
};

export type PipelineStageInsight = {
  stage: string;
  count: number;
  averageScore: number;
  highPriorityCount: number;
  staleCount: number;
  estimatedValue: number;
};

export type PipelineIntelligence = {
  totalOpen: number;
  weightedScore: number;
  staleCount: number;
  highPriorityCount: number;
  estimatedValue: number;
  stages: PipelineStageInsight[];
  topRisk: StaleOpportunity[];
};

const CLOSED_STAGES = new Set(["won", "lost", "support"]);
const STAGE_WEIGHT: Record<string, number> = {
  new_lead: 5,
  discovery: 8,
  qualified: 12,
  quote_ready: 18,
  quote_sent: 22,
  negotiation: 26,
};

function hoursSince(value: string, now = Date.now()) {
  return Math.max(0, Math.floor((now - new Date(value).getTime()) / 3_600_000));
}

function staleThresholdHours(stage: string) {
  if (["quote_sent", "negotiation"].includes(stage)) return 24;
  if (["qualified", "quote_ready"].includes(stage)) return 48;
  return 72;
}

export async function getLeadScoreHistory(organizationId: string, leadId: string): Promise<LeadScoreHistoryPoint[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("conversation_ai_qualifications")
    .select("id,score,priority,sales_stage,summary,next_best_action,status,created_at")
    .eq("organization_id", organizationId)
    .eq("lead_id", leadId)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) throw new Error("Lead skor geçmişi yüklenemedi.");

  let previous: number | null = null;
  return (data || []).map((row) => {
    const delta = previous === null ? null : row.score - previous;
    previous = row.score;
    return {
      id: row.id,
      score: row.score,
      delta,
      priority: row.priority || "medium",
      salesStage: row.sales_stage || "new_lead",
      summary: row.summary,
      nextBestAction: row.next_best_action,
      status: row.status,
      createdAt: row.created_at,
    };
  });
}

export async function listStaleOpportunities(params: {
  organizationId: string;
  userId: string;
  userRole: string;
  limit?: number;
}): Promise<StaleOpportunity[]> {
  const admin = createSupabaseAdminClient();
  const { data: qualifications, error } = await admin
    .from("conversation_ai_qualifications")
    .select("id,conversation_id,lead_id,score,priority,sales_stage,next_best_action,recommended_follow_up_at,created_at")
    .eq("organization_id", params.organizationId)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw new Error("Fırsat riskleri yüklenemedi.");

  const latest = new Map<string, (typeof qualifications)[number]>();
  for (const row of qualifications || []) {
    if (row.lead_id && !latest.has(row.lead_id)) latest.set(row.lead_id, row);
  }
  const rows = [...latest.values()].filter((row) => !CLOSED_STAGES.has(row.sales_stage || ""));
  if (!rows.length) return [];

  const leadIds = rows.map((row) => row.lead_id).filter((id): id is string => Boolean(id));
  const conversationIds = rows.map((row) => row.conversation_id);
  let leadQuery = admin.from("leads").select("id,full_name,assigned_to,next_follow_up_at,estimated_value").eq("organization_id", params.organizationId).in("id", leadIds);
  if (isSalesRepresentativeRole(params.userRole as "sales" | "sales_rep")) leadQuery = leadQuery.or(`assigned_to.eq.${params.userId},assigned_to.is.null`);
  const [{ data: leads }, { data: conversations }] = await Promise.all([
    leadQuery,
    admin.from("conversations").select("id,last_message_at,updated_at").eq("organization_id", params.organizationId).in("id", conversationIds),
  ]);
  const leadMap = new Map((leads || []).map((row) => [row.id, row]));
  const conversationMap = new Map((conversations || []).map((row) => [row.id, row]));
  const now = Date.now();

  return rows.flatMap((row) => {
    const lead = row.lead_id ? leadMap.get(row.lead_id) : null;
    if (!lead) return [];
    const conversation = conversationMap.get(row.conversation_id);
    const lastActivityAt = conversation?.last_message_at || conversation?.updated_at || row.created_at;
    const inactiveHours = hoursSince(lastActivityAt, now);
    const followUpAt = lead.next_follow_up_at || row.recommended_follow_up_at || null;
    const followUpOverdue = followUpAt ? new Date(followUpAt).getTime() < now : false;
    const threshold = staleThresholdHours(row.sales_stage || "new_lead");
    if (inactiveHours < threshold && !followUpOverdue) return [];

    const riskScore = Math.min(100,
      20
      + Math.min(35, Math.floor(inactiveHours / 12) * 4)
      + (followUpOverdue ? 25 : 0)
      + (row.priority === "high" ? 12 : row.priority === "medium" ? 6 : 0)
      + (STAGE_WEIGHT[row.sales_stage || "new_lead"] || 0),
    );
    const reason = followUpOverdue
      ? "Planlanan takip zamanı geçti ve fırsat hâlâ açık."
      : `${inactiveHours} saattir yeni müşteri aktivitesi yok.`;
    return [{
      leadId: lead.id,
      conversationId: row.conversation_id,
      name: lead.full_name,
      score: row.score,
      priority: row.priority || "medium",
      salesStage: row.sales_stage || "new_lead",
      lastActivityAt,
      followUpAt,
      inactiveHours,
      riskScore,
      reason,
      nextBestAction: row.next_best_action,
    } satisfies StaleOpportunity];
  }).sort((a, b) => b.riskScore - a.riskScore || b.score - a.score).slice(0, Math.max(1, Math.min(50, params.limit || 25)));
}

export async function getPipelineIntelligence(params: {
  organizationId: string;
  userId: string;
  userRole: string;
}): Promise<PipelineIntelligence> {
  const admin = createSupabaseAdminClient();
  const { data: qualifications, error } = await admin
    .from("conversation_ai_qualifications")
    .select("conversation_id,lead_id,score,priority,sales_stage,created_at")
    .eq("organization_id", params.organizationId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error("Pipeline zekâsı yüklenemedi.");

  const latest = new Map<string, (typeof qualifications)[number]>();
  for (const row of qualifications || []) if (row.lead_id && !latest.has(row.lead_id)) latest.set(row.lead_id, row);
  const openRows = [...latest.values()].filter((row) => !CLOSED_STAGES.has(row.sales_stage || ""));
  if (!openRows.length) return { totalOpen: 0, weightedScore: 0, staleCount: 0, highPriorityCount: 0, estimatedValue: 0, stages: [], topRisk: [] };

  const leadIds = openRows.map((row) => row.lead_id).filter((id): id is string => Boolean(id));
  let leadQuery = admin.from("leads").select("id,assigned_to,estimated_value").eq("organization_id", params.organizationId).in("id", leadIds);
  if (isSalesRepresentativeRole(params.userRole as "sales" | "sales_rep")) leadQuery = leadQuery.or(`assigned_to.eq.${params.userId},assigned_to.is.null`);
  const { data: leads } = await leadQuery;
  const leadMap = new Map((leads || []).map((row) => [row.id, row]));
  const scopedRows = openRows.filter((row) => row.lead_id && leadMap.has(row.lead_id));
  const risks = await listStaleOpportunities({ ...params, limit: 50 });
  const staleIds = new Set(risks.map((item) => item.leadId));
  const stageMap = new Map<string, { count: number; scoreTotal: number; high: number; stale: number; value: number }>();

  for (const row of scopedRows) {
    const stage = row.sales_stage || "new_lead";
    const current = stageMap.get(stage) || { count: 0, scoreTotal: 0, high: 0, stale: 0, value: 0 };
    const lead = row.lead_id ? leadMap.get(row.lead_id) : null;
    current.count += 1;
    current.scoreTotal += row.score || 0;
    current.high += row.priority === "high" ? 1 : 0;
    current.stale += row.lead_id && staleIds.has(row.lead_id) ? 1 : 0;
    current.value += Number(lead?.estimated_value || 0);
    stageMap.set(stage, current);
  }

  const stages = [...stageMap.entries()].map(([stage, value]) => ({
    stage,
    count: value.count,
    averageScore: value.count ? Math.round(value.scoreTotal / value.count) : 0,
    highPriorityCount: value.high,
    staleCount: value.stale,
    estimatedValue: value.value,
  })).sort((a, b) => (STAGE_WEIGHT[b.stage] || 0) - (STAGE_WEIGHT[a.stage] || 0));

  const scoreTotal = scopedRows.reduce((sum, row) => sum + (row.score || 0), 0);
  return {
    totalOpen: scopedRows.length,
    weightedScore: scopedRows.length ? Math.round(scoreTotal / scopedRows.length) : 0,
    staleCount: staleIds.size,
    highPriorityCount: scopedRows.filter((row) => row.priority === "high").length,
    estimatedValue: stages.reduce((sum, stage) => sum + stage.estimatedValue, 0),
    stages,
    topRisk: risks.slice(0, 5),
  };
}
