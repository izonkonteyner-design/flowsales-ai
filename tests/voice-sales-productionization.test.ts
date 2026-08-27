import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) { return readFile(new URL(`../${path}`, import.meta.url), "utf8"); }

test("Voice Sales migration persists trusted locations, calls, transcripts and handoffs with RLS", async () => {
  const sql = await source("supabase/migrations/0047_voice_sales_v1.sql");
  for (const table of ["business_locations", "sales_sessions", "voice_calls", "voice_transcript_segments", "voice_call_events", "voice_handoffs", "voice_after_call_actions"]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, "i"));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(sql, /resolve_voice_phone_identity/);
  assert.match(sql, /0047_voice_sales_v1\.sql/);
  assert.doesNotMatch(sql, /audio_blob|recording_blob|raw_audio/i);
});

test("phone price and showroom truth fail closed instead of hallucinating", async () => {
  const service = await source("server/services/voice-sales-v1.ts");
  const pricing = await source("server/services/sales-tools/pricing.ts");
  const locations = await source("server/services/business-locations.ts");
  assert.match(service, /getCurrentTrustedProductPrice/);
  assert.match(service, /assertSpokenPriceMatchesTrustedSource/);
  assert.match(service, /getTrustedShowroom/);
  assert.match(pricing, /TrustedPriceUnavailableError|assertSpokenPriceMatchesTrustedSource/);
  assert.match(locations, /business_locations/);
});

test("missed opportunities are explicit, advisory and never auto-send", async () => {
  const service = await source("server/services/missed-opportunities.ts");
  const page = await source("app/(app)/opportunities/missed/page.tsx");
  assert.match(service, /follow_up_missed/);
  assert.match(service, /high_intent_idle/);
  assert.match(service, /quote_stage_idle/);
  assert.match(page, /otomatik mesaj göndermez/);
  assert.doesNotMatch(service, /sendOutboundReply|sendMetaMessagingReply|\.update\("leads"/);
});

test("Customer 360 unifies phone, CRM activity and Conversation Intelligence", async () => {
  const service = await source("server/services/customer-360.ts");
  const page = await source("app/(app)/customers/[id]/page.tsx");
  assert.match(service, /voice_calls/);
  assert.match(service, /activities/);
  assert.match(service, /conversation_ai_qualifications/);
  assert.match(service, /AI telefon görüşmesi/);
  assert.match(page, /Customer 360 zaman çizelgesi/);
  assert.match(page, /event\.kind === "phone"/);
});

test("manager cockpit combines forecast, pipeline, win loss, missed opportunities and phone metrics", async () => {
  const service = await source("server/services/manager-sales-cockpit.ts");
  const page = await source("app/(app)/sales-cockpit/page.tsx");
  assert.match(service, /getPipelineIntelligence/);
  assert.match(service, /getSalesForecast/);
  assert.match(service, /getWinLossIntelligence/);
  assert.match(service, /listMissedOpportunities/);
  assert.match(service, /voice_calls/);
  assert.match(page, /Manager Sales Cockpit/);
});

test("public homepage, marketing shell, customer 360 and 404 are Turkish-first", async () => {
  const pages = [
    await source("app/(marketing)/page.tsx"),
    await source("app/(marketing)/layout.tsx"),
    await source("app/not-found.tsx"),
    await source("app/(app)/customers/[id]/page.tsx"),
  ];
  const banned = [
    /Your AI sales employee/i,
    />Pricing</i,
    />Sign In</i,
    /Page not found/i,
    /Back to dashboard/i,
    /Customer not found/i,
    /Create quote/i,
    /Back to customers/i,
    /No related quotes yet/i,
  ];
  for (const page of pages) for (const pattern of banned) assert.doesNotMatch(page, pattern);
});

test("release gate requires 0053 and verifies Voice Sales plus sales operations schema", async () => {
  const workflow = await source(".github/workflows/supabase-production-migrate.yml");
  const readiness = await source("server/services/deployment-readiness.ts");
  assert.match(readiness, /REQUIRED_DEPLOYMENT_MIGRATION = "0053"/);
  assert.match(workflow, /Apply and verify migrations through 0053/);
  assert.match(workflow, /test "\$latest" = "0053"/);
  for (const token of ["voice_calls", "sales_callback_queue", "lead_intent_history", "sales_sequence_templates", "quote_follow_up_state", "sales_sla_policies", "quote_discount_approvals", "quote_versions", "pipeline_snapshots"]) assert.match(workflow, new RegExp(token));
});

test("Twilio completion callback closes calls, resolves identity and finalizes CRM intelligence idempotently", async () => {
  const route = await source("app/api/webhooks/voice/twilio/status/route.ts");
  assert.match(route, /x-twilio-signature/);
  assert.match(route, /CallStatus/);
  assert.match(route, /CallDuration/);
  assert.match(route, /resolveIdentity/);
  assert.match(route, /finalizeCallIntelligence/);
  assert.match(route, /phone_ai_qualification/);
  assert.match(route, /state: \"completed\"/);
  assert.match(route, /duration_seconds/);
  assert.match(route, /voice_call_events/);
});

test("Twilio Trial completion callback uses the trial secret and finalizes the same CRM lifecycle", async () => {
  const route = await source("app/api/webhooks/voice/twilio/trial/status/route.ts");
  assert.match(route, /TWILIO_TRIAL_WEBHOOK_SECRET/);
  assert.match(route, /CallStatus/);
  assert.match(route, /CallDuration/);
  assert.match(route, /resolveIdentity/);
  assert.match(route, /finalizeCallIntelligence/);
  assert.match(route, /phone_ai_qualification/);
  assert.match(route, /state: \"completed\"/);
});
