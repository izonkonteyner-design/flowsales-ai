import "server-only";

import { generateText, AiError, classifyAiError, isAiError } from "@/server/services/ai";
import {
  aiSalesRecommendationResponseJsonSchema,
  AiSalesAgentServiceError,
  buildAiSalesAgentPrompt,
  parseAiSalesAgentResponse,
  type AISalesRecommendation,
  type AiSalesAgentLeadInput,
  type AiSalesAgentOptions,
} from "@/lib/validations/ai-sales-agent";

/**
 * AI Sales Agent: per-lead analysis & recommendation.
 *
 * The prompt builder, output parser, error codes, and public error messages
 * live in `lib/validations/ai-sales-agent.ts` (server-only-free) so they can
 * be unit-tested without the `"server-only"` guard. This module re-exports
 * those for symmetry with the other `server/services/*` modules and adds the
 * only piece that MUST run on the server: the Gemini call.
 *
 * Output schema + prompt MUST stay in lockstep: every field the prompt asks
 * for has a matching entry in `aiSalesRecommendationResponseJsonSchema`, and
 * every field in the schema has Zod bounds in `ai-sales-agent.ts`. Don't add a
 * field to one without the other two.
 */

// Re-export the testable primitives so callers can import from either path.
export {
  buildAiSalesAgentPrompt,
  parseAiSalesAgentResponse,
  AiSalesAgentServiceError,
  getAiSalesAgentPublicErrorMessage,
  aiSalesAgentErrorMessages,
  type AiSalesAgentLeadInput,
  type AiSalesAgentOptions,
  type AiSalesAgentErrorCode,
} from "@/lib/validations/ai-sales-agent";

function logDiagnostic(event: string, details: Record<string, unknown>) {
  console.error(`[ai-sales-agent] ${event}`, details);
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { message: String(error) };
}

/**
 * Run the AI Sales Agent over a lead context. Returns a validated
 * `AISalesRecommendation`. On schema failure or provider error, throws an
 * `AiSalesAgentServiceError` with a surface-safe code — the caller is
 * responsible for persisting the failed run, NOT for surfacing the raw error.
 */
export async function generateAiSalesAgentRecommendation(
  input: AiSalesAgentLeadInput,
  options: AiSalesAgentOptions = {},
): Promise<AISalesRecommendation> {
  const prompt = buildAiSalesAgentPrompt(input, {
    temperature: options.temperature,
    workspacePrompt: options.workspacePrompt,
  });

  try {
    const responseText = await generateText(prompt, {
      responseMimeType: "application/json",
      responseSchema: aiSalesRecommendationResponseJsonSchema,
      temperature: options.temperature ?? 0.2,
    });

    return parseAiSalesAgentResponse(responseText);
  } catch (error) {
    if (error instanceof AiSalesAgentServiceError) {
      throw error;
    }

    logDiagnostic("generateAiSalesAgentRecommendation failure", {
      error: serializeError(error),
      leadId: input.lead.id,
    });

    if (isAiError(error)) {
      switch (error.code) {
        case "AI_NOT_CONFIGURED":
          throw new AiSalesAgentServiceError("ai_not_configured", 503);
        case "AI_TRANSIENT":
          throw new AiSalesAgentServiceError("temporary_failure", 502);
        case "AI_PERMANENT":
          throw new AiSalesAgentServiceError("temporary_failure", 500);
      }
    }

    throw new AiSalesAgentServiceError("temporary_failure", 502);
  }
}
