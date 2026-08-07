import "server-only";

import crypto from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";

const outputSchema = z.object({
  score: z.number().int().min(0).max(100),
  intent: z.enum(["buying", "pricing", "availability", "support", "research", "other"]),
  temperature: z.enum(["hot", "warm", "cold"]),
  summary: z.string().trim().min(1).max(600),
  nextBestAction: z.string().trim().min(1).max(500),
  followUpHours: z.number().int().min(1).max(720).nullable(),
});

export type ConversationQualification = z.infer<typeof outputSchema> & { id: string; createdAt: string; status: "suggested" | "accepted" | "dismissed" };

function safeMessages(rows: Array<{ direction?: string; body?: string | null; created_at?: string }>) {
  return rows.slice(-30).map((row) => ({
    direction: row.direction === "outbound" ? "agent" : "customer",
    text: (row.body || "[non-text message]").slice(0, 1200),
    at: row.created_at,
  }));
}

export async function generateConversationQualification(params: {
  organizationId: string;
  userId: string;
  userRole: string;
  conversationId: string;
}): Promise<ConversationQualification> {
  if (params.userRole === "viewer") throw new Error("Read-only access.");
  const admin = createSupabaseAdminClient();
  const { data: conversation } = await admin.from("conversations")
    .select("id,organization_id,provider,lead_id,external_id")
    .eq("id", params.conversationId).eq("organization_id", params.organizationId).maybeSingle();
  if (!conversation) throw new Error("Conversation not found.");
  const { data: messages } = await admin.from("messages").select("direction,body,created_at")
    .eq("organization_id", params.organizationId).eq("conversation_id", params.conversationId)
    .order("created_at", { ascending: true }).limit(40);
  const transcript = safeMessages(messages || []);
  if (transcript.length === 0) throw new Error("Conversation has no messages to qualify.");

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
  if (cached) return {
    id: cached.id, score: cached.score, intent: cached.intent, temperature: cached.temperature,
    summary: cached.summary, nextBestAction: cached.next_best_action,
    followUpHours: cached.recommended_follow_up_at ? Math.max(1, Math.round((new Date(cached.recommended_follow_up_at).getTime() - new Date(cached.created_at).getTime()) / 3_600_000)) : null,
    status: cached.status, createdAt: cached.created_at,
  };

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("AI qualification is not configured.");
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    contents: JSON.stringify(input),
    config: {
      temperature: 0.15,
      responseMimeType: "application/json",
      systemInstruction: [
        "You are FlowSales AI lead qualification. Return JSON only.",
        "Use only facts present in the conversation/CRM context. Do not invent budget, product availability, delivery dates, identity, or purchase intent.",
        "score is 0-100 purchase/commercial readiness, intent is buying|pricing|availability|support|research|other, temperature hot|warm|cold.",
        "nextBestAction must be a concrete action for a human sales rep. followUpHours is null when no follow-up is appropriate.",
        "Never recommend automatically sending a customer message without human review.",
      ].join(" "),
    },
  });
  let decoded: unknown;
  try { decoded = JSON.parse(response.text || "{}"); } catch { throw new Error("AI qualification returned invalid JSON."); }
  const parsed = outputSchema.parse(decoded);
  const recommended = parsed.followUpHours ? new Date(Date.now() + parsed.followUpHours * 3_600_000).toISOString() : null;
  const { data: row, error } = await admin.from("conversation_ai_qualifications").insert({
    organization_id: params.organizationId, conversation_id: params.conversationId, lead_id: conversation.lead_id,
    provider: conversation.provider, score: parsed.score, intent: parsed.intent, temperature: parsed.temperature,
    summary: parsed.summary, next_best_action: parsed.nextBestAction, recommended_follow_up_at: recommended,
    model, input_hash: inputHash, status: "suggested",
  }).select("id,created_at,status").single();
  if (error || !row) throw new Error("Failed to persist AI qualification.");
  await admin.from("omnichannel_audit_events").insert({
    organization_id: params.organizationId, conversation_id: params.conversationId, provider: conversation.provider,
    actor_user_id: params.userId, event_type: "ai_qualification_generated", metadata: { qualification_id: row.id, score: parsed.score, intent: parsed.intent, temperature: parsed.temperature, model },
  });
  return { ...parsed, id: row.id, status: row.status, createdAt: row.created_at };
}

export async function getLatestConversationQualification(organizationId: string, conversationId: string) {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("conversation_ai_qualifications").select("*")
    .eq("organization_id", organizationId).eq("conversation_id", conversationId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data;
}

export async function reviewConversationQualification(params: {
  organizationId: string; userId: string; userRole: string; conversationId: string; qualificationId: string; decision: "accepted" | "dismissed";
}) {
  if (params.userRole === "viewer") throw new Error("Read-only access.");
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("conversation_ai_qualifications").update({
    status: params.decision, reviewed_by: params.userId, reviewed_at: new Date().toISOString(),
  }).eq("id", params.qualificationId).eq("organization_id", params.organizationId).eq("conversation_id", params.conversationId)
    .select("id,status").maybeSingle();
  if (error || !data) throw new Error("Qualification review failed.");
  await admin.from("omnichannel_audit_events").insert({ organization_id: params.organizationId, conversation_id: params.conversationId, actor_user_id: params.userId, event_type: "ai_qualification_reviewed", metadata: { qualification_id: params.qualificationId, decision: params.decision } });
  return data;
}
