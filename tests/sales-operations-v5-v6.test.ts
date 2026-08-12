import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) { return readFile(new URL(`../${path}`, import.meta.url), "utf8"); }

test("0048 persists callback, call intelligence, intent, sequence, quote tracking and automation drafts with RLS", async () => {
  const sql = await source("supabase/migrations/0048_sales_operations_v5.sql");
  const tables = ["sales_callback_queue","sales_call_dispositions","sales_objection_library","lead_intent_history","sales_sequence_templates","sales_sequence_steps","sales_sequence_enrollments","quote_follow_up_state","sales_automation_drafts"];
  for (const table of tables) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, "i"));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(sql, /0048_sales_operations_v5\.sql/);
  assert.match(sql, /dedupe_key text/);
  assert.match(sql, /sales_automation_drafts_dedupe_idx/);
  assert.match(sql, /lead_intent_history_dedupe_idx/);
  assert.match(sql, /automation_draft_id/);
  assert.match(sql, /tasks_automation_draft_id_idx/);
});

test("sales operations engine implements callback, disposition, objections, buying signals, score explanation, decay and funnel", async () => {
  const service = await source("server/services/sales-operations-v5.ts");
  for (const symbol of ["enqueueCallback","saveCallDisposition","detectCallReason","detectObjections","detectBuyingSignals","explainLeadScore","applyLeadScoreDecay","recordLeadIntent","createFollowUpSequence","materializeDueSequenceSteps","calculateDealRisk","getRevenueLeakage","getSalesFunnel","answerSalesAnalystQuestion"]) assert.match(service, new RegExp(symbol));
  assert.match(service, /dedupeKey/);
  assert.match(service, /23505/);
  assert.match(service, /quote_follow_up_state/);
});

test("completed voice calls feed disposition and intent without auto-sending customer messages", async () => {
  const route = await source("app/api/webhooks/voice/telnyx/route.ts");
  const processor = await source("server/services/voice-sales-postprocessor-v5.ts");
  assert.match(route, /postProcessCompletedVoiceCall/);
  assert.match(processor, /sales_call_dispositions/);
  assert.match(processor, /lead_intent_history/);
  assert.match(processor, /createAutomationDraft/);
  assert.doesNotMatch(processor, /sendOutboundReply|sendMetaMessagingReply|sendMessage/);
});

test("scheduler is approval-safe, retry-safe, data-grounded and emits alerts", async () => {
  const runner = await source("server/services/sales-automation-runner-v5.ts");
  const cron = await source("app/api/cron/sales-automation/route.ts");
  const vercel = await source("vercel.json");
  assert.match(runner, /refreshQuoteFollowUpState/);
  assert.match(runner, /materializeApprovedAutomationDrafts/);
  assert.match(runner, /materializeDueSequenceStepsSafely/);
  assert.match(runner, /applyDailyIntentDecay/);
  assert.match(runner, /createSalesHealthAlerts/);
  assert.match(runner, /scheduled_for"?, null|scheduled_for\", null|\.is\("scheduled_for", null\)/);
  assert.match(runner, /automation_draft_id/);
  assert.match(runner, /dedupe_key/);
  assert.match(runner, /23505/);
  assert.match(runner, /direction", "inbound"/);
  assert.match(runner, /lead_intent_history/);
  assert.match(runner, /sales_call_dispositions/);
  assert.match(cron, /CRON_SECRET/);
  assert.match(cron, /Authorization|authorization/);
  assert.match(cron, /\.range\(/);
  assert.match(cron, /ORGANIZATION_PAGE_SIZE/);
  assert.match(vercel, /0 5 \* \* \*/);
});

test("callback UX uses selectable leads instead of manual UUID entry", async () => {
  const page = await source("app/(app)/sales-operations/callbacks/page.tsx");
  assert.match(page, /<select name="leadId"/);
  assert.match(page, /Lead seçin/);
  assert.doesNotMatch(page, /placeholder="Lead UUID"/);
});

test("0049 persists trusted cost, SLA, routing, approvals, versions, growth and forecast with RLS", async () => {
  const sql = await source("supabase/migrations/0049_sales_growth_v6.sql");
  assert.match(sql, /add column if not exists unit_cost/);
  assert.match(sql, /add column if not exists cost_snapshot/);
  const tables = ["sales_sla_policies","sales_routing_rules","quote_discount_approvals","quote_versions","sales_growth_opportunities","pipeline_snapshots"];
  for (const table of tables) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, "i"));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(sql, /0049_sales_growth_v6\.sql/);
});

test("growth engine covers SLA, workload, routing, duplicates, hygiene, margin, product fit, delivery, growth and forecast", async () => {
  const service = await source("server/services/sales-growth-v6.ts");
  for (const symbol of ["getSlaBreaches","getRepWorkload","suggestLeadRouting","detectDuplicateLeads","calculateLeadCompleteness","getDataHygieneReport","getQuoteMarginGuard","requestDiscountApproval","getProductFitRecommendations","checkDeliveryRegionFit","snapshotQuoteVersion","detectGrowthOpportunities","calculateForecastConfidence","persistWeeklyPipelineSnapshot"]) assert.match(service, new RegExp(symbol));
  assert.match(service, /Maliyet verisi eksik; marj doğrulanamıyor/);
});

test("user-facing surfaces expose sales operations, command shortcut, analyst, growth, quote governance and forecast", async () => {
  const files = await Promise.all([
    source("app/(app)/sales-operations/page.tsx"),
    source("app/(app)/command-center/page.tsx"),
    source("components/shared/global-command-shortcut.tsx"),
    source("app/(app)/sales-analyst/page.tsx"),
    source("app/(app)/growth-control/page.tsx"),
    source("app/(app)/growth-control/quote-governance/page.tsx"),
    source("app/(app)/growth-control/forecast/page.tsx"),
    source("app/(app)/leads/[id]/intelligence/page.tsx"),
  ]);
  const joined = files.join("\n");
  for (const token of ["Satış Operasyon Merkezi","Komuta Merkezi","AI Satış Analisti","Büyüme Kontrol Merkezi","Teklif Yönetişimi","Forecast Güveni","Lead Intelligence"]) assert.match(joined, new RegExp(token));
  assert.match(joined, /ctrlKey|metaKey/);
});

test("release gate 3.0 requires and verifies migration 0052", async () => {
  const readiness = await source("server/services/deployment-readiness.ts");
  const workflow = await source(".github/workflows/supabase-production-migrate.yml");
  assert.match(readiness, /REQUIRED_DEPLOYMENT_MIGRATION = "0052"/);
  assert.match(readiness, /sales-automation/);
  assert.match(workflow, /through 0052/);
  assert.match(workflow, /unit_cost/);
  assert.match(workflow, /cost_snapshot/);
});
