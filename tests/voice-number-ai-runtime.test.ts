import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("voice settings persist Turkcell public number separately from AI destination", async () => {
  const service = await source("server/services/voice-provider-settings.ts");
  const page = await source("app/(app)/settings/integrations/voice/page.tsx");
  assert.match(service, /provider: "call_forwarding"/);
  assert.match(service, /destinationNumber/);
  assert.match(service, /destinationProvider/);
  assert.match(service, /normalizeTurkishPhoneNumber/);
  assert.match(page, /Müşterilerin aradığı Turkcell numarası/);
  assert.match(page, /AI hedef numarası/);
  assert.match(page, /Turkcell numarası → operatör çağrı yönlendirmesi → AI hedef numarası → FlowSales Voice/);
  assert.doesNotMatch(page, /Telnyx telefon numarası<input/);
});

test("AI runtime reports real configuration and uses a current stable fallback", async () => {
  const ai = await source("server/services/ai.ts");
  const page = await source("app/(app)/ai/page.tsx");
  const action = await source("app/(app)/ai/actions.ts");
  assert.match(ai, /DEFAULT_GEMINI_MODEL = "gemini-3\.5-flash-lite"/);
  assert.match(ai, /testGeminiConnection/);
  assert.match(ai, /configured Gemini model unavailable; retrying stable fallback/);
  assert.match(ai, /\[REDACTED\]/);
  assert.match(page, /hasGeminiConfig/);
  assert.match(page, /YZ anahtarı eksik/);
  assert.match(page, /Production YZ bağlantısını test et/);
  assert.match(action, /Owner\/Admin/);
  assert.doesNotMatch(page, /<StatusBadge tone="success">YZ yapılandırıldı<\/StatusBadge>/);
});
