import "server-only";

import crypto from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";

const scoreFactorSchema = z.enum([
  "product_interest",
  "pricing_intent",
  "availability_intent",
  "location_known",
  "budget_known",
  "timeline_known",
  "use_case_known",
  "repeat_engagement",
  "quote_requested",
  "purchase_commitment",
  "explicit_objection",
  "low_intent",
]);

type ScoreFactor = z.infer<typeof scoreFactorSchema>;

const SCORE_WEIGHTS: Record<ScoreFactor, number> = {
  product_interest: 15,
  pricing_intent: 10,
  availability_intent: 10,
  location_known: 10,
  budget_known: 15,
  timeline_known: 15,
  use_case_known: 5,
  repeat_engagement: 10,
  quote_requested: 20,
  purchase_commitment: 30,
  explicit_objection: -10,
  low_intent: -20,
};

const scoreEvidenceSchema = z.object({
  factor: scoreFactorSchema,
  evidence: z.string().trim().min(1).max(240),
});

const scoreBreakdownSchema = z.object({
  factor: scoreFactorSchema,
  points: z.number().int(),
  evidence: z.string().trim().min(1).max(240),
});

const outputSchema = z.object({
  intent: z.enum(["buying", "pricing", "availability", "support", "research", "other"]),
  temperature: z.enum(["hot", "warm", "cold"]),
  salesStage: z.enum(["new_lead", "discovery", "qualified", "quote_ready", "quote_sent", "negotiation", "won", "lost", "support"]),
  priority: z.enum(["high", "medium", "low"]),
  confidence: z.number().min(0).max(1),
  summary: z.string().trim().min(1).max(700),
  signals: z.object({
    productInterest: z.string().trim().max(160).nullable(),
    location: z.string().trim().max(160).nullable(),
    budget: z.string().trim().max(160).nullable(),
    timeline: z.string().trim().max(160).nullable(),
    useCase: z.string().trim().max(200).nullable(),
    buyingSignals: z.array(z.string().trim().min(1).max(180)).max(8),
    objections: z.array(z.string().trim().min(1).max(180)).max(8),
  }),
  missingInformation: z.array(z.string().trim().min(1).max(160)).max(8),
  scoreEvidence: z.array(scoreEvidenceSchema).max(12),
  nextBestAction: z.string().trim().min(1).max(500),
  nextBestActionType: z.enum(["ask_question", "share_information", "create_quote", "follow_up", "call", "no_action"]),
  nextBestActionRationale: z.string().trim().min(1).max(500),
  followUpHours: z.number().int().min(1).max(720).nullable(),
});

export type ConversationQualification = Omit<z.infer<typeof outputSchema>, "scoreEvidence"> & {
  id: string;
  score: number;
  scoreBreakdown: Array<z.infer<typeof scoreBreakdownSchema>>;
  createdAt: string;
  status: "suggested" | "accepted" | "dismissed";
};

type StoredQualification = {
  id: string;
  score: number;
  intent: ConversationQualification["intent"];
  temperature: ConversationQualification["temperature"];
  sales_stage?: ConversationQualification["salesStage"] | null;
  priority?: ConversationQualification["priority"] | null;
  confidence?: number | string | null;
  summary: string;
  signals?: ConversationQualification["signals"] | null;
  missing_information?: ConversationQualification["missingInformation"] | null;
  score_breakdown?: ConversationQualification["scoreBreakdown"] | null;
  next_best_action: string;
  next_best_action_type?: ConversationQualification["nextBestActionType"] | null;
  next_best_action_rationale?: string | null;
  recommended_follow_up_at?: string | null;
  status: ConversationQualification["status"];
  created_at: string;
};

function safeMessages(rows: Array<{ direction?: string; body?: string | null; created_at?: string }>) {
  return rows.slice(-40).map((row) => ({
    direction: row.direction === "outbound" ? "agent" : "customer",
    text: (row.body || "[non-text message]").slice(0, 1600),
    at: row.created_at,
  }));
}

function calculateScoreBreakdown(evidence: Array<z.infer<typeof scoreEvidenceSchema>>) {
  const seen = new Set<ScoreFactor>();
  const breakdown: Array<z.infer<typeof scoreBreakdownSchema>> = [];
  for (const item of evidence) {
    if (seen.has(item.factor)) continue;
    seen.add(item.factor);
    breakdown.push(scoreBreakdownSchema.parse({ factor: item.factor, points: SCORE_WEIGHTS[item.factor], evidence: item.evidence }));
  }
  return breakdown;
}

