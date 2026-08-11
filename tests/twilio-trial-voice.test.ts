import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Twilio voice webhook validates signed requests and routes speech to FlowSales AI", async () => {
  const route = await source("app/api/webhooks/voice/twilio/route.ts");
  assert.match(route, /TWILIO_AUTH_TOKEN/);
  assert.match(route, /x-twilio-signature/);
  assert.match(route, /createHmac\("sha1"/);
  assert.match(route, /SpeechResult/);
  assert.match(route, /language="tr-TR"/);
  assert.match(route, /orchestratePhoneTurn/);
  assert.match(route, /provider: "twilio"/);
  assert.match(route, /destinationNumber/);
  assert.match(route, /<Dial>/);
});

test("Twilio auth token is documented as a production secret", async () => {
  const env = await source(".env.example");
  assert.match(env, /TWILIO_AUTH_TOKEN=your-twilio-primary-auth-token/);
});
