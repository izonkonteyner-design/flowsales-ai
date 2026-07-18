import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testsDir = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(testsDir, "..", "supabase", "migrations", "0015_ai_usage_tracking.sql");
const routePath = join(testsDir, "..", "app", "api", "quotes", "ai-draft", "route.ts");
const servicePath = join(testsDir, "..", "server", "services", "ai-usage.ts");
const migration = readFileSync(migrationPath, "utf8");
const routeSource = readFileSync(routePath, "utf8");
const serviceSource = readFileSync(servicePath, "utf8");

test("ai usage migration defines durable org-scoped tracking and read-only client access", () => {
  assert.match(migration, /create table if not exists public\.ai_usage_events/i);
  assert.match(migration, /feature text not null default 'quote_draft' check \(feature = 'quote_draft'\)/i);
  assert.match(migration, /provider text not null default 'gemini' check \(provider = 'gemini'\)/i);
  assert.match(migration, /status text not null default 'pending' check \(status in \('pending', 'succeeded', 'failed'\)\)/i);
  assert.match(migration, /alter table public\.ai_usage_events enable row level security/i);
  assert.match(migration, /create policy "members can read organization AI usage"/i);
  assert.match(migration, /using \(public\.is_org_member\(organization_id\)\)/i);
  assert.doesNotMatch(migration, /for insert on public\.ai_usage_events/i);
  assert.match(migration, /create index if not exists ai_usage_events_organization_created_idx/i);
  assert.match(migration, /create index if not exists ai_usage_events_user_created_idx/i);
  assert.match(migration, /create index if not exists ai_usage_events_organization_feature_created_idx/i);
});

test("ai usage reservation rpc is security definer and enforces the effective limit atomically", () => {
  assert.match(migration, /create or replace function public\.reserve_quote_ai_usage\(target_org uuid, target_model text default null\)/i);
  assert.match(migration, /returns table \(/i);
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = public/i);
  assert.match(migration, /perform 1[\s\S]*for update;/i);
  assert.match(migration, /least\(/i);
  assert.match(migration, /count\(\*\)/i);
  assert.match(migration, /status in \('pending', 'succeeded', 'failed'\)/i);
  assert.match(migration, /insert into public\.ai_usage_events/i);
  assert.match(migration, /remaining_usage := greatest\(effective_limit - usage_count - 1, 0\);/i);
  assert.match(migration, /revoke all on function public\.reserve_quote_ai_usage\(uuid, text\) from public;/i);
  assert.match(migration, /grant execute on function public\.reserve_quote_ai_usage\(uuid, text\) to authenticated;/i);
});

test("ai usage finalization rpc is security definer and server only", () => {
  assert.match(migration, /create or replace function public\.finalize_quote_ai_usage\(target_usage_event_id uuid, target_status text\)/i);
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = public/i);
  assert.match(migration, /update public\.ai_usage_events e/i);
  assert.match(migration, /where e\.id = target_usage_event_id/i);
  assert.match(migration, /and e\.user_id = current_user_id;/i);
  assert.match(migration, /revoke all on function public\.finalize_quote_ai_usage\(uuid, text\) from public;/i);
  assert.match(migration, /grant execute on function public\.finalize_quote_ai_usage\(uuid, text\) to authenticated;/i);
});

test("quote ai route reserves usage before Gemini and finalizes the event after the provider call", () => {
  assert.match(routeSource, /hasGeminiConfig\(\)/);
  assert.match(routeSource, /reserveQuoteAiUsage\(client, organization\.id\)/);
  assert.match(routeSource, /finalizeQuoteAiUsage\(client, usageEventId, "succeeded"\)/);
  assert.match(routeSource, /finalizeQuoteAiUsage\(client, usageEventId, "failed"\)/);
  assert.match(routeSource, /generateQuoteAiDraft\(input, \{/);
  assert.match(routeSource, /workspacePrompt: limits\.workspacePrompt/);
  assert.match(routeSource, /getQuoteAiPublicErrorMessage\(code\)/);
  assert.match(routeSource, /usage limit/i);
  assert.doesNotMatch(routeSource, /usageLimit\s*<=\s*0\s*\|\|\s*limits\.aiMessageLimit\s*<=\s*0/);
  assert.doesNotMatch(routeSource, /success:\s*false[\s\S]{0,120}message:\s*error\.message/);

  const reserveIndex = routeSource.indexOf("reserveQuoteAiUsage(client, organization.id)");
  const generateIndex = routeSource.indexOf("generateQuoteAiDraft(input, {");
  const successFinalizeIndex = routeSource.indexOf('finalizeQuoteAiUsage(client, usageEventId, "succeeded")');
  const configGuardIndex = routeSource.indexOf("hasGeminiConfig()");

  assert.ok(configGuardIndex !== -1 && reserveIndex !== -1 && generateIndex !== -1 && successFinalizeIndex !== -1);
  assert.ok(configGuardIndex < reserveIndex);
  assert.ok(reserveIndex < generateIndex);
  assert.ok(generateIndex < successFinalizeIndex);
});

test("ai usage helper keeps reservation and finalization responses server side", () => {
  assert.match(serviceSource, /getGeminiModel\(\)/);
  assert.match(serviceSource, /reserve_quote_ai_usage/);
  assert.match(serviceSource, /finalize_quote_ai_usage/);
  assert.match(serviceSource, /createQuoteAiServiceError\(code, status\)/);
  assert.doesNotMatch(serviceSource, /usageEventId.*browser/i);
});
