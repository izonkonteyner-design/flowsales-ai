import "server-only";

import { GoogleGenAI, type GenerateContentConfig } from "@google/genai";
import {
  AiProvider,
  AiRuntimeStatus,
  OllamaConfig,
  buildOllamaGeneratePayload,
  classifyOllamaError,
  getAiProviderFromEnv,
  getOllamaConfigFromEnv,
} from "@/lib/validations/ai-provider";

const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";

export type { AiProvider, AiRuntimeStatus, OllamaConfig };

type GeminiConfig = {
  apiKey: string;
  model: string;
};

export function getAiProvider(): AiProvider {
  return getAiProviderFromEnv();
}

function readGeminiConfig(): GeminiConfig {
  const apiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim() || "";
  const model = getGeminiModel();

  if (!apiKey) {
    throw new Error("Gemini is not configured. Set GEMINI_API_KEY on the server.");
  }

  return { apiKey, model };
}

export function getOllamaConfig(): OllamaConfig {
  return getOllamaConfigFromEnv();
}

export function getGeminiModel() {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}

export function getDefaultGeminiModel() {
  return DEFAULT_GEMINI_MODEL;
}

export function hasGeminiConfig() {
  return Boolean(process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim());
}

export function hasOllamaConfig() {
  return Boolean(process.env.OLLAMA_BASE_URL?.trim() || process.env.OLLAMA_MODEL?.trim());
}

export function hasAiConfig() {
  const provider = getAiProvider();
  if (provider === "ollama") return true;
  return hasGeminiConfig();
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

function logAiError(context: string, error: unknown) {
  console.error(`[ai] ${context}`, {
    name: error instanceof Error ? error.name : "ProviderError",
    message: safeProviderMessage(error),
  });
}

function isModelAvailabilityError(error: unknown) {
  return /model.*(?:not found|not available|unsupported|deprecated|no longer available)|404.*model/i.test(safeProviderMessage(error));
}

function classifyGeminiError(error: unknown): Pick<AiRuntimeStatus, "code" | "message"> {
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

export type GenerateTextOptions = Pick<GenerateContentConfig, "responseMimeType" | "responseSchema" | "temperature" | "seed"> & {
  provider?: AiProvider;
  ollamaConfig?: Partial<OllamaConfig>;
  timeoutMs?: number;
};

async function generateWithGeminiModel(client: GoogleGenAI, model: string, prompt: string, options?: GenerateTextOptions) {
  const { temperature: _temperature, provider: _provider, ollamaConfig: _ollamaConfig, timeoutMs: _timeoutMs, ...supportedOptions } = options ?? {};
  void _temperature; void _provider; void _ollamaConfig; void _timeoutMs;

  const response = await client.models.generateContent({
    model,
    contents: prompt,
    config: supportedOptions,
  });
  const text = response.text?.trim();
  if (!text) throw new Error("Gemini returned an empty response.");
  return text;
}

export async function generateTextOllama(
  prompt: string,
  options?: GenerateTextOptions,
  configOverride?: Partial<OllamaConfig>
): Promise<string> {
  assertServerRuntime();
  const defaultConfig = getOllamaConfig();
  const baseUrl = (configOverride?.baseUrl ?? defaultConfig.baseUrl).replace(/\/+$/, "");
  const model = configOverride?.model ?? defaultConfig.model;
  const timeoutMs = options?.timeoutMs ?? 30000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const payload = buildOllamaGeneratePayload(prompt, model, options);

    const res = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      if (res.status === 404) {
        throw new Error(`Model ${model} not found on Ollama server.`);
      }
      throw new Error(`Ollama API error ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as { response?: string };
    const text = data.response?.trim();
    if (!text) throw new Error("Ollama returned an empty response.");
    return text;
  } catch (error) {
    logAiError("generateTextOllama failed", error);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function generateText(prompt: string, options?: GenerateTextOptions) {
  assertServerRuntime();
  const normalizedPrompt = prompt.trim();
  if (!normalizedPrompt) throw new Error("AI prompt is required.");

  const provider = options?.provider ?? getAiProvider();

  if (provider === "ollama") {
    return generateTextOllama(normalizedPrompt, options, options?.ollamaConfig);
  }

  const { model } = readGeminiConfig();
  const client = getGeminiClient();

  try {
    return await generateWithGeminiModel(client, model, normalizedPrompt, options);
  } catch (error) {
    if (model !== DEFAULT_GEMINI_MODEL && isModelAvailabilityError(error)) {
      console.warn("[ai] configured Gemini model unavailable; retrying stable fallback", { model, fallback: DEFAULT_GEMINI_MODEL });
      try {
        return await generateWithGeminiModel(client, DEFAULT_GEMINI_MODEL, normalizedPrompt, options);
      } catch (fallbackError) {
        logAiError("fallback generateText failed", fallbackError);
        throw new Error("Unable to generate text with Gemini.");
      }
    }
    logAiError("generateText failed", error);
    throw new Error("Unable to generate text with Gemini.");
  }
}

export async function testOllamaConnection(configOverride?: Partial<OllamaConfig>): Promise<AiRuntimeStatus> {
  assertServerRuntime();
  const defaultConfig = getOllamaConfig();
  const baseUrl = (configOverride?.baseUrl ?? defaultConfig.baseUrl).replace(/\/+$/, "");
  const model = configOverride?.model ?? defaultConfig.model;

  try {
    const text = await generateTextOllama("Reply OK", { responseMimeType: undefined, timeoutMs: 5000 }, { baseUrl, model });
    if (!text) {
      return { provider: "ollama", configured: true, model, ok: false, code: "provider", message: "Ollama returned empty output." };
    }
    return { provider: "ollama", configured: true, model, ok: true, code: "ok", message: "Ollama sunucu bağlantısı başarılı." };
  } catch (error) {
    const classified = classifyOllamaError(error);
    return { provider: "ollama", configured: true, model, ok: false, ...classified };
  }
}

export async function testGeminiConnection(): Promise<AiRuntimeStatus> {
  assertServerRuntime();
  const model = getGeminiModel();
  if (!hasGeminiConfig()) {
    return { provider: "gemini", configured: false, model, ok: false, code: "missing_key", message: "GEMINI_API_KEY production ortamında tanımlı değil." };
  }

  try {
    const text = await generateText("Yanıt olarak yalnızca OK yaz.", { provider: "gemini", temperature: 0, seed: 1 });
    if (!/^OK[.!]?$/i.test(text.trim())) {
      return { provider: "gemini", configured: true, model, ok: false, code: "provider", message: "Gemini yanıt verdi ancak bağlantı testi beklenen doğrulama yanıtını üretmedi." };
    }
    return { provider: "gemini", configured: true, model, ok: true, code: "ok", message: "Gemini production bağlantısı çalışıyor." };
  } catch (error) {
    const classified = classifyGeminiError(error);
    return { provider: "gemini", configured: true, model, ok: false, ...classified };
  }
}

export async function testAiConnection(providerOverride?: AiProvider): Promise<AiRuntimeStatus> {
  const provider = providerOverride ?? getAiProvider();
  if (provider === "ollama") {
    return testOllamaConnection();
  }
  return testGeminiConnection();
}
