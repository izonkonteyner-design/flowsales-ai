import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) { return readFile(new URL(`../${path}`, import.meta.url), "utf8"); }

test("Instagram and Messenger OAuth never auto-select ambiguous accounts", async () => {
  const callback = await source("app/api/integrations/meta/callback/route.ts");
  const oauth = await source("server/services/integrations/meta-messaging-oauth.ts");
  assert.match(callback, /staged\.candidates\.length === 1/);
  assert.match(callback, /meta-select\?provider=/);
  assert.match(oauth, /selection_status: "candidate"/);
  assert.doesNotMatch(oauth, /accounts\[0\][^\n]*connected/);
  assert.match(oauth, /access_token_cipher: encryptToken/);
});

test("Meta messaging webhooks are signature verified and tenant resolution fails closed", async () => {
  const route = await source("app/api/webhooks/meta-messaging/route.ts");
  const service = await source("server/services/integrations/meta-messaging.ts");
  assert.match(route, /x-hub-signature-256/i);
  assert.match(route, /timingSafeEqual/);
  assert.match(service, /\.eq\("external_account_id", accountId\)/);
  assert.match(service, /if \(!data \|\| data\.length !== 1\) return null/);
  assert.doesNotMatch(service, /organization.*first|single.*owner/i);
});

test("Unified Inbox routes replies for WhatsApp Instagram and Facebook", async () => {
  const reply = await source("app/api/inbox/conversations/[conversationId]/reply/route.ts");
  const shell = await source("components/inbox/inbox-shell.tsx");
  assert.match(reply, /conversation\.provider === "whatsapp"/);
  assert.match(reply, /conversation\.provider === "instagram" \|\| conversation\.provider === "facebook"/);
  assert.match(reply, /sendMetaMessagingReply/);
  assert.match(shell, /\["whatsapp", "instagram", "facebook"\]/);
  assert.match(shell, /ConversationIntelligencePanel/);
});

test("AI qualification is evidence-backed and cannot auto-send or mutate CRM stage", async () => {
  const service = await source("server/services/conversation-qualification.ts");
  assert.match(service, /inputHash/);
  assert.match(service, /Never recommend automatically sending a customer message without human review/);
  assert.match(service, /status: "suggested"/);
  assert.doesNotMatch(service, /\.from\("leads"\)\.update/);
  assert.doesNotMatch(service, /\/messages.*method:\s*"POST"/);
});

test("follow-up engine is human-approved and has no customer send action", async () => {
  const migration = await source("supabase/migrations/0041_omnichannel_growth_v2.sql");
  const service = await source("server/services/sales-follow-up-engine.ts");
  assert.match(migration, /requires_human_approval boolean not null default true check \(requires_human_approval = true\)/i);
  assert.match(migration, /action_type in \('reply_draft','call','task','reminder'\)/i);
  assert.doesNotMatch(migration, /action_type[^\n]*send_message/i);
  assert.match(service, /Qualification must be accepted by a human/);
  assert.match(service, /Action must be explicitly approved before completion/);
  assert.doesNotMatch(service, /sendMetaMessagingReply|sendOutboundReply/);
});

test("deployment migration 0041 registers all growth v2 tables", async () => {
  const migration = await source("supabase/migrations/0041_omnichannel_growth_v2.sql");
  for (const table of ["omnichannel_audit_events", "conversation_ai_qualifications", "sales_follow_up_plans", "sales_follow_up_actions"]) assert.match(migration, new RegExp(table, "i"));
  assert.match(migration, /v_required_version constant text := '0041'/i);
  assert.match(migration, /values \('0041','0041_omnichannel_growth_v2\.sql'/i);
});
