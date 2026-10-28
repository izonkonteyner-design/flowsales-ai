import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateAdOptimizationRecommendations } from "../ad-attribution/service";
import { scanQuotesForFollowUp } from "../quote-copilot/service";
import {
  type ActionPriority,
  type ActionProposalStatus,
  type ActionSourceModule,
  type ActionTargetEntityType,
  type ActionType,
  type AiActionProposalRecord,
  type CreateActionProposalInput,
  createActionProposalInputSchema,
} from "./domain";

/**
 * Generates a deterministic hash to prevent duplicate AI action proposals.
 */
export function computeActionHash(
  organizationId: string,
  actionType: string,
  targetEntityType: string,
  targetEntityId: string,
  payloadSummary: string
): string {
  const content = `${organizationId}:${actionType}:${targetEntityType}:${targetEntityId}:${payloadSummary}`;
  return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * Creates an explainable AI action proposal with strict deduplication.
 */
export async function proposeAiAction(
  supabase: SupabaseClient,
  input: CreateActionProposalInput
): Promise<AiActionProposalRecord> {
  const validated = createActionProposalInputSchema.parse(input);
  const payloadSummary = JSON.stringify(validated.actionPayload);
  const actionHash = computeActionHash(
    validated.organizationId,
    validated.actionType,
    validated.targetEntityType,
    validated.targetEntityId,
    payloadSummary
  );

  // Check if an identical active proposal already exists
  const { data: existing } = await supabase
    .from("ai_action_proposals")
    .select("*")
    .eq("organization_id", validated.organizationId)
    .eq("action_hash", actionHash)
    .in("status", ["pending_review", "approved", "draft"])
    .maybeSingle();

  if (existing) {
    return mapDbRecordToProposal(existing);
  }

  const { data, error } = await supabase
    .from("ai_action_proposals")
    .insert({
      organization_id: validated.organizationId,
      source_module: validated.sourceModule,
      action_type: validated.actionType,
      title: validated.title,
      description: validated.description,
      target_entity_type: validated.targetEntityType,
      target_entity_id: validated.targetEntityId,
      target_entity_title: validated.targetEntityTitle ?? null,
      evidence: validated.evidence,
      reasons: validated.reasons,
      priority: validated.priority,
      status: "pending_review",
      action_payload: validated.actionPayload,
      action_hash: actionHash,
      required_role: validated.requiredRole,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create AI action proposal: ${error?.message || "Unknown error"}`);
  }

  return mapDbRecordToProposal(data);
}

/**
 * Lists AI action proposals with optional filtering.
 */
export async function listAiActionProposals(
  supabase: SupabaseClient,
  organizationId: string,
  options?: {
    status?: ActionProposalStatus;
    priority?: ActionPriority;
    limit?: number;
  }
): Promise<AiActionProposalRecord[]> {
  let query = supabase
    .from("ai_action_proposals")
    .select("*")
    .eq("organization_id", organizationId);

  if (options?.status) {
    query = query.eq("status", options.status);
  }
  if (options?.priority) {
    query = query.eq("priority", options.priority);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(options?.limit || 50);

  if (error || !data) {
    return [];
  }

  return data.map(mapDbRecordToProposal);
}

/**
 * Handles human approval, rejection, or dismissal of an AI action proposal.
 */
export async function decideAiActionProposal(
  supabase: SupabaseClient,
  params: {
    proposalId: string;
    organizationId: string;
    decision: "approved" | "rejected" | "dismissed";
    userId?: string;
    decisionNote?: string;
  }
): Promise<AiActionProposalRecord> {
  const nextStatus = params.decision === "approved" ? "approved" : params.decision;

  const { data, error } = await supabase
    .from("ai_action_proposals")
    .update({
      status: nextStatus,
      decided_by: params.userId ?? null,
      decided_at: new Date().toISOString(),
      decision_note: params.decisionNote ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.proposalId)
    .eq("organization_id", params.organizationId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to update proposal decision: ${error?.message || "Proposal not found"}`);
  }

  return mapDbRecordToProposal(data);
}

/**
 * Automatically gathers actionable proposals across Revenue Autopilot, Quote Copilot, and Ad Attribution.
 */
export async function aggregateProposalsFromAllModules(
  supabase: SupabaseClient,
  organizationId: string
): Promise<{ createdCount: number; proposals: AiActionProposalRecord[] }> {
  const created: AiActionProposalRecord[] = [];

  // 1. Gather dormant quote follow-ups from Quote Copilot
  try {
    const dormantQuotes = await scanQuotesForFollowUp(supabase, organizationId, 48);
    for (const q of dormantQuotes) {
      const proposal = await proposeAiAction(supabase, {
        organizationId,
        sourceModule: "quote_copilot",
        actionType: "send_follow_up",
        title: `Teklif Takip Önerisi (${q.quoteNumber})`,
        description: `Teklif ${q.daysSinceLastActivity} gündür yanıtsız. Müşteriye WhatsApp üzerinden nezaket takibi öneriliyor.`,
        targetEntityType: "quote",
        targetEntityId: q.quoteId,
        targetEntityTitle: q.quoteNumber,
        evidence: [
          `Son hareket: ${q.daysSinceLastActivity} gün önce`,
          `Mevcut durum: ${q.status}`,
          `Kanal: ${q.channel}`,
        ],
        reasons: [
          "Zamanında yapılan teklif takipleri kapanış oranını %35 artırır.",
          "Müşteri teknik detaylar veya teslim süresi konusunda netleşme bekliyor olabilir.",
        ],
        priority: q.urgency,
        actionPayload: {
          channel: q.channel,
          messageDraft: q.suggestedFollowUpMessage,
        },
        requiredRole: "sales",
      });
      created.push(proposal);
    }
  } catch {
    // Graceful degradation if quotes module has no candidates
  }

  // 2. Gather ad optimization recommendations
  try {
    const adRecs = await generateAdOptimizationRecommendations(supabase, organizationId);
    for (const rec of adRecs) {
      const proposal = await proposeAiAction(supabase, {
        organizationId,
        sourceModule: "ad_intelligence",
        actionType: "ad_optimization",
        title: `Reklam & Gelir Optimizasyonu (${rec.campaignName})`,
        description: rec.suggestion || rec.recommendedAction,
        targetEntityType: "campaign",
        targetEntityId: rec.campaignId || rec.platform,
        targetEntityTitle: rec.campaignName,
        evidence: rec.dataEvidence || [rec.evidence],
        reasons: [
          `Eylem Türü: ${rec.actionType || rec.recommendedAction}`,
          "Pazarlama bütçesi ile CRM ciro dönüşümü arasındaki korelasyona dayanmaktadır.",
        ],
        priority: rec.priority,
        actionPayload: {
          campaignId: rec.campaignId || rec.platform,
          suggestedAction: rec.actionType || rec.recommendedAction,
        },
        requiredRole: "admin",
      });
      created.push(proposal);
    }
  } catch {
    // Graceful degradation
  }

  return {
    createdCount: created.length,
    proposals: created,
  };
}

function mapDbRecordToProposal(data: Record<string, unknown>): AiActionProposalRecord {
  const d = data;
  return {
    id: String(d.id),
    organizationId: String(d.organization_id),
    sourceModule: d.source_module as ActionSourceModule,
    actionType: d.action_type as ActionType,
    title: String(d.title),
    description: String(d.description),
    targetEntityType: d.target_entity_type as ActionTargetEntityType,
    targetEntityId: String(d.target_entity_id),
    targetEntityTitle: d.target_entity_title ? String(d.target_entity_title) : null,
    evidence: Array.isArray(d.evidence) ? (d.evidence as string[]) : [],
    reasons: Array.isArray(d.reasons) ? (d.reasons as string[]) : [],
    priority: d.priority as ActionPriority,
    status: d.status as ActionProposalStatus,
    actionPayload: (d.action_payload && typeof d.action_payload === "object") ? (d.action_payload as Record<string, unknown>) : {},
    actionHash: String(d.action_hash),
    approvalRequestId: d.approval_request_id ? String(d.approval_request_id) : null,
    requiredRole: String(d.required_role),
    decidedBy: d.decided_by ? String(d.decided_by) : null,
    decidedAt: d.decided_at ? String(d.decided_at) : null,
    decisionNote: d.decision_note ? String(d.decision_note) : null,
    executedAt: d.executed_at ? String(d.executed_at) : null,
    executionResult: (d.execution_result && typeof d.execution_result === "object") ? (d.execution_result as Record<string, unknown>) : null,
    createdAt: String(d.created_at),
    updatedAt: String(d.updated_at),
  };
}
