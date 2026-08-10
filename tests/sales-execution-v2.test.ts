import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) { return readFile(new URL(`../${path}`, import.meta.url), "utf8"); }

test("smart follow-up queue ranks by score stage priority and overdue work", async () => {
  const service = await source("server/services/sales-execution-v2.ts");
  const page = await source("app/(app)/follow-ups/page.tsx");
  assert.match(service, /PRIORITY_WEIGHT/);
  assert.match(service, /STAGE_WEIGHT/);
  assert.match(service, /overdueHours/);
  assert.match(service, /rankScore/);
  assert.match(service, /assigned_user_id\.eq\.\$\{userId\},assigned_user_id\.is\.null/);
  assert.match(page, /Akıllı takip kuyruğu/);
  assert.match(page, /listSalesExecutionPriorities/);
});

test("dashboard exposes today's top sales priorities", async () => {
  const dashboard = await source("app/(app)/dashboard/page.tsx");
  const priorities = await source("components/dashboard/todays-priorities.tsx");
  assert.match(dashboard, /TodaysPriorities/);
  assert.match(priorities, /Bugünün öncelikleri/);
  assert.match(priorities, /limit: 5/);
  assert.match(priorities, /\/follow-ups/);
});

test("CRM intelligence sync is explicit human-approved and audited", async () => {
  const service = await source("server/services/sales-execution-v2.ts");
  const route = await source("app/api/inbox/conversations/[conversationId]/crm-sync/route.ts");
  const panel = await source("components/inbox/conversation-intelligence-panel.tsx");
  assert.match(service, /qualification\.status !== "accepted"/);
  assert.match(service, /ai_crm_suggestion_applied/);
  assert.match(service, /\.eq\("organization_id", params\.organizationId\)/);
  assert.match(route, /ctx\.mode === "demo" \|\| ctx\.role === "viewer"/);
  assert.match(panel, /CRM önerilerini lead'e uygula/);
  assert.doesNotMatch(service, /status:\s*qualification\.sales_stage/);
});

test("next best action provides one-click bridges without automatic customer send", async () => {
  const panel = await source("components/inbox/conversation-intelligence-panel.tsx");
  assert.match(panel, /Aksiyona geç/);
  assert.match(panel, /flowsales:generate-reply/);
  assert.match(panel, /\/quotes\/new\?lead_id=/);
  assert.match(panel, /createPlan\(\)/);
  assert.doesNotMatch(panel, /sendMetaMessagingReply|sendOutboundReply/);
});

test("AI Reply Copilot 2.0 uses conversation intelligence and CRM context but remains draft-only", async () => {
  const service = await source("server/services/integrations/whatsapp-ai-suggestion.ts");
  const component = await source("components/inbox/ai-reply-suggestion.tsx");
  const route = await source("app/api/inbox/conversations/[conversationId]/ai-suggestion/route.ts");
  assert.match(service, /FlowSales AI Reply Copilot 2\.0/);
  assert.match(service, /conversation_ai_qualifications/);
  assert.match(service, /Sales intelligence context/);
  assert.match(service, /A human must review and explicitly send it/);
  assert.match(service, /contextVersion: "copilot-2\.0"/);
  assert.match(component, /AI Reply Copilot 2\.0/);
  assert.match(component, /flowsales:generate-reply/);
  assert.match(route, /requiresHumanSend: true/);
  assert.doesNotMatch(service, /sendMetaMessagingReply|sendOutboundReply/);
});
