import { z } from "zod";

export const aiProviderSchema = z.enum(["gemini", "ollama"]);
export type AiProvider = z.infer<typeof aiProviderSchema>;

export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
export const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
export const DEFAULT_OLLAMA_MODEL = "llama3:latest";

export const ollamaConfigSchema = z.object({
  baseUrl: z.string().trim().min(1, "Ollama base URL is required"),
  model: z.string().trim().min(1, "Ollama model is required"),
});

export type OllamaConfig = z.infer<typeof ollamaConfigSchema>;

export const aiRuntimeStatusSchema = z.object({
  provider: aiProviderSchema,
  configured: z.boolean(),
  model: z.string(),
  ok: z.boolean(),
  code: z.enum(["ok", "missing_key", "auth", "quota", "model", "offline", "timeout", "provider"]),
  message: z.string(),
});

export type AiRuntimeStatus = z.infer<typeof aiRuntimeStatusSchema>;

export function getAiProviderFromEnv(env: Record<string, string | undefined> = process.env): AiProvider {
  const provider = env.AI_PROVIDER?.trim().toLowerCase();
  if (provider === "ollama") return "ollama";
  return "gemini";
}

export function getOllamaConfigFromEnv(env: Record<string, string | undefined> = process.env): OllamaConfig {
  const baseUrl = env.OLLAMA_BASE_URL?.trim() || DEFAULT_OLLAMA_BASE_URL;
  const model = env.OLLAMA_MODEL?.trim() || DEFAULT_OLLAMA_MODEL;
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    model,
  };
}

export function buildOllamaGeneratePayload(
  prompt: string,
  model: string,
  options?: { responseMimeType?: string }
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    model,
    prompt,
    stream: false,
  };

  if (options?.responseMimeType === "application/json") {
    payload.format = "json";
  }

  return payload;
}

export function classifyOllamaError(error: unknown): Pick<AiRuntimeStatus, "code" | "message"> {
  const message = error instanceof Error ? error.message : String(error);
  if (/abort|timeout/i.test(message)) {
    return { code: "timeout", message: "Ollama sunucusu yanıt vermedi (zaman aşımı)." };
  }
  if (/econnrefused|fetch failed|network|failed to fetch/i.test(message)) {
    return { code: "offline", message: "Ollama sunucusuna erişilemiyor (bağlantı reddedildi)." };
  }
  if (/not found|404/i.test(message)) {
    return { code: "model", message: "İstenen Ollama modeli bulunamadı." };
  }
  return { code: "provider", message: "Ollama bağlantı hatası oluştu." };
}
