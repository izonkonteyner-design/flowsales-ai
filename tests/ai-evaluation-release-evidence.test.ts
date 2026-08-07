import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("migration 0026 makes evaluation persistence idempotent and service-role ready", async () => {
  const sql = await source("supabase/migrations/0026_ai_evaluation_release_evidence.sql");
  assert.match(sql, /add column if not exists run_key text/i);
  assert.match(sql, /alter column run_key set not null/i);
  assert.match(sql, /create unique index if not exists ai_evaluation_runs_run_key_uidx/i);
  assert.match(sql, /v_required_version constant text := '0026'/i);
});

test("persistence script validates report and never uses browser credentials", async () => {
  const script = await source("scripts/persist-ai-evaluation.ts");
  assert.match(script, /reportSchema\.parse/);
  assert.match(script, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(script, /Authorization: `Bearer \$\{serviceRoleKey\}`/);
  assert.match(script, /on_conflict=run_key/);
  assert.match(script, /resolution=merge-duplicates/);
  assert.doesNotMatch(script, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY|ANON_KEY/);
  assert.doesNotMatch(script, /console\.log\([^\n]*serviceRoleKey/);
});

test("release persistence runs only after verified main push", async () => {
  const workflow = await source(".github/workflows/ci.yml");
  assert.match(workflow, /persist-ai-evaluation:/);
  assert.match(workflow, /needs: verify/);
  assert.match(workflow, /github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /actions\/download-artifact@v4/);
  assert.match(workflow, /npm run eval:ai:persist/);
});

test("production migration workflow preserves 0026 evidence and advances readiness to 0041", async () => {
  const workflow = await source(".github/workflows/supabase-production-migrate.yml");
  const readiness = await source("server/services/deployment-readiness.ts");
  assert.match(workflow, /Apply and verify migrations through 0041/);
  assert.match(workflow, /supabase\/migrations\/\*\*/);
  assert.match(workflow, /test "\$latest" = "0041"/);
  assert.match(workflow, /claim_webhook_event_for_reprocess/);
  assert.match(workflow, /conversation_intelligence/);
  assert.match(workflow, /sales_follow_up_steps/);
  assert.match(readiness, /REQUIRED_DEPLOYMENT_MIGRATION = "0041"/);
});
