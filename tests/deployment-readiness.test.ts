import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getDeploymentEnvironmentStatus, normalizeDeploymentDatabaseStatus } from "@/server/services/deployment-readiness";

async function source(path: string) { return readFile(new URL(`../${path}`, import.meta.url), "utf8"); }

async function withEnv(overrides: Record<string, string | undefined>, run: () => void | Promise<void>) {
  const previous = Object.fromEntries(Object.keys(overrides).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("required environment supports documented fallback keys and reports no values", async () => {
  await withEnv(
    {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
      HEALTH_CHECK_SECRET: "health-key",
      NEXT_PUBLIC_SITE_URL: undefined,
      NEXT_PUBLIC_APP_URL: "https://flowsales.example",
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

test("database readiness fails closed and stale database requirements cannot downgrade the 0042 app gate", () => {
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
      requiredMigration: "0042",
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
  assert.match(route, /no-store/);
});
