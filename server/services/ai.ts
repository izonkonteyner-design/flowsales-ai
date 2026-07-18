import "server-only";

import { GoogleGenAI } from "@google/genai";

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";

type GeminiConfig = {
  apiKey: string;
  model: string;
};

function readGeminiConfig(): GeminiConfig {
  const apiKey = process.env.GEMINI_API_KEY?.trim() ?? "";
  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;

  if (!apiKey) {
    throw new Error("Gemini is not configured. Set GEMINI_API_KEY on the server.");
  }

  return { apiKey, model };
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

export async function generateText(prompt: string) {
  assertServerRuntime();
  const normalizedPrompt = prompt.trim();
  if (!normalizedPrompt) {
    throw new Error("Gemini prompt is required.");
  }

  const { model } = readGeminiConfig();
  const client = getGeminiClient();

  try {
    const response = await client.models.generateContent({
      model,
      contents: normalizedPrompt,
    });

    const text = response.text?.trim();
    if (!text) {
      throw new Error("Gemini returned an empty response.");
    }

    return text;
  } catch (error) {
    if (isUnsupportedModelError(error)) {
      console.error("[ai] Gemini model is no longer available to new users. Update GEMINI_MODEL to a currently supported model such as gemini-2.5-flash-lite.", {
        model,
      });
    }
    logGeminiError("generateText failed", error);
    throw new Error("Unable to generate text with Gemini. Update GEMINI_MODEL if the current model is no longer available.");
  }
}
