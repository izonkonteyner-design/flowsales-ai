import "server-only";

import { GoogleGenAI, type GenerateContentConfig } from "@google/genai";
import { AiError, classifyAiError, isAiError } from "@/lib/ai-errors";

const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";

type GeminiConfig = {
  apiKey: string;
  model: string;
};

function readGeminiConfig(): GeminiConfig {
  const apiKey = process.env.GEMINI_API_KEY?.trim() ?? "";
  const model = getGeminiModel();

  if (!apiKey) {
    throw AiError.notConfigured();
  }

  return { apiKey, model };
}

export function getGeminiModel() {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}

export function hasGeminiConfig() {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

function assertServerRuntime() {
  if (typeof window !== "undefined") {
    throw new Error("Gemini service can only run on the server.");
  }
}

function logGeminiError(context: string, error: unknown) {
  const details =
    error instanceof Error
      ? {
          name: error.name,
          message: error.message,
        }
      : { message: String(error) };

  console.error(`[ai] ${context}`, details);
}

function isUnsupportedModelError(error: unknown) {
  return error instanceof Error && /no longer available to new users/i.test(error.message);
}

export function getGeminiClient() {
  assertServerRuntime();
  const { apiKey } = readGeminiConfig();
  return new GoogleGenAI({ apiKey });
}

type GenerateTextOptions = Pick<GenerateContentConfig, "responseMimeType" | "responseSchema" | "temperature" | "seed">;

export async function generateText(prompt: string, options?: GenerateTextOptions) {
  assertServerRuntime();
  const normalizedPrompt = prompt.trim();
  if (!normalizedPrompt) {
    throw AiError.permanent("Gemini prompt is required.");
  }

  const { model } = readGeminiConfig();
  const client = getGeminiClient();

  try {
    const response = await client.models.generateContent({
      model,
      contents: normalizedPrompt,
      config: options,
    });

    const text = response.text?.trim();
    if (!text) {
      throw AiError.permanent("Gemini returned an empty response.");
    }

    return text;
  } catch (error) {
    if (isUnsupportedModelError(error)) {
      console.error("[ai] Gemini model is no longer available to new users. Update GEMINI_MODEL to a currently supported model such as gemini-3.1-flash-lite.", {
        model,
      });
    }
    logGeminiError("generateText failed", error);
    throw classifyAiError(error);
  }
}

export { AiError, classifyAiError, isAiError };
