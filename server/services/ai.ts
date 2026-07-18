import "server-only";

import { GoogleGenAI } from "@google/genai";

type GeminiConfig = {
  apiKey: string;
  model: string;
};

function readGeminiConfig(): GeminiConfig {
  const apiKey = process.env.GEMINI_API_KEY?.trim() ?? "";
  const model = process.env.GEMINI_MODEL?.trim() ?? "";

  if (!apiKey || !model) {
    throw new Error("Gemini is not configured. Set GEMINI_API_KEY and GEMINI_MODEL on the server.");
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
    logGeminiError("generateText failed", error);
    throw new Error("Unable to generate text with Gemini.");
  }
}
