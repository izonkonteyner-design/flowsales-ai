import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getDeploymentEnvironmentStatus,
  normalizeDeploymentDatabaseStatus,
} from "../server/services/deployment-readiness";

const migration = new URL("../supabase/migrations/0022_deployment_manifest_probe.sql", import.meta.url);

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

function withEnv(values: Record<string, string | undefined>, run: () => void) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("deployment migration records ordered commercial migrations and stays service-role only", async () => {
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /deployment_migrations/i);
  assert.match(sql, /'0018'[\s\S]*'0019'[\s\S]*'0020'[\s\S]*'0021'[\s\S]*'0022'/i);
  assert.match(sql, /auth\.role\(\) <> 'service_role'/i);
  assert.match(sql, /revoke all on function public\.deployment_readiness\(\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.deployment_readiness\(\) to service_role/i);
});

test("deployment probe verifies required functions and tables", async () => {
  const sql = await readFile(migration, "utf8");
  for (const name of [
    "health_check",
    "join_demo_workspace",
    "check_demo_rate_limit",
    "can_review_ai_approvals",
    "check_workspace_entitlement",
    "record_ai_usage",
    "create_user_notification",
    "ai_runs",
    "billing_events",
    "account_lifecycle_requests",
  ]) {
    assert.match(sql, new RegExp(name, "i"));
  }
});

test("required environment supports documented fallback keys and reports no values", () => {
  withEnv(
    {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
      HEALTH_CHECK_SECRET: "health-key",
      NEXT_PUBLIC_SITE_URL: undefined,
      NEXT_PUBLIC_APP_URL: "https://app.example.com",
      VERCEL_URL: undefined,
      DEMO_USER_EMAIL: undefined,
      DEMO_USER_PASSWORD: undefined,
      DEMO_RATE_LIMIT_SECRET: undefined,
      GEMINI_API_KEY: undefined,
      BILLING_WEBHOOK_SECRET: undefined,
    },
    () => {
      const status = getDeploymentEnvironmentStatus();
      assert.equal(status.ready, true);
      assert.deepEqual(status.missingRequired, []);
      assert.equal(status.features.demo.configured, false);
      assert.equal(JSON.stringify(status).includes("service-key"), false);
      assert.equal(JSON.stringify(status).includes("health-key"), false);
    },
  );
});

test("database readiness fails closed on missing schema requirements", () => {
  assert.deepEqual(
    normalizeDeploymentDatabaseStatus({
      ready: true,
      latestMigration: "0021",
      requiredMigration: "0022",
      missingFunctions: [],
      missingTables: [],
    }),
    {
      ready: false,
      latestMigration: "0021",
      requiredMigration: "0022",
      missingFunctions: [],
      missingTables: [],
    },
  );
  assert.equal(normalizeDeploymentDatabaseStatus(null), null);
});

test("deployment endpoint is secret-gated, no-store and service-role backed", async () => {
  const route = await source("app/api/health/deployment/route.ts");
  assert.match(route, /isAuthorizedInternalHealthProbe/);
  assert.match(route, /allowInternalHealthProbe/);
  assert.match(route, /createSupabaseAdminClient/);
  assert.match(route, /client\.rpc\("deployment_readiness"\)/);
  assert.match(route, /no-store/);
  assert.match(route, /status: "error"[\s\S]*404/);
  assert.match(route, /requiredMigration: REQUIRED_DEPLOYMENT_MIGRATION/);
});