function calculateScore(breakdown: Array<{ points: number }>) {
  return Math.max(0, Math.min(100, breakdown.reduce((total, item) => total + item.points, 0)));
}

function mapStoredQualification(row: StoredQualification): ConversationQualification {
  return {
    id: row.id,
    score: row.score,
    intent: row.intent,
    temperature: row.temperature,
    salesStage: row.sales_stage || "new_lead",
    priority: row.priority || "medium",
    confidence: typeof row.confidence === "number" ? row.confidence : Number(row.confidence || 0),
    summary: row.summary,
    signals: row.signals || { productInterest: null, location: null, budget: null, timeline: null, useCase: null, buyingSignals: [], objections: [] },
    missingInformation: Array.isArray(row.missing_information) ? row.missing_information : [],
    scoreBreakdown: Array.isArray(row.score_breakdown) ? row.score_breakdown : [],
    nextBestAction: row.next_best_action,
    nextBestActionType: row.next_best_action_type || "ask_question",
    nextBestActionRationale: row.next_best_action_rationale || row.next_best_action,
    followUpHours: row.recommended_follow_up_at ? Math.max(1, Math.round((new Date(row.recommended_follow_up_at).getTime() - new Date(row.created_at).getTime()) / 3_600_000)) : null,
    status: row.status,
    createdAt: row.created_at,
  };
}

