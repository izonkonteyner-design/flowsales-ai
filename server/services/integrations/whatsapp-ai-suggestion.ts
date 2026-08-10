import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { generateText, hasGeminiConfig } from "@/server/services/ai";
import { OmnichannelInboxRepository } from "@/server/repositories/supabase/omnichannel-inbox";

const MAX_CONTEXT_MESSAGES = 16;
const MAX_CONTEXT_CHARS = 7500;
const MAX_SUGGESTION_CHARS = 2000;

export type WhatsAppAiSuggestionResult =
  | { success: true; suggestion: string; provider: "whatsapp" | "instagram" | "facebook"; contextVersion: "copilot-2.0" }
  | { success: false; errorCode: string; message: string };

export async function generateWhatsAppReplySuggestion(params: {
  organizationId: string;
  userId: string;
  userRole: string;
  conversationId: string;
}): Promise<WhatsAppAiSuggestionResult> {
  if (params.userRole === "viewer") return { success: false, errorCode: "unauthorized", message: "Salt okunur kullanıcı AI cevap taslağı oluşturamaz." };
  if (!hasGeminiConfig()) return { success: false, errorCode: "ai_not_configured", message: "AI cevap taslakları yapılandırılmamış." };

  const repository = new OmnichannelInboxRepository();
  const conversation = await repository.getConversationDetail(params);
  if (!conversation || !["whatsapp", "instagram", "facebook"].includes(conversation.provider)) {
    return { success: false, errorCode: "not_found", message: "Desteklenen mesajlaşma görüşmesi bulunamadı." };
  }
  const provider = conversation.provider as "whatsapp" | "instagram" | "facebook";
  const channelLabel = provider === "whatsapp" ? "WhatsApp" : provider === "instagram" ? "Instagram DM" : "Facebook Messenger";

  const transcript = conversation.messages.slice(-MAX_CONTEXT_MESSAGES).map((message) => {
    const speaker = message.direction === "inbound" ? "Müşteri" : "Satış temsilcisi";
    const body = message.body?.trim() || (message.attachments.length > 0 ? `[${message.attachments[0].attachmentType} eki]` : "[metin yok]");
    return `${speaker}: ${body}`;
  }).join("\n").slice(-MAX_CONTEXT_CHARS);

  const admin = createSupabaseAdminClient();
  const { data: qualification } = await admin.from("conversation_ai_qualifications")
    .select("score,priority,sales_stage,summary,signals,missing_information,next_best_action,next_best_action_type,next_best_action_rationale,status")
    .eq("organization_id", params.organizationId).eq("conversation_id", params.conversationId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

  let lead: Record<string, unknown> | null = null;
  if (conversation.leadId) {
    const result = await admin.from("leads").select("id,full_name,company,city,status,notes,estimated_value,currency,next_follow_up_at")
      .eq("organization_id", params.organizationId).eq("id", conversation.leadId).maybeSingle();
    lead = result.data as Record<string, unknown> | null;
  }

  const salesContext = qualification ? JSON.stringify({
    leadScore: qualification.score,
    priority: qualification.priority,
    salesStage: qualification.sales_stage,
    summary: qualification.summary,
    signals: qualification.signals,
    missingInformation: qualification.missing_information,
    nextBestAction: qualification.next_best_action,
    nextBestActionType: qualification.next_best_action_type,
    nextBestActionRationale: qualification.next_best_action_rationale,
    analysisAcceptedByHuman: qualification.status === "accepted",
    lead,
  }) : JSON.stringify({ lead });

  const prompt = [
    `You are FlowSales AI Reply Copilot 2.0 drafting a ${channelLabel} reply for a human sales agent.`,
    "Return only the suggested customer-facing message. No headings, analysis, markdown, or quotation marks.",
    "Use the same language as the customer's latest message; default to Turkish when uncertain.",
    "Use Conversation Intelligence and CRM context only as supporting context. The actual conversation is authoritative if they conflict.",
    "Follow the Next Best Action when it is sensible and evidence-backed. If the next action is ask_question, ask only the highest-value missing question.",
    "If the customer is quote-ready, move the conversation toward collecting the remaining facts required for a quote instead of inventing commercial terms.",
    "Never invent prices, stock, delivery dates, discounts, guarantees, product specifications, payment terms or availability.",
    "Never claim that a quote, order, reservation, discount or CRM action has already happened unless the context explicitly proves it.",
    "Keep the message concise, natural, professional and specific to the conversation. Avoid generic sales clichés and pressure.",
    "This is a draft only. A human must review and explicitly send it; never imply automatic sending.",
    `Contact display name: ${conversation.contactName}`,
    `Sales intelligence context: ${salesContext}`,
    "Conversation:",
    transcript || "[Kullanılabilir mesaj metni yok]",
  ].join("\n");

  try {
    const text = (await generateText(prompt, { temperature: 0.25 })).trim().slice(0, MAX_SUGGESTION_CHARS);
    if (!text) return { success: false, errorCode: "empty_suggestion", message: "AI boş bir cevap taslağı döndürdü." };
    return { success: true, suggestion: text, provider, contextVersion: "copilot-2.0" };
  } catch {
    return { success: false, errorCode: "ai_generation_failed", message: "AI cevap taslağı oluşturulamadı." };
  }
}
