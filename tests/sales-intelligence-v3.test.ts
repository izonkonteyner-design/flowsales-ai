import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) { return readFile(new URL(`../${path}`, import.meta.url), "utf8"); }

test("lead score history keeps tenant isolation and computes score deltas", async () => {
  const service = await source("server/services/sales-intelligence-v3.ts");
  const page = await source("app/(app)/leads/[id]/score-history/page.tsx");
  assert.match(service, /\.eq\("organization_id", organizationId\)/);
  assert.match(service, /\.eq\("lead_id", leadId\)/);
  assert.match(service, /row\.score - previous/);
  assert.match(page, /Lead Score geçmişi/);
  assert.match(page, /Skor zaman çizelgesi/);
  assert.match(page, /Toplam skor değişimi/);
});

test("stale opportunity detection is stage-aware, overdue-aware and assignee scoped", async () => {
  const service = await source("server/services/sales-intelligence-v3.ts");
  const page = await source("app/(app)/opportunities/risk/page.tsx");
  assert.match(service, /quote_sent.*negotiation/);
  assert.match(service, /return 24/);
  assert.match(service, /return 48/);
  assert.match(service, /return 72/);
  assert.match(service, /followUpOverdue/);
  assert.match(service, /assigned_to\.eq\.\$\{params\.userId\},assigned_to\.is\.null/);
  assert.match(page, /Kaçan ve bekleyen fırsatlar/);
  assert.match(page, /Risk önceliği/);
  assert.match(page, /müşteri iletişimi otomatik yapılmaz/);
});

test("pipeline intelligence aggregates quality risk priority and estimated value", async () => {
  const service = await source("server/services/sales-intelligence-v3.ts");
  const component = await source("components/dashboard/pipeline-intelligence.tsx");
  const dashboard = await source("app/(app)/dashboard/page.tsx");
  assert.match(service, /averageScore/);
  assert.match(service, /highPriorityCount/);
  assert.match(service, /staleCount/);
  assert.match(service, /estimatedValue/);
  assert.match(component, /Pipeline Intelligence/);
  assert.match(component, /Ortalama Lead Score/);
  assert.match(component, /Riskli fırsat/);
  assert.match(dashboard, /<PipelineIntelligence \/>/);
});

test("sales intelligence v3 Turkish QA blocks user-facing English leakage on new surfaces", async () => {
  const paths = [
    "app/(app)/leads/[id]/score-history/page.tsx",
    "app/(app)/opportunities/risk/page.tsx",
    "components/dashboard/pipeline-intelligence.tsx",
  ];
  const banned = [
    /Lead not found/i,
    /Back to leads/i,
    /Create quote/i,
    /Quick actions/i,
    /No notes yet/i,
    /Not set/i,
    /Read only/i,
    /Copy for review/i,
    /Draft only/i,
  ];
  for (const path of paths) {
    const text = await source(path);
    for (const pattern of banned) assert.doesNotMatch(text, pattern, `${path} contains untranslated user-facing copy: ${pattern}`);
  }
});

test("sales intelligence v3 remains advisory and introduces no autonomous send or CRM stage mutation", async () => {
  const service = await source("server/services/sales-intelligence-v3.ts");
  const riskPage = await source("app/(app)/opportunities/risk/page.tsx");
  const pipeline = await source("components/dashboard/pipeline-intelligence.tsx");
  assert.doesNotMatch(service, /sendMetaMessagingReply|sendOutboundReply|sendTemplateMessage/);
  assert.doesNotMatch(service, /\.from\("leads"\)\.update/);
  assert.match(riskPage, /otomatik yapılmaz/);
  assert.match(pipeline, /otomatik değiştirilmez/);
});