export async function generateConversationQualification(params: {
  organizationId: string;
  userId: string;
  userRole: string;
  conversationId: string;
}): Promise<ConversationQualification> {
  if (params.userRole === "viewer") throw new Error("Salt okunur erişim.");
  const admin = createSupabaseAdminClient();
  const { data: conversation } = await admin.from("conversations")
    .select("id,organization_id,provider,lead_id,external_id")
    .eq("id", params.conversationId).eq("organization_id", params.organizationId).maybeSingle();
  if (!conversation) throw new Error("Görüşme bulunamadı.");

  const { data: messages } = await admin.from("messages").select("direction,body,created_at")
    .eq("organization_id", params.organizationId).eq("conversation_id", params.conversationId)
    .order("created_at", { ascending: true }).limit(60);
  const transcript = safeMessages(messages || []);
  if (transcript.length === 0) throw new Error("Analiz edilecek mesaj bulunamadı.");

  let lead: Record<string, unknown> | null = null;
  if (conversation.lead_id) {
    const result = await admin.from("leads").select("id,name,status,source,notes").eq("id", conversation.lead_id).eq("organization_id", params.organizationId).maybeSingle();
    lead = result.data as Record<string, unknown> | null;
  }

  const input = { provider: conversation.provider, lead, transcript };
  const inputHash = crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const { data: cached } = await admin.from("conversation_ai_qualifications").select("*")
    .eq("organization_id", params.organizationId).eq("conversation_id", params.conversationId).eq("input_hash", inputHash)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (cached) return mapStoredQualification(cached as StoredQualification);

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("AI satış analizi yapılandırılmamış.");
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    contents: JSON.stringify(input),
    config: {
      temperature: 0.1,
      responseMimeType: "application/json",
      systemInstruction: [
        "You are FlowSales AI Conversation Intelligence 2.0 for a human sales team. Return JSON only.",
        "Use only facts explicitly supported by the conversation or CRM context. Never invent budget, product, location, delivery date, identity, availability or purchase intent.",
        "Extract productInterest, location, budget, timeline and useCase only when evidenced; otherwise use null.",
        "List concrete buyingSignals and objections with no speculation. missingInformation must contain only facts that would materially improve the next sales step.",
        "salesStage is new_lead|discovery|qualified|quote_ready|quote_sent|negotiation|won|lost|support. Do not claim quote_sent, won or lost without explicit evidence.",
        "For scoreEvidence, return only evidence-backed factor identifiers from: product_interest, pricing_intent, availability_intent, location_known, budget_known, timeline_known, use_case_known, repeat_engagement, quote_requested, purchase_commitment, explicit_objection, low_intent.",
        "Do not assign points. FlowSales owns the fixed scoring weights and deduplicates factors. Never include a factor when its evidence is missing or speculative.",
        "quote_requested requires an explicit request for a quote/offer. purchase_commitment requires explicit readiness to buy, order, pay, reserve or proceed. repeat_engagement requires evidence of continued/repeated engagement, not merely multiple messages in one exchange.",
        "explicit_objection requires a concrete objection such as price, timing or fit. low_intent requires explicit low/no commercial intent, not simply missing information.",
        "priority is high only when the evidence supports prompt human attention. confidence reflects confidence in the analysis, not purchase probability.",
        "nextBestAction must be one concrete action a human sales rep can take now. nextBestActionType is ask_question|share_information|create_quote|follow_up|call|no_action.",
        "Never automatically mutate CRM stage, create a quote, call, or send a customer message. AI recommends; a human decides.",
        "followUpHours is null when follow-up is not appropriate.",
      ].join(" "),
    },
  });

  let decoded: unknown;
  try { decoded = JSON.parse(response.text || "{}"); } catch { throw new Error("AI satış analizi geçersiz JSON döndürdü."); }
  const parsed = outputSchema.parse(decoded);
  const scoreBreakdown = calculateScoreBreakdown(parsed.scoreEvidence);
  const score = calculateScore(scoreBreakdown);
  const recommended = parsed.followUpHours ? new Date(Date.now() + parsed.followUpHours * 3_600_000).toISOString() : null;

  const { data: row, error } = await admin.from("conversation_ai_qualifications").insert({
    organization_id: params.organizationId,
    conversation_id: params.conversationId,
    lead_id: conversation.lead_id,
    provider: conversation.provider,
    score,
    intent: parsed.intent,
    temperature: parsed.temperature,
    sales_stage: parsed.salesStage,
    priority: parsed.priority,
    confidence: parsed.confidence,
    summary: parsed.summary,
    signals: parsed.signals,
    missing_information: parsed.missingInformation,
    score_breakdown: scoreBreakdown,
    next_best_action: parsed.nextBestAction,
    next_best_action_type: parsed.nextBestActionType,
    next_best_action_rationale: parsed.nextBestActionRationale,
    recommended_follow_up_at: recommended,
    model,
    prompt_version: "2026-08-10.1",
    input_hash: inputHash,
    status: "suggested",
  }).select("id,created_at,status").single();
  if (error || !row) throw new Error("AI satış analizi kaydedilemedi.");

  await admin.from("omnichannel_audit_events").insert({
    organization_id: params.organizationId,
    conversation_id: params.conversationId,
    provider: conversation.provider,
    actor_user_id: params.userId,
    event_type: "ai_qualification_generated",
    metadata: {
      qualification_id: row.id,
      score,
      intent: parsed.intent,
      temperature: parsed.temperature,
      sales_stage: parsed.salesStage,
      priority: parsed.priority,
      model,
      prompt_version: "2026-08-10.1",
    },
  });

  const { scoreEvidence: _scoreEvidence, ...result } = parsed;
  void _scoreEvidence;
  return { ...result, score, scoreBreakdown, id: row.id, status: row.status, createdAt: row.created_at };
}

export async function getLatestConversationQualification(organizationId: string, conversationId: string) {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("conversation_ai_qualifications").select("*")
    .eq("organization_id", organizationId).eq("conversation_id", conversationId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data;
}

export async function reviewConversationQualification(params: {
  organizationId: string;
  userId: string;
  userRole: string;
  conversationId: string;
  qualificationId: string;
  decision: "accepted" | "dismissed";
}) {
  if (params.userRole === "viewer") throw new Error("Salt okunur erişim.");
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("conversation_ai_qualifications").update({
    status: params.decision,
    reviewed_by: params.userId,
    reviewed_at: new Date().toISOString(),
  }).eq("id", params.qualificationId).eq("organization_id", params.organizationId).eq("conversation_id", params.conversationId)
    .select("id,status").maybeSingle();
  if (error || !data) throw new Error("AI analiz kararı kaydedilemedi.");
  await admin.from("omnichannel_audit_events").insert({
    organization_id: params.organizationId,
    conversation_id: params.conversationId,
    actor_user_id: params.userId,
    event_type: "ai_qualification_reviewed",
    metadata: { qualification_id: params.qualificationId, decision: params.decision },
  });
  return data;
}