import "server-only";

import { getGeminiClient, getGeminiModel } from "@/server/services/ai";
import { aiResponseSchema, type AiResponse } from "./schema";
import { logAiEvent, logAiError } from "./logger";
import { checkAiRateLimit } from "./rate-limit";
import { Type } from "@google/genai";

export async function processAiMessage(
  workspaceId: string,
  userId: string,
  conversationId: string,
  userMessage: string,
  demoMode: boolean
): Promise<AiResponse | null> {
  const isRateLimitOk = await checkAiRateLimit(workspaceId, "message_generation");
  if (!isRateLimitOk) {
    logAiError("rate_limit_exceeded", new Error("Rate limit exceeded"), { workspaceId, userId });
    throw new Error("Rate limit exceeded for message generation. Please try again later.");
  }

  const { createSupabaseAdminClient } = await import("@/lib/supabase/server-admin");
  const adminClient = createSupabaseAdminClient();

  // Fetch Agent, Knowledge, Playbooks, and Message History
  const [agentRes, knowledgeRes, playbooksRes, messagesRes] = await Promise.all([
    adminClient.from("ai_agents").select("*").eq("organization_id", workspaceId).eq("type", "sales").limit(1).maybeSingle(),
    adminClient.from("ai_knowledge_items").select("title, content, category").eq("organization_id", workspaceId).eq("is_active", true),
    adminClient.from("ai_playbooks").select("name, instructions, allowed_actions").eq("organization_id", workspaceId).eq("is_active", true),
    adminClient.from("ai_messages").select("role, content").eq("conversation_id", conversationId).order("created_at", { ascending: true }).limit(20)
  ]);

  if (agentRes.error) {
    throw new Error("Failed to load AI agent configuration");
  }
  
  const agent = agentRes.data;
  if (!agent) {
    throw new Error("No active sales agent found for this workspace");
  }

  const knowledgeContext = (knowledgeRes.data ?? []).map(k => `[${k.category.toUpperCase()}] ${k.title}: ${k.content}`).join("\n");
  const playbookContext = (playbooksRes.data ?? []).map(p => `[PLAYBOOK: ${p.name}]\nInstructions: ${p.instructions}\nAllowed Actions: ${JSON.stringify(p.allowed_actions)}`).join("\n\n");
  
  const history = (messagesRes.data ?? []).map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n");

  const systemPrompt = `
You are an AI Sales Agent for FlowSales.
Your system settings: ${agent.system_prompt}

KNOWLEDGE BASE:
${knowledgeContext || "No knowledge base provided."}

PLAYBOOKS:
${playbookContext || "No specific playbooks provided."}

CONVERSATION HISTORY:
${history}

CURRENT USER MESSAGE:
${userMessage}

INSTRUCTIONS:
You MUST respond using the strict JSON schema provided.
- Do NOT invent product prices or features. Use ONLY the knowledge base.
- If you need to search for products, use the "search_products" action.
- If you want to draft a quote or a lead, use the respective actions. You CANNOT mutate CRM directly; you propose actions.
- Set 'handoff_flag' to true if the user asks for a human or is angry.
- Propose actions securely. Never bypass constraints.
  `.trim();

  logAiEvent("process_message_started", { workspaceId, conversationId, demoMode });

  try {
    const client = getGeminiClient();
    const model = getGeminiModel();
    
    // Using structured outputs with zod is tricky with genai directly unless we define the schema as an object
    // GenAI expects a Schema object. We can approximate it or use responseSchema
    
    const response = await client.models.generateContent({
      model,
      contents: systemPrompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            message: { type: Type.STRING },
            intent: { type: Type.STRING },
            confidence: { type: Type.NUMBER },
            recommended_product_ids: { type: Type.ARRAY, items: { type: Type.STRING } },
            proposed_actions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  action_type: { type: Type.STRING },
                  payload: { type: Type.OBJECT }
                },
                required: ["action_type", "payload"]
              }
            },
            handoff_flag: { type: Type.BOOLEAN }
          },
          required: ["message", "intent", "confidence", "handoff_flag"]
        },
        temperature: 0.2
      }
    });

    const responseText = response.text?.trim();
    if (!responseText) {
      throw new Error("Empty response from Gemini");
    }

    let parsedResponse: AiResponse;
    try {
      const json = JSON.parse(responseText);
      parsedResponse = aiResponseSchema.parse(json);
    } catch (e) {
      logAiError("gemini_parse_error", e, { workspaceId, conversationId });
      // Fallback response for parse error
      return {
        message: "I am having trouble processing that right now. Would you like me to transfer you to a human?",
        intent: "support",
        confidence: 0,
        handoff_flag: true,
        proposed_actions: []
      };
    }

    logAiEvent("process_message_completed", { workspaceId, conversationId, intent: parsedResponse.intent });
    
    return parsedResponse;
  } catch (error) {
    logAiError("process_message_failed", error, { workspaceId, conversationId });
    throw error;
  }
}
