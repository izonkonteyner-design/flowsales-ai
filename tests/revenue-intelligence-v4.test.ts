import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) { return readFile(new URL(`../${path}`, import.meta.url), "utf8"); }

test("follow-up automation v2 is risk-aware, draft-only and human controlled", async () => {
  const service = await source("server/services/revenue-intelligence-v4.ts");
  const page = await source("app/(app)/revenue-intelligence/page.tsx");
  assert.match(service, /listStaleOpportunities/);
  assert.match(service, /recommendedDelayHours/);
  assert.match(service, /generateFollowUpDraftV2/);
  assert.match(service, /Fiyat, indirim, stok, teslim tarihi veya ödeme koşulu uydurma/);
  assert.doesNotMatch(service, /sendMetaMessagingReply|sendOutboundReply|sendTemplateMessage/);
  assert.match(page, /Mesaj otomatik gönderilmez/);
  assert.match(page, /Copilot ile takip et/);
});

test("quote intelligence requires commercial review instead of inventing terms", async () => {
  const service = await source("server/services/revenue-intelligence-v4.ts");
  const page = await source("app/(app)/leads/[id]/quote-intelligence/page.tsx");
  assert.match(service, /productInterest/);
  assert.match(service, /missingInformation/);
  assert.match(service, /warnings/);
  assert.match(service, /needs_review/);
  assert.match(page, /Fiyat ve ticari koşullar kullanıcı onayı olmadan oluşturulmaz/);
  assert.match(page, /Ticari güvenlik kontrolü/);
  assert.match(page, /Teklif oluştur/);
});

test("win loss intelligence exposes outcome rate, value and loss reasons", async () => {
  const service = await source("server/services/revenue-intelligence-v4.ts");
  const page = await source("app/(app)/revenue-intelligence/page.tsx");
  assert.match(service, /getWinLossIntelligence/);
  assert.match(service, /winRate/);
  assert.match(service, /topLossReasons/);
  assert.match(service, /wonValue/);
  assert.match(service, /lostValue/);
  assert.match(page, /Win\/Loss Intelligence/);
  assert.match(page, /Kazanma oranı/);
});

test("forecast blends sales stage and lead score and separates commit upside and risk", async () => {
  const service = await source("server/services/revenue-intelligence-v4.ts");
  assert.match(service, /STAGE_PROBABILITY/);
  assert.match(service, /stageProbability \* 0\.6/);
  assert.match(service, /scoreProbability \* 0\.4/);
  assert.match(service, /weightedForecast/);
  assert.match(service, /commit/);
  assert.match(service, /upside/);
  assert.match(service, /risk/);
});

test("identity resolution is tenant scoped, exact-match based and never auto-merges", async () => {
  const service = await source("server/services/revenue-intelligence-v4.ts");
  const migration = await source("supabase/migrations/0046_lead_identity_guard.sql");
  const page = await source("app/(app)/revenue-intelligence/page.tsx");
  assert.match(service, /normalizeEmail/);
  assert.match(service, /normalizePhone/);
  assert.match(service, /confidence: "exact"/);
  assert.match(service, /\.eq\("organization_id", scope\.organizationId\)/);
  assert.doesNotMatch(service, /\.delete\(|\.update\(/);
  assert.match(migration, /before insert on public\.leads/);
  assert.match(migration, /guard_duplicate_lead_identity/);
  assert.match(migration, /0046_lead_identity_guard\.sql/);
  assert.match(page, /Birleştirme otomatik yapılmaz/);
});

test("revenue intelligence v4 surfaces are Turkish-first", async () => {
  const pages = [
    await source("app/(app)/revenue-intelligence/page.tsx"),
    await source("app/(app)/leads/[id]/quote-intelligence/page.tsx"),
  ];
  const banned = [/Lead not found/i,/Back to leads/i,/Create quote/i,/Quick actions/i,/Draft only/i,/Read only/i];
  for (const page of pages) for (const pattern of banned) assert.doesNotMatch(page, pattern);
});
