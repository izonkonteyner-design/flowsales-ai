import "server-only";

import { getGeminiClient, getGeminiModel } from "@/server/services/ai";
import { aiResponseSchema, type AiAction, type AiResponse, type AgentType } from "./schema";
import { logAiEvent, logAiError } from "./logger";
import { checkAiRateLimit } from "./rate-limit";
import { Type } from "@google/genai";
import { getAgentDefinition } from "./agents/registry";

export async function processAiMessage(
  workspaceId: string,
  userId: string,
  conversationId: string,
  userMessage: string,
  demoMode: boolean,
  agentType: AgentType = "sales"
): Promise<AiResponse | null> {
  const isRateLimitOk = await checkAiRateLimit(workspaceId, "message_generation");
  if (!isRateLimitOk) {
    logAiError("rate_limit_exceeded", new Error("Rate limit exceeded"), { workspaceId, userId });
    throw new Error("Rate limit exceeded for message generation. Please try again later.");
  }

  const definition = getAgentDefinition(agentType);
  if (!definition) {
    throw new Error(`Unknown agent type: ${agentType}`);
  }

  // Demo mode avoids outbound Gemini calls (cost + PII control).
  // Return a deterministic fallback with a representative proposed action so
  // the chat UI and approvals surface can be exercised end-to-end.
  if (demoMode) {
    logAiEvent("process_message_skipped_demo", { workspaceId, conversationId, agentType });
    const demoAction = buildDemoProposedAction(agentType, userMessage);
    return {
      ...definition.fallbackResponse,
      message: `[Demo] ${definition.fallbackResponse.message}`,
      intent: "demo",
      confidence: 0.1,
      handoff_flag: false,
      proposed_actions: demoAction ? [demoAction] : [],
    };
  }

  const { createSupabaseAdminClient } = await import("@/lib/supabase/server-admin");
  const adminClient = createSupabaseAdminClient();

  const [agentRes, knowledgeRes, playbooksRes, messagesRes] = await Promise.all([
    adminClient
      .from("ai_agents")
      .select("*")
      .eq("organization_id", workspaceId)
      .eq("type", agentType)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    adminClient
      .from("ai_knowledge_items")
      .select("title, content, category")
      .eq("organization_id", workspaceId)
      .eq("is_active", true),
    adminClient
      .from("ai_playbooks")
      .select("name, instructions, allowed_actions")
      .eq("organization_id", workspaceId)
      .eq("is_active", true),
    adminClient
      .from("ai_messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(20),
  ]);

  if (agentRes.error) {
    throw new Error("Failed to load AI agent configuration");
  }

  const agent = agentRes.data;
  if (!agent) {
    throw new Error(`No active agent of type "${agentType}" found for this workspace`);
  }

  const knowledgeContext = (knowledgeRes.data ?? [])
    .map((k) => `[${k.category.toUpperCase()}] ${k.title}: ${k.content}`)
    .join("\n");
  const playbookContext = (playbooksRes.data ?? [])
    .map(
      (p) =>
        `[PLAYBOOK: ${p.name}]\nInstructions: ${p.instructions}\nAllowed Actions: ${JSON.stringify(p.allowed_actions)}`
    )
    .join("\n\n");

  const history = (messagesRes.data ?? [])
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n");

  const systemPrompt = `
You are ${definition.displayName} for FlowSales.
Your role: ${definition.description}

System settings: ${agent.system_prompt}

Default role instructions:
${definition.defaultSystemPrompt}

Allowed actions for this agent (do not propose any others):
${JSON.stringify(definition.allowedActions)}

KNOWLEDGE BASE:
${knowledgeContext || "No knowledge base provided."}

PLAYBOOKS:
${playbookContext || "No specific playbooks provided."}

CONVERSATION HISTORY:
${history}

CURRENT USER MESSAGE:
${userMessage}

INSTRUCTIONS:
- Respond using the strict JSON schema provided.
- Never invent data that is not in the knowledge base.
- Only propose actions from the allowed list above.
- Set 'handoff_flag' to true if the user asks for a human or the request cannot be resolved safely.
- 'intent' must be a short free-form label that best describes the user's intent.
  `.trim();

  logAiEvent("process_message_started", { workspaceId, conversationId, demoMode, agentType });

  try {
    const client = getGeminiClient();
    const model = getGeminiModel();

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
                  payload: { type: Type.OBJECT },
                },
                required: ["action_type", "payload"],
              },
            },
            handoff_flag: { type: Type.BOOLEAN },
          },
          required: ["message", "intent", "confidence", "handoff_flag"],
        },
        temperature: 0.2,
      },
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
      logAiError("gemini_parse_error", e, { workspaceId, conversationId, agentType });
      return definition.fallbackResponse;
    }

    logAiEvent("process_message_completed", {
      workspaceId,
      conversationId,
      intent: parsedResponse.intent,
      agentType,
    });

    return parsedResponse;
  } catch (error) {
    logAiError("process_message_failed", error, { workspaceId, conversationId, agentType });
    throw error;
  }
}

function buildDemoProposedAction(agentType: AgentType, userMessage: string): AiAction | null {
  const truncated = userMessage.slice(0, 280);
  switch (agentType) {
    case "sales":
      return {
        action_type: "search_products",
        payload: { query: truncated || "demo product" },
      };
    case "support":
      return {
        action_type: "classify_support_request",
        payload: {
          category: "general",
          severity: "medium",
          summary: truncated || "Demo support request",
        },
      };
    case "operations":
      return {
        action_type: "search_knowledge",
        payload: { query: truncated || "demo order" },
      };
    case "reporting":
      return {
        action_type: "generate_daily_report",
        payload: { channel: "in_app" },
      };
    case "social":
      return {
        action_type: "suggest_content",
        payload: {
          platform: "linkedin",
          topic: truncated || "demo topic",
          count: 3,
        },
      };
    default:
      return null;
  }
}
