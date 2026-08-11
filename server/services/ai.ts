import "server-only";

import { GoogleGenAI, type GenerateContentConfig } from "@google/genai";

const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";

type GeminiConfig = {
  apiKey: string;
  model: string;
};

export type GeminiRuntimeStatus = {
  configured: boolean;
  model: string;
  ok: boolean;
  code: "ok" | "missing_key" | "auth" | "quota" | "model" | "provider";
  message: string;
};

function readGeminiConfig(): GeminiConfig {
  const apiKey = process.env.GEMINI_API_KEY?.trim() ?? "";
  const model = getGeminiModel();

  if (!apiKey) {
    throw new Error("Gemini is not configured. Set GEMINI_API_KEY on the server.");
  }

  return { apiKey, model };
}

export function getGeminiModel() {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}

export function getDefaultGeminiModel() {
  return DEFAULT_GEMINI_MODEL;
}

export function hasGeminiConfig() {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

function assertServerRuntime() {
  if (typeof window !== "undefined") {
    throw new Error("Gemini service can only run on the server.");
  }
}

function safeProviderMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[REDACTED]")
    .replace(/key=[^&\s]+/gi, "key=[REDACTED]")
    .slice(0, 500);
}

function logGeminiError(context: string, error: unknown) {
  console.error(`[ai] ${context}`, {
    name: error instanceof Error ? error.name : "ProviderError",
    message: safeProviderMessage(error),
  });
}

function isModelAvailabilityError(error: unknown) {
  return /model.*(?:not found|not available|unsupported|deprecated|no longer available)|404.*model/i.test(safeProviderMessage(error));
}

function classifyGeminiError(error: unknown): Pick<GeminiRuntimeStatus, "code" | "message"> {
  const message = safeProviderMessage(error);
  if (/api key|unauthenticated|permission denied|401|403/i.test(message)) {
    return { code: "auth", message: "Gemini API anahtarı reddedildi veya gerekli erişime sahip değil." };
  }
  if (/quota|rate limit|resource exhausted|429/i.test(message)) {
    return { code: "quota", message: "Gemini kota veya hız limiti nedeniyle isteği reddetti." };
  }
  if (isModelAvailabilityError(error)) {
    return { code: "model", message: "Seçili Gemini modeli kullanılamıyor. Güvenli varsayılan modele geçiş gerekli." };
  }
  return { code: "provider", message: "Gemini bağlantı testi başarısız oldu. Sağlayıcı bağlantısı veya proje erişimi kontrol edilmeli." };
}

export function getGeminiClient() {
  assertServerRuntime();
  const { apiKey } = readGeminiConfig();
  return new GoogleGenAI({ apiKey });
}

type GenerateTextOptions = Pick<GenerateContentConfig, "responseMimeType" | "responseSchema" | "temperature" | "seed">;

async function generateWithModel(client: GoogleGenAI, model: string, prompt: string, options?: GenerateTextOptions) {
  const response = await client.models.generateContent({
    model,
    contents: prompt,
    config: options,
  });
  const text = response.text?.trim();
  if (!text) throw new Error("Gemini returned an empty response.");
  return text;
}

export async function generateText(prompt: string, options?: GenerateTextOptions) {
  assertServerRuntime();
  const normalizedPrompt = prompt.trim();
  if (!normalizedPrompt) throw new Error("Gemini prompt is required.");

  const { model } = readGeminiConfig();
  const client = getGeminiClient();

  try {
    return await generateWithModel(client, model, normalizedPrompt, options);
  } catch (error) {
    if (model !== DEFAULT_GEMINI_MODEL && isModelAvailabilityError(error)) {
      console.warn("[ai] configured Gemini model unavailable; retrying stable fallback", { model, fallback: DEFAULT_GEMINI_MODEL });
      try {
        return await generateWithModel(client, DEFAULT_GEMINI_MODEL, normalizedPrompt, options);
      } catch (fallbackError) {
        logGeminiError("fallback generateText failed", fallbackError);
        throw new Error("Unable to generate text with Gemini.");
      }
    }
    logGeminiError("generateText failed", error);
    throw new Error("Unable to generate text with Gemini.");
  }
}

export async function testGeminiConnection(): Promise<GeminiRuntimeStatus> {
  assertServerRuntime();
  const model = getGeminiModel();
  if (!hasGeminiConfig()) {
    return { configured: false, model, ok: false, code: "missing_key", message: "GEMINI_API_KEY production ortamında tanımlı değil." };
  }

  try {
    const text = await generateText("Yanıt olarak yalnızca OK yaz.", { temperature: 0, seed: 1 });
    if (!/^OK[.!]?$/i.test(text.trim())) {
      return { configured: true, model, ok: false, code: "provider", message: "Gemini yanıt verdi ancak bağlantı testi beklenen doğrulama yanıtını üretmedi." };
    }
    return { configured: true, model, ok: true, code: "ok", message: "Gemini production bağlantısı çalışıyor." };
  } catch (error) {
    const classified = classifyGeminiError(error);
    return { configured: true, model, ok: false, ...classified };
  }
}
