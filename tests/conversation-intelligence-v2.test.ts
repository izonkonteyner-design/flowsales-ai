import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) { return readFile(new URL(`../${path}`, import.meta.url), "utf8"); }

test("conversation intelligence v2 extracts structured evidence without autonomous CRM mutation", async () => {
  const service = await source("server/services/conversation-qualification.ts");
  assert.match(service, /salesStage/);
  assert.match(service, /missingInformation/);
  assert.match(service, /scoreEvidence/);
  assert.match(service, /nextBestActionType/);
  assert.match(service, /productInterest/);
  assert.match(service, /buyingSignals/);
  assert.match(service, /Never automatically mutate CRM stage/);
  assert.doesNotMatch(service, /\.from\("leads"\)\.update/);
  assert.doesNotMatch(service, /sendMetaMessagingReply|sendOutboundReply/);
});

test("lead score uses fixed application weights and deduplicated evidence factors", async () => {
  const service = await source("server/services/conversation-qualification.ts");
  assert.match(service, /const SCORE_WEIGHTS/);
  assert.match(service, /purchase_commitment:\s*30/);
  assert.match(service, /quote_requested:\s*20/);
  assert.match(service, /budget_known:\s*15/);
  assert.match(service, /explicit_objection:\s*-10/);
  assert.match(service, /low_intent:\s*-20/);
  assert.match(service, /function calculateScoreBreakdown/);
  assert.match(service, /seen\.has\(item\.factor\)/);
  assert.match(service, /SCORE_WEIGHTS\[item\.factor\]/);
  assert.match(service, /Math\.max\(0, Math\.min\(100/);
  assert.match(service, /Do not assign points\. FlowSales owns the fixed scoring weights/);
  assert.doesNotMatch(service, /points:\s*z\.number\(\).*min\(-30\)/);
});

test("conversation intelligence v2 persists sales signals and explainability", async () => {
  const migration = await source("supabase/migrations/0045_conversation_intelligence_v2.sql");
  const service = await source("server/services/conversation-qualification.ts");
  for (const column of ["sales_stage", "priority", "confidence", "signals", "missing_information", "score_breakdown", "next_best_action_type", "next_best_action_rationale"]) {
    assert.match(migration, new RegExp(column, "i"));
    assert.match(service, new RegExp(column, "i"));
  }
  assert.match(service, /prompt_version: "2026-08-10\.1"/);
  assert.match(migration, /values \('0045','0045_conversation_intelligence_v2\.sql'/i);
});

test("Inbox presents Turkish sales intelligence with score rationale and next best action", async () => {
  const panel = await source("components/inbox/conversation-intelligence-panel.tsx");
  assert.match(panel, /AI Conversation Intelligence 2\.0/);
  assert.match(panel, /Lead Score neden bu puan\?/);
  assert.match(panel, /Sonraki en iyi aksiyon/);
  assert.match(panel, /Satın alma sinyalleri/);
  assert.match(panel, /Eksik bilgiler/);
  assert.match(panel, /AI önerir; CRM değişikliği ve müşteri iletişimi insan onayı olmadan yapılmaz/);
  assert.match(panel, /toLocaleString\("tr-TR"\)/);
});
