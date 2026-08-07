import "server-only";

import { GoogleGenAI } from "@google/genai";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";

export type ConversationIntelligence = {
  intent: string;
  qualificationScore: number;
  confidence: number;
  urgency: "low" | "normal" | "high" | "critical";
  nextBestAction: string;
  rationale: string;
  signals: string[];
};

function boundedNumber(value: unknown, min: number, max: number) {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? Math.min(max, Math.max(min, num)) : min;
}

function parseIntelligence(raw: unknown): ConversationIntelligence {
  if (!raw || typeof raw !== "object") throw new Error("AI returned invalid intelligence output.");
  const value = raw as Record<string, unknown>;
  const urgency = ["low", "normal", "high", "critical"].includes(String(value.urgency)) ? String(value.urgency) as ConversationIntelligence["urgency"] : "normal";
  const nextBestAction = typeof value.next_best_action === "string" ? value.next_best_action.trim() : "Review the conversation and decide the next sales action.";
  if (!nextBestAction) throw new Error("AI returned an empty next best action.");
  return {
    intent: typeof value.intent === "string" && value.intent.trim() ? value.intent.trim().slice(0, 120) : "unknown",
    qualificationScore: Math.round(boundedNumber(value.qualification_score, 0, 100)),
    confidence: boundedNumber(value.confidence, 0, 1),
    urgency,
    nextBestAction: nextBestAction.slice(0, 600),
    rationale: typeof value.rationale === "string" ? value.rationale.trim().slice(0, 1200) : "",
    signals: Array.isArray(value.signals) ? value.signals.filter((x): x is string => typeof x === "string").slice(0, 10).map((x) => x.slice(0, 180)) : [],
  };
}

export async function generateConversationIntelligence(params: {
  organizationId: string;
  userId: string;
  conversationId: string;
}) {
  const admin = createSupabaseAdminClient();
  const { data: conversation } = await admin.from("conversations")
    .select("id,provider,lead_id,channel_contact_id")
    .eq("id", params.conversationId).eq("organization_id", params.organizationId).maybeSingle();
  if (!conversation) throw new Error("Conversation not found.");

  const { data: messages } = await admin.from("messages")
    .select("direction,body,message_type,created_at")
    .eq("organization_id", params.organizationId).eq("conversation_id", params.conversationId)
    .order("created_at", { ascending: false }).limit(30);
  const chronological = [...(messages ?? [])].reverse();
  if (chronological.length === 0) throw new Error("Conversation has no messages to analyze.");

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  const client = new GoogleGenAI({ apiKey });
  const transcript = chronological.map((m) => `${m.direction === "inbound" ? "CUSTOMER" : "AGENT"}: ${m.body || `[${m.message_type}]`}`).join("\n").slice(-16_000);
  const response = await client.models.generateContent({
    model,
    contents: transcript,
    config: {
      temperature: 0.1,
      responseMimeType: "application/json",
      systemInstruction: `You are FlowSales AI's sales qualification assistant. Analyze only evidence present in the transcript. Never invent budget, authority, timing, product fit, identity, pricing or commitments. Return JSON with exactly: intent (string), qualification_score (0-100 integer), confidence (0-1), urgency (low|normal|high|critical), next_best_action (one human-reviewable action), rationale (short evidence-based explanation), signals (array of short strings). The output is advisory only and must never trigger a customer message or CRM mutation automatically.`,
    },
  });
  const raw = response.text?.trim();
  if (!raw) throw new Error("AI returned an empty response.");
  const intelligence = parseIntelligence(JSON.parse(raw));

  const { data: saved, error } = await admin.from("conversation_intelligence").upsert({
    organization_id: params.organizationId,
    conversation_id: params.conversationId,
    lead_id: conversation.lead_id,
    intent: intelligence.intent,
    qualification_score: intelligence.qualificationScore,
    confidence: intelligence.confidence,
    urgency: intelligence.urgency,
    next_best_action: intelligence.nextBestAction,
    rationale: intelligence.rationale,
    signals: intelligence.signals,
    model,
    prompt_version: "2026-08-07.1",
    generated_by: params.userId,
    generated_at: new Date().toISOString(),
    review_status: "suggested",
    updated_at: new Date().toISOString(),
  }, { onConflict: "conversation_id" }).select("id").single();
  if (error || !saved) throw new Error("Failed to persist conversation intelligence.");
  return { id: saved.id, ...intelligence, model };
}

export async function reviewConversationIntelligence(params: {
  organizationId: string;
  userId: string;
  conversationId: string;
  status: "accepted" | "edited" | "dismissed";
  nextBestAction?: string;
}) {
  const admin = createSupabaseAdminClient();
  const patch: Record<string, unknown> = {
    review_status: params.status,
    reviewed_by: params.userId,
    reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (params.status === "edited" && params.nextBestAction?.trim()) patch.next_best_action = params.nextBestAction.trim().slice(0, 600);
  const { error } = await admin.from("conversation_intelligence").update(patch)
    .eq("organization_id", params.organizationId).eq("conversation_id", params.conversationId);
  if (error) throw new Error("Failed to review conversation intelligence.");
  return { success: true };
}
