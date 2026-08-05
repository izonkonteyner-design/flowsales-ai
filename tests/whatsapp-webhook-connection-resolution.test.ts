import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = () => readFile("server/repositories/supabase/whatsapp-connections.ts", "utf8");

test("webhook resolver considers WABA and phone identifiers together", async () => {
  const code = await source();
  assert.match(code, /waba_id\.eq\.\$\{safeWabaId\}/);
  assert.match(code, /phone_number_id\.eq\.\$\{safePhoneNumberId\}/);
  assert.match(code, /\.or\(identifierFilters\.join\(','\)\)/);
  assert.doesNotMatch(code, /if \(phoneNumberId\)[\s\S]{0,200}query = query\.eq\('phone_number_id'/);
});

test("webhook resolver validates provider identifiers before building filters", async () => {
  const code = await source();
  assert.match(code, /\^\\d\{1,64\}\$/);
  assert.match(code, /if \(!safeWabaId && !safePhoneNumberId\)/);
});

test("webhook resolver fails closed on ambiguous cross-workspace matches", async () => {
  const code = await source();
  assert.match(code, /if \(data\.length !== 1\)/);
  assert.match(code, /ambiguous_active_webhook_connection/);
  assert.match(code, /throw new Error\('Ambiguous active WhatsApp connection for webhook\.'\)/);
});
