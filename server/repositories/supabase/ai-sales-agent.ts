import type { SupabaseClient } from "@supabase/supabase-js";

import type { AiApprovalQueue, AiAuditEvent, AiAuditSink } from "@/server/services/ai-sales-agent/orchestrator";
import type { AiContextRepository } from "@/server/services/ai-sales-agent/context";
import { queueAiApproval } from "@/server/services/ai-approvals/service";
import {
  SupabaseAiApprovalAuthorization,
  SupabaseAiApprovalRepository,
} from "./ai-approvals";

function databaseError(operation: string, error: { message: string; code?: string } | null): never {
  throw new Error(`${operation} failed${error?.code ? ` (${error.code})` : ""}: ${error?.message ?? "Unknown database error"}`);
}

export class SupabaseAiContextRepository implements AiContextRepository {
  constructor(private readonly client: SupabaseClient) {}

  async actorCanAccessWorkspace(input: { workspaceId: string; actorId: string }): Promise<boolean> {
    const { data: userData } = await this.client.auth.getUser();
    if (userData.user?.id !== input.actorId) return false;
    const { data, error } = await this.client
      .from("organization_members")
      .select("organization_id")
      .eq("organization_id", input.workspaceId)
      .eq("user_id", input.actorId)
      .maybeSingle();
    if (error) databaseError("Check workspace access", error);
    return Boolean(data);
  }

  async isDemoWorkspace(workspaceId: string): Promise<boolean> {
    const { data, error } = await this.client.rpc("is_demo_organization", { p_organization_id: workspaceId });
    if (error) databaseError("Check demo workspace", error);
    return data === true;
  }

  async getLead(input: { workspaceId: string; leadId: string }) {
    const { data, error } = await this.client
      .from("leads")
      .select("id, full_name, status, source, assigned_to, estimated_value, currency, created_at, updated_at")
      .eq("organization_id", input.workspaceId)
      .eq("id", input.leadId)
      .maybeSingle();
    if (error) databaseError("Load lead AI context", error);
    if (!data) return null;
    return {
      id: data.id as string,
      name: data.full_name as string,
      status: data.status as string,
      source: (data.source as string | null) ?? null,
      assignedTo: (data.assigned_to as string | null) ?? null,
      estimatedValue: data.estimated_value === null ? null : Number(data.estimated_value),
      currency: (data.currency as string | null) ?? null,
      createdAt: data.created_at as string,
      updatedAt: data.updated_at as string,
    };
  }

  async listLeadActivities() {
    // Activity schemas differ across legacy workspaces. Timeline integration reads from ai_runs;
    // CRM activity normalization will be added without weakening workspace isolation.
    return [];
  }

  async listActiveProducts(input: { workspaceId: string; limit: number }) {
    const { data, error } = await this.client
      .from("products")
      .select("id, name, active, unit_price, currency")
      .eq("organization_id", input.workspaceId)
      .eq("active", true)
      .limit(input.limit);
    if (error) databaseError("Load product AI context", error);
    return (data ?? []).map((row) => ({
      id: row.id as string,
      name: row.name as string,
      active: row.active === true,
      price: row.unit_price === null ? null : Number(row.unit_price),
      currency: (row.currency as string | null) ?? null,
    }));
  }

  async listWorkspaceRules() {
    return [
      "Never invent prices, discounts, taxes, delivery dates, product features, or customer commitments.",
      "Every monetary recommendation must reference an active catalog record.",
      "Sending messages, creating quotes, or updating CRM records requires human approval.",
    ];
  }
}

export class SupabaseAiAuditSink implements AiAuditSink {
  constructor(private readonly client: SupabaseClient) {}

  async write(event: AiAuditEvent): Promise<void> {
    if (event.status === "started") {
      const { error } = await this.client.from("ai_runs").insert({
        id: event.runId,
        organization_id: event.workspaceId,
        actor_id: event.actorId,
        lead_id: event.leadId,
        capability: event.capability,
        status: "started",
        created_at: event.occurredAt,
      });
      if (error) databaseError("Start AI run audit", error);
      return;
    }

    const payload = event.status === "completed"
      ? {
          status: "completed",
          provider: event.provider ?? null,
          model: event.model ?? null,
          decision: event.decision ?? null,
          approval_required: event.approvalRequired ?? false,
          output: event.output ?? null,
          input_tokens: event.inputTokens ?? 0,
          output_tokens: event.outputTokens ?? 0,
          completed_at: event.occurredAt,
        }
      : {
          status: "failed",
          error_code: event.errorCode ?? "UnknownError",
          completed_at: event.occurredAt,
        };

    const { error } = await this.client
      .from("ai_runs")
      .update(payload)
      .eq("organization_id", event.workspaceId)
      .eq("id", event.runId);
    if (error) databaseError("Complete AI run audit", error);
  }
}

export class SupabaseAiApprovalQueue implements AiApprovalQueue {
  constructor(private readonly client: SupabaseClient) {}

  async queue(input: Parameters<AiApprovalQueue["queue"]>[0]) {
    return queueAiApproval({
      repository: new SupabaseAiApprovalRepository(this.client),
      authorization: new SupabaseAiApprovalAuthorization(this.client),
      // create_ai_approval writes its own event atomically.
      auditSink: { write: async () => undefined },
    }, input);
  }
}
