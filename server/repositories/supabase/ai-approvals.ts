import type { SupabaseClient } from "@supabase/supabase-js";

import {
  aiApprovalRequestSchema,
  type AiApprovalRequest,
} from "@/server/services/ai-approvals/domain";
import type {
  AiApprovalAuditSink,
  AiApprovalAuthorization,
  AiApprovalRepository,
} from "@/server/services/ai-approvals/service";

const APPROVAL_COLUMNS = [
  "id",
  "organization_id",
  "run_id",
  "requested_by",
  "lead_id",
  "capability",
  "status",
  "summary",
  "actions",
  "evidence",
  "money",
  "reasons",
  "provider",
  "model",
  "created_at",
  "expires_at",
  "decided_at",
  "decided_by",
  "decision_reason",
  "version",
].join(",");

type ApprovalRow = {
  id: string;
  organization_id: string;
  run_id: string;
  requested_by: string;
  lead_id: string | null;
  capability: string;
  status: string;
  summary: string;
  actions: unknown;
  evidence: unknown;
  money: unknown;
  reasons: unknown;
  provider: string;
  model: string;
  created_at: string;
  expires_at: string | null;
  decided_at: string | null;
  decided_by: string | null;
  decision_reason: string | null;
  version: number;
};

function mapApprovalRow(row: ApprovalRow): AiApprovalRequest {
  return aiApprovalRequestSchema.parse({
    id: row.id,
    workspaceId: row.organization_id,
    runId: row.run_id,
    actorId: row.requested_by,
    leadId: row.lead_id,
    capability: row.capability,
    status: row.status,
    summary: row.summary,
    actions: row.actions,
    evidence: row.evidence,
    money: row.money,
    reasons: row.reasons,
    provider: row.provider,
    model: row.model,
    createdAt: row.created_at,
    expiresAt: row.expires_at ?? undefined,
    decidedAt: row.decided_at ?? undefined,
    decidedBy: row.decided_by ?? undefined,
    decisionNote: row.decision_reason ?? undefined,
    version: row.version,
  });
}

function throwDatabaseError(operation: string, error: { message: string; code?: string } | null): never {
  throw new Error(`${operation} failed${error?.code ? ` (${error.code})` : ""}: ${error?.message ?? "Unknown database error"}`);
}

export class SupabaseAiApprovalRepository implements AiApprovalRepository {
  constructor(private readonly client: SupabaseClient) {}

  async create(approval: AiApprovalRequest): Promise<AiApprovalRequest> {
    const { data, error } = await this.client.rpc("create_ai_approval", {
      p_run_id: approval.runId,
      p_lead_id: approval.leadId,
      p_capability: approval.capability,
      p_summary: approval.summary,
      p_actions: approval.actions,
      p_evidence: approval.evidence,
      p_money: approval.money,
      p_reasons: approval.reasons,
      p_provider: approval.provider,
      p_model: approval.model,
      p_risk_level: "medium",
      p_expires_at: approval.expiresAt ?? null,
    });
    if (error) throwDatabaseError("Create AI approval", error);
    return mapApprovalRow(data as ApprovalRow);
  }

  async findById(workspaceId: string, approvalId: string): Promise<AiApprovalRequest | null> {
    const { data, error } = await this.client
      .from("ai_approval_requests")
      .select(APPROVAL_COLUMNS)
      .eq("organization_id", workspaceId)
      .eq("id", approvalId)
      .maybeSingle();
    if (error) throwDatabaseError("Find AI approval", error);
    return data ? mapApprovalRow(data as ApprovalRow) : null;
  }

  async listPending(workspaceId: string, limit: number): Promise<AiApprovalRequest[]> {
    const { data, error } = await this.client
      .from("ai_approval_requests")
      .select(APPROVAL_COLUMNS)
      .eq("organization_id", workspaceId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throwDatabaseError("List AI approvals", error);
    return (data as ApprovalRow[]).map(mapApprovalRow);
  }

  async transition(input: Parameters<AiApprovalRepository["transition"]>[0]): Promise<AiApprovalRequest | null> {
    if (input.toStatus === "approved" || input.toStatus === "rejected") {
      const { data, error } = await this.client.rpc("decide_ai_approval", {
        p_approval_id: input.approvalId,
        p_expected_version: input.expectedVersion,
        p_decision: input.toStatus,
        p_reason: input.note ?? null,
      });
      if (error) {
        if (/version conflict|not pending/i.test(error.message)) return null;
        throwDatabaseError("Decide AI approval", error);
      }
      return mapApprovalRow(data as ApprovalRow);
    }

    const { data, error } = await this.client
      .from("ai_approval_requests")
      .update({
        status: input.toStatus,
        decided_by: input.actorId ?? null,
        decision_reason: input.note ?? null,
        decided_at: input.decidedAt,
        version: input.expectedVersion + 1,
      })
      .eq("organization_id", input.workspaceId)
      .eq("id", input.approvalId)
      .eq("status", input.fromStatus)
      .eq("version", input.expectedVersion)
      .select(APPROVAL_COLUMNS)
      .maybeSingle();
    if (error) throwDatabaseError("Transition AI approval", error);
    return data ? mapApprovalRow(data as ApprovalRow) : null;
  }
}

export class SupabaseAiApprovalAuthorization implements AiApprovalAuthorization {
  constructor(private readonly client: SupabaseClient) {}

  async canReview(workspaceId: string, actorId: string): Promise<boolean> {
    const { data: userData, error: userError } = await this.client.auth.getUser();
    if (userError || userData.user?.id !== actorId) return false;
    const { data, error } = await this.client.rpc("can_review_ai_approvals", {
      p_organization_id: workspaceId,
    });
    if (error) throwDatabaseError("Check approval authorization", error);
    return data === true;
  }

  async isDemoWorkspace(workspaceId: string): Promise<boolean> {
    const { data, error } = await this.client.rpc("is_demo_organization", {
      p_organization_id: workspaceId,
    });
    if (error) throwDatabaseError("Check demo workspace", error);
    return data === true;
  }
}

export class SupabaseAiApprovalAuditSink implements AiApprovalAuditSink {
  constructor(private readonly client: SupabaseClient) {}

  async write(event: Parameters<AiApprovalAuditSink["write"]>[0]): Promise<void> {
    const eventType = event.event === "queued" ? "created" : event.event;
    const { error } = await this.client.from("ai_approval_events").insert({
      organization_id: event.workspaceId,
      approval_id: event.approvalId,
      actor_id: event.actorId,
      event_type: eventType,
      metadata: event.note ? { note: event.note } : {},
      created_at: event.occurredAt,
    });
    if (error) throwDatabaseError("Write approval audit event", error);
  }
}
