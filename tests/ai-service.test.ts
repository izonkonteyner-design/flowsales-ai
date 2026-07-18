import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

import { GET } from "@/app/api/ai/test/route";

const testsDir = dirname(fileURLToPath(import.meta.url));
const servicePath = join(testsDir, "..", "server", "services", "ai.ts");
const routePath = join(testsDir, "..", "app", "api", "ai", "test", "route.ts");
const serviceSource = readFileSync(servicePath, "utf8");
const routeSource = readFileSync(routePath, "utf8");

async function withNodeEnv<T>(value: string, fn: () => Promise<T> | T): Promise<T> {
  const original = process.env.NODE_ENV;
  Object.defineProperty(process.env, "NODE_ENV", {
    value,
    configurable: true,
    writable: true,
    enumerable: true,
  });

  try {
    return await fn();
  } finally {
    Object.defineProperty(process.env, "NODE_ENV", {
      value: original,
      configurable: true,
      writable: true,
      enumerable: true,
    });
  }
}

test("gemini service is server only and reads configured env vars", () => {
  assert.match(serviceSource, /import "server-only";/);
  assert.match(serviceSource, /Gemini service can only run on the server\./);
  assert.match(serviceSource, /GEMINI_API_KEY/);
  assert.match(serviceSource, /GEMINI_MODEL/);
  assert.match(serviceSource, /export function getGeminiClient\(\)/);
  assert.match(serviceSource, /export async function generateText\(prompt: string\)/);
  assert.match(serviceSource, /Gemini is not configured\. Set GEMINI_API_KEY and GEMINI_MODEL on the server\./);
  assert.match(serviceSource, /Unable to generate text with Gemini\./);
  assert.doesNotMatch(serviceSource, /GEMINI_API_KEY=.*\$\{/);
  assert.doesNotMatch(serviceSource, /GEMINI_MODEL=.*\$\{/);
});

test("gemini test route calls the configured prompt and returns safe json", () => {
  assert.match(routeSource, /process\.env\.NODE_ENV === "production"/);
  assert.match(routeSource, /AI connection testing is disabled in production\./);
  assert.match(routeSource, /Reply only with:\s*\\nGemini connection successful/);
  assert.match(routeSource, /success:\s*true/);
  assert.match(routeSource, /message,\s*\}\);/);
  assert.match(routeSource, /Unable to connect to Gemini\./);
  assert.match(routeSource, /await import\("@\/server\/services\/ai"\)/);
});

test("gemini test route returns 404 in production before calling Gemini", async () => {
  await withNodeEnv("production", async () => {
    const response = await GET();
    assert.equal(response.status, 404);

    const body = await response.json();
    assert.equal(body.success, false);
    assert.equal(body.message, "AI connection testing is disabled in production.");
  });
});
