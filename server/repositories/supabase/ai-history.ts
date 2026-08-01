import type { SupabaseClient } from "@supabase/supabase-js";

export type AiHistoryRun = {
  id: string;
  workspaceId: string;
  leadId: string | null;
  actorId: string;
  capability: string;
  status: "started" | "completed" | "failed";
  provider: string | null;
  model: string | null;
  decision: "informational" | "approval_required" | "blocked" | null;
  approvalRequired: boolean;
  output: unknown;
  errorCode: string | null;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  createdAt: string;
  completedAt: string | null;
};

export type AiTimelineEvent = {
  id: string;
  kind: "ai_run" | "approval_event";
  occurredAt: string;
  title: string;
  description: string;
  status: string;
  capability?: string;
  leadId?: string | null;
  runId?: string;
  approvalId?: string;
};

export type AiHistoryFilter = {
  workspaceId: string;
  capability?: string;
  status?: string;
  leadId?: string;
  limit?: number;
};

type RunRow = {
  id: string;
  organization_id: string;
  actor_id: string;
  lead_id: string | null;
  capability: string;
  status: "started" | "completed" | "failed";
  provider: string | null;
  model: string | null;
  decision: "informational" | "approval_required" | "blocked" | null;
  approval_required: boolean;
  output: unknown;
  error_code: string | null;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number | string;
  created_at: string;
  completed_at: string | null;
};

type ApprovalEventRow = {
  id: string;
  approval_id: string;
  event_type: string;
  metadata: unknown;
  created_at: string;
  ai_approval_requests: {
    run_id: string;
    lead_id: string | null;
    capability: string;
    summary: string;
  } | null;
};

function databaseError(operation: string, error: { message: string; code?: string } | null): never {
  throw new Error(`${operation} failed${error?.code ? ` (${error.code})` : ""}: ${error?.message ?? "Unknown database error"}`);
}

function mapRun(row: RunRow): AiHistoryRun {
  return {
    id: row.id,
    workspaceId: row.organization_id,
    leadId: row.lead_id,
    actorId: row.actor_id,
    capability: row.capability,
    status: row.status,
    provider: row.provider,
    model: row.model,
    decision: row.decision,
    approvalRequired: row.approval_required,
    output: row.output,
    errorCode: row.error_code,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    estimatedCostUsd: Number(row.estimated_cost_usd),
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

export class SupabaseAiHistoryRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listRuns(filter: AiHistoryFilter): Promise<AiHistoryRun[]> {
    let query = this.client
      .from("ai_runs")
      .select("id,organization_id,actor_id,lead_id,capability,status,provider,model,decision,approval_required,output,error_code,input_tokens,output_tokens,estimated_cost_usd,created_at,completed_at")
      .eq("organization_id", filter.workspaceId)
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(filter.limit ?? 50, 1), 100));

    if (filter.capability) query = query.eq("capability", filter.capability);
    if (filter.status) query = query.eq("status", filter.status);
    if (filter.leadId) query = query.eq("lead_id", filter.leadId);

    const { data, error } = await query;
    if (error) databaseError("List AI history", error);
    return (data as RunRow[]).map(mapRun);
  }

  async listTimeline(filter: AiHistoryFilter): Promise<AiTimelineEvent[]> {
    const runs = await this.listRuns(filter);
    const { data: approvalEvents, error } = await this.client
      .from("ai_approval_events")
      .select("id,approval_id,event_type,metadata,created_at,ai_approval_requests!inner(run_id,lead_id,capability,summary)")
      .eq("organization_id", filter.workspaceId)
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(filter.limit ?? 50, 1), 100));

    if (error) databaseError("List approval timeline", error);

    const timeline: AiTimelineEvent[] = runs.map((run) => ({
      id: `run-${run.id}`,
      kind: "ai_run",
      occurredAt: run.completedAt ?? run.createdAt,
      title: `${run.capability.replaceAll("_", " ")} · ${run.status}`,
      description: run.errorCode
        ? `AI run failed with ${run.errorCode}.`
        : run.decision
          ? `Decision: ${run.decision}.`
          : "AI run started.",
      status: run.status,
      capability: run.capability,
      leadId: run.leadId,
      runId: run.id,
    }));

    for (const row of approvalEvents as ApprovalEventRow[]) {
      const approval = row.ai_approval_requests;
      if (!approval) continue;
      if (filter.leadId && approval.lead_id !== filter.leadId) continue;
      if (filter.capability && approval.capability !== filter.capability) continue;
      timeline.push({
        id: `approval-${row.id}`,
        kind: "approval_event",
        occurredAt: row.created_at,
        title: `Approval ${row.event_type.replaceAll("_", " ")}`,
        description: approval.summary,
        status: row.event_type,
        capability: approval.capability,
        leadId: approval.lead_id,
        runId: approval.run_id,
        approvalId: row.approval_id,
      });
    }

    return timeline
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      .slice(0, Math.min(Math.max(filter.limit ?? 50, 1), 100));
  }
}
