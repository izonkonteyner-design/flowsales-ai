import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) { return readFile(new URL(`../${path}`, import.meta.url), "utf8"); }

test("0041 adds tenant-scoped intelligence and human-approved follow-up schema", async () => {
  const sql = await source("supabase/migrations/0041_omnichannel_growth_v2.sql");
  assert.match(sql, /create table if not exists public\.conversation_intelligence/i);
  assert.match(sql, /qualification_score[\s\S]*between 0 and 100/i);
  assert.match(sql, /create table if not exists public\.sales_follow_up_plans/i);
  assert.match(sql, /create table if not exists public\.sales_follow_up_steps/i);
  assert.match(sql, /requires_human_approval boolean not null default true/i);
  assert.match(sql, /organization_id/i);
  assert.match(sql, /values \('0041', 'omnichannel_growth_v2'\)/i);
});

test("Instagram and Messenger webhook is signed, fail-closed and idempotent", async () => {
  const route = await source("app/api/webhooks/meta/messaging/route.ts");
  const service = await source("server/services/integrations/meta-messaging.ts");
  assert.match(route, /x-hub-signature-256/);
  assert.match(route, /timingSafeEqual/);
  assert.match(route, /unknown_asset/);
  assert.match(route, /23505/);
  assert.match(service, /provider: MetaMessagingProvider/);
  assert.match(service, /object === "instagram"/);
  assert.match(service, /object === "page"/);
  assert.match(service, /never guess tenant/i);
});

test("Meta self-service selection encrypts credentials and requires explicit asset choice", async () => {
  const callback = await source("app/api/integrations/meta/callback/route.ts");
  const selection = await source("server/services/integrations/meta-asset-selection.ts");
  const page = await source("app/(app)/settings/integrations/meta-assets/page.tsx");
  assert.match(callback, /encryptToken\(exchanged\.accessToken\)/);
  assert.match(callback, /meta-assets\?provider=/);
  assert.match(selection, /The selected Meta asset is not available/);
  assert.match(page, /only connects the asset you explicitly select/i);
  assert.doesNotMatch(page, /access_token_cipher/);
});

test("unified outbound dispatch preserves WhatsApp policy and routes IG\/FB separately", async () => {
  const dispatcher = await source("server/services/integrations/omnichannel-outbound.ts");
  const api = await source("app/api/inbox/conversations/[conversationId]/reply/route.ts");
  const item = await source("components/inbox/conversation-item.tsx");
  assert.match(dispatcher, /WhatsAppOutboundService/);
  assert.match(dispatcher, /sendMetaMessagingText/);
  assert.match(dispatcher, /\["instagram", "facebook"\]/);
  assert.match(api, /sendOmnichannelReply/);
  assert.match(item, /instagram: "IG"/);
  assert.match(item, /facebook: "FB"/);
});

test("AI qualification is advisory and evidence-bound", async () => {
  const service = await source("server/services/conversation-intelligence.ts");
  const route = await source("app/api/inbox/conversations/[conversationId]/intelligence/route.ts");
  assert.match(service, /Never invent budget, authority, timing, product fit, identity, pricing or commitments/);
  assert.match(service, /advisory only/i);
  assert.match(service, /review_status: "suggested"/);
  assert.match(route, /autoExecuted: false/);
});

test("follow-up engine cannot auto-send and requires human approval", async () => {
  const service = await source("server/services/sales-follow-up-engine.ts");
  const route = await source("app/api/inbox/conversations/[conversationId]/follow-ups/route.ts");
  assert.match(service, /requires_human_approval: true/);
  assert.match(service, /Approval never sends a customer message/);
  assert.match(service, /autoSent: false/);
  assert.match(route, /autoSend: false/);
});

test("deployment readiness and production migration workflow advance to 0041", async () => {
  const readiness = await source("server/services/deployment-readiness.ts");
  const workflow = await source(".github/workflows/supabase-production-migrate.yml");
  assert.match(readiness, /REQUIRED_DEPLOYMENT_MIGRATION = "0041"/);
  assert.match(workflow, /through 0041/);
  assert.match(workflow, /test "\$latest" = "0041"/);
  assert.match(workflow, /conversation_intelligence/);
  assert.match(workflow, /sales_follow_up_steps/);
});
