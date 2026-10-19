import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { describe } from "node:test";
import assert from "node:assert/strict";

import {
  aiProviderSchema,
  getAiProviderFromEnv,
  getOllamaConfigFromEnv,
  buildOllamaGeneratePayload,
  classifyOllamaError,
} from "@/lib/validations/ai-provider";

const testsDir = dirname(fileURLToPath(import.meta.url));
const servicePath = join(testsDir, "..", "server", "services", "ai.ts");
const serviceSource = readFileSync(servicePath, "utf8");

describe("Ollama & AI Provider Abstraction Tests", () => {
  test("ai.ts contains provider abstraction, Gemini and Ollama adapters", () => {
    assert.match(serviceSource, /import "server-only";/);
    assert.match(serviceSource, /export function getAiProvider\(\)/);
    assert.match(serviceSource, /export function getOllamaConfig\(\)/);
    assert.match(serviceSource, /export async function generateTextOllama/);
    assert.match(serviceSource, /export async function testOllamaConnection/);
    assert.match(serviceSource, /export async function testAiConnection/);
    assert.match(serviceSource, /provider === "ollama"/);
  });

  test("aiProviderSchema validates supported provider types", () => {
    assert.equal(aiProviderSchema.parse("gemini"), "gemini");
    assert.equal(aiProviderSchema.parse("ollama"), "ollama");
    assert.throws(() => aiProviderSchema.parse("openai"));
  });

  test("getAiProviderFromEnv respects AI_PROVIDER env var", () => {
    assert.equal(getAiProviderFromEnv({}), "gemini");
    assert.equal(getAiProviderFromEnv({ AI_PROVIDER: "ollama" }), "ollama");
    assert.equal(getAiProviderFromEnv({ AI_PROVIDER: "gemini" }), "gemini");
    assert.equal(getAiProviderFromEnv({ AI_PROVIDER: "UNKNOWN" }), "gemini");
  });

  test("getOllamaConfigFromEnv returns defaults or custom env values", () => {
    const defaultConfig = getOllamaConfigFromEnv({});
    assert.equal(defaultConfig.baseUrl, "http://localhost:11434");
    assert.equal(defaultConfig.model, "llama3:latest");

    const customConfig = getOllamaConfigFromEnv({
      OLLAMA_BASE_URL: "http://127.0.0.1:11434/",
      OLLAMA_MODEL: "mistral:7b",
    });
    assert.equal(customConfig.baseUrl, "http://127.0.0.1:11434");
    assert.equal(customConfig.model, "mistral:7b");
  });

  test("buildOllamaGeneratePayload constructs correct API payload", () => {
    const defaultPayload = buildOllamaGeneratePayload("Prompt text", "llama3:latest");
    assert.deepEqual(defaultPayload, {
      model: "llama3:latest",
      prompt: "Prompt text",
      stream: false,
    });

    const jsonPayload = buildOllamaGeneratePayload("Score lead", "llama3:latest", {
      responseMimeType: "application/json",
    });
    assert.deepEqual(jsonPayload, {
      model: "llama3:latest",
      prompt: "Score lead",
      stream: false,
      format: "json",
    });
  });

  test("classifyOllamaError categorizes offline, timeout and model errors accurately", () => {
    assert.equal(classifyOllamaError(new Error("fetch failed: ECONNREFUSED")).code, "offline");
    assert.equal(classifyOllamaError(new Error("The operation was aborted due to timeout")).code, "timeout");
    assert.equal(classifyOllamaError(new Error("Model mistral:7b not found")).code, "model");
    assert.equal(classifyOllamaError(new Error("Unexpected server error")).code, "provider");
  });
});
