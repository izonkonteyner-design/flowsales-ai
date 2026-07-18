import "server-only";

import { generateText } from "@/server/services/ai";
import {
  buildQuoteAiDraftPrompt,
  createQuoteAiServiceError,
  parseQuoteAiDraftResponse,
  quoteAiDraftInputSchema,
  quoteAiDraftResponseJsonSchema,
  type QuoteAiDraft,
  type QuoteAiDraftInput,
  type QuoteAiErrorCode,
} from "@/lib/validations/quote-ai";

type GenerateQuoteAiDraftOptions = {
  temperature?: number;
  workspacePrompt?: string | null;
};

function logQuoteAiDiagnostic(event: string, details: Record<string, unknown>) {
  console.error(`[quote-ai] ${event}`, details);
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return { message: String(error) };
}

function isTemporaryProviderError(error: unknown) {
  return error instanceof Error && /no longer available to new users/i.test(error.message);
}

function toSafeQuoteAiError(error: unknown): QuoteAiErrorCode {
  if (error instanceof Error && /Gemini is not configured/i.test(error.message)) {
    return "ai_not_configured";
  }

  if (error instanceof Error && /forbidden|unauthorized/i.test(error.message)) {
    return "unauthorized";
  }

  if (error instanceof Error && /usage limit/i.test(error.message)) {
    return "usage_limit_reached";
  }

  return isTemporaryProviderError(error) ? "temporary_failure" : "temporary_failure";
}

export async function generateQuoteAiDraft(input: QuoteAiDraftInput, options: GenerateQuoteAiDraftOptions = {}): Promise<QuoteAiDraft> {
  const normalizedInput = quoteAiDraftInputSchema.parse(input);
  const prompt = buildQuoteAiDraftPrompt(normalizedInput, {
    workspacePrompt: options.workspacePrompt,
  });

  try {
    const responseText = await generateText(prompt, {
      responseMimeType: "application/json",
      responseSchema: quoteAiDraftResponseJsonSchema,
      temperature: options.temperature ?? 0.2,
    });

    return parseQuoteAiDraftResponse(responseText);
  } catch (error) {
    logQuoteAiDiagnostic("generateQuoteAiDraft failure", {
      supabaseError: serializeError(error),
      inputSummary: {
        organizationName: normalizedInput.organization.name,
        itemCount: normalizedInput.items.length,
      },
    });

    if (error instanceof Error && /Gemini is not configured/i.test(error.message)) {
      throw createQuoteAiServiceError("ai_not_configured", 503);
    }

    throw createQuoteAiServiceError(toSafeQuoteAiError(error), 502);
  }
}
