import "server-only";

import { generateText, hasGeminiConfig } from "@/server/services/ai";
import { OmnichannelInboxRepository } from "@/server/repositories/supabase/omnichannel-inbox";

const MAX_CONTEXT_MESSAGES = 12;
const MAX_CONTEXT_CHARS = 6000;
const MAX_SUGGESTION_CHARS = 2000;

export type WhatsAppAiSuggestionResult =
  | { success: true; suggestion: string }
  | { success: false; errorCode: string; message: string };

export async function generateWhatsAppReplySuggestion(params: {
  organizationId: string;
  userId: string;
  userRole: string;
  conversationId: string;
}): Promise<WhatsAppAiSuggestionResult> {
  if (params.userRole === "viewer") {
    return { success: false, errorCode: "unauthorized", message: "Read-only users cannot generate AI reply suggestions." };
  }
  if (!hasGeminiConfig()) {
    return { success: false, errorCode: "ai_not_configured", message: "AI reply suggestions are not configured." };
  }

  const repository = new OmnichannelInboxRepository();
  const conversation = await repository.getConversationDetail(params);
  if (!conversation || conversation.provider !== "whatsapp") {
    return { success: false, errorCode: "not_found", message: "WhatsApp conversation not found." };
  }

  const transcript = conversation.messages
    .slice(-MAX_CONTEXT_MESSAGES)
    .map((message) => {
      const speaker = message.direction === "inbound" ? "Customer" : "Agent";
      const body = message.body?.trim() || (message.attachments.length > 0 ? `[${message.attachments[0].attachmentType} attachment]` : "[no text]");
      return `${speaker}: ${body}`;
    })
    .join("\n")
    .slice(-MAX_CONTEXT_CHARS);

  const prompt = [
    "You are drafting a WhatsApp reply for a human sales agent.",
    "Return only the suggested message, with no headings, analysis, markdown, or quotation marks.",
    "Use the same language as the customer's latest message; default to Turkish when uncertain.",
    "Be concise, professional, helpful, and sales-oriented without pressure.",
    "Never invent prices, stock, delivery dates, discounts, guarantees, or product specifications not present in the conversation.",
    "If information is missing, ask one clear follow-up question instead of guessing.",
    "This is a draft only. A human will review and explicitly send it.",
    `Contact display name: ${conversation.contactName}`,
    "Conversation:",
    transcript || "[No usable message text]",
  ].join("\n");

  try {
    const text = (await generateText(prompt, { temperature: 0.3 })).trim().slice(0, MAX_SUGGESTION_CHARS);
    if (!text) {
      return { success: false, errorCode: "empty_suggestion", message: "AI returned an empty suggestion." };
    }
    return { success: true, suggestion: text };
  } catch {
    return { success: false, errorCode: "ai_generation_failed", message: "AI reply suggestion could not be generated." };
  }
}
