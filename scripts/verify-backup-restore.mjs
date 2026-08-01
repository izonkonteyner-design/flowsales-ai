#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { spawn } from "node:child_process";

const REQUIRED_TABLES = [
  "organizations",
  "organization_members",
  "leads",
  "customers",
  "products",
  "quotes",
  "ai_runs",
  "ai_approval_requests",
  "import_jobs",
  "notifications",
  "deployment_migrations",
];

const REQUIRED_FUNCTIONS = [
  "health_check",
  "deployment_readiness",
  "create_ai_approval",
  "decide_ai_approval",
];

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function redactDatabaseUrl(value) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.hostname}:${url.port || "default"}/${url.pathname.replace(/^\//, "")}`;
  } catch {
    return "invalid-database-url";
  }
}

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    if (options.capture) {
      child.stdout.on("data", (chunk) => (stdout += chunk));
      child.stderr.on("data", (chunk) => (stderr += chunk));
    }

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) return resolvePromise({ stdout: stdout.trim(), stderr: stderr.trim() });
      reject(new Error(`${command} exited with code ${code}${stderr ? `: ${stderr.trim()}` : ""}`));
    });
  });
}

async function queryJson(databaseUrl, sql) {
  const { stdout } = await run("psql", [databaseUrl, "--no-psqlrc", "--tuples-only", "--no-align", "--command", sql], {
    capture: true,
  });
  return JSON.parse(stdout);
}

function assertSafeRestoreTarget(sourceUrl, restoreUrl) {
  if (sourceUrl === restoreUrl) throw new Error("Restore target must not equal the source database URL.");
  if (process.env.RESTORE_TARGET_ACK !== "NON_PRODUCTION") {
    throw new Error("Set RESTORE_TARGET_ACK=NON_PRODUCTION after confirming the restore target is disposable and non-production.");
  }

  const target = new URL(restoreUrl);
  const label = `${target.hostname}/${target.pathname}`.toLowerCase();
  if (!/(restore|staging|test|localhost|127\.0\.0\.1)/.test(label)) {
    throw new Error("Restore target hostname or database name must visibly identify a restore, staging, test, or local environment.");
  }
}

async function main() {
  const sourceUrl = requireEnv("SOURCE_DATABASE_URL");
  const restoreUrl = requireEnv("RESTORE_DATABASE_URL");
  assertSafeRestoreTarget(sourceUrl, restoreUrl);

  const outputDirectory = resolve(process.env.BACKUP_EVIDENCE_DIR || "backup-evidence");
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const dumpPath = resolve(outputDirectory, `flowsales-${runId}.dump`);
  const evidencePath = resolve(outputDirectory, `backup-restore-${runId}.json`);
  await mkdir(outputDirectory, { recursive: true });

  const startedAt = new Date().toISOString();
  await run("pg_dump", [sourceUrl, "--format=custom", "--no-owner", "--no-privileges", "--file", dumpPath]);

  const dumpBytes = await readFile(dumpPath);
  const dumpSha256 = createHash("sha256").update(dumpBytes).digest("hex");

  await run("pg_restore", [
    "--dbname",
    restoreUrl,
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-privileges",
    dumpPath,
  ]);

  const tableStatus = await queryJson(
    restoreUrl,
    `select json_build_object(
      'present', coalesce(json_agg(tablename order by tablename), '[]'::json),
      'missing', to_json(array(
        select required_name from unnest(array[${REQUIRED_TABLES.map((name) => `'${name}'`).join(",")}]) required_name
        where to_regclass('public.' || required_name) is null
      ))
    ) from pg_tables where schemaname = 'public' and tablename = any(array[${REQUIRED_TABLES.map((name) => `'${name}'`).join(",")}]);`,
  );

  const functionStatus = await queryJson(
    restoreUrl,
    `select json_build_object(
      'present', coalesce(json_agg(proname order by proname), '[]'::json),
      'missing', to_json(array(
        select required_name from unnest(array[${REQUIRED_FUNCTIONS.map((name) => `'${name}'`).join(",")}]) required_name
        where not exists (select 1 from pg_proc where proname = required_name)
      ))
    ) from pg_proc where proname = any(array[${REQUIRED_FUNCTIONS.map((name) => `'${name}'`).join(",")}]);`,
  );

  const rowCounts = await queryJson(
    restoreUrl,
    `select json_build_object(
      'organizations', (select count(*) from public.organizations),
      'leads', (select count(*) from public.leads),
      'customers', (select count(*) from public.customers),
      'products', (select count(*) from public.products),
      'quotes', (select count(*) from public.quotes),
      'ai_runs', (select count(*) from public.ai_runs)
    );`,
  );

  const latestMigration = await queryJson(
    restoreUrl,
    `select json_build_object('latestMigration', max(version)) from public.deployment_migrations;`,
  );

  const missingTables = tableStatus.missing || [];
  const missingFunctions = functionStatus.missing || [];
  const passed = missingTables.length === 0 && missingFunctions.length === 0 && latestMigration.latestMigration >= "0022";

  const evidence = {
    drillVersion: 1,
    passed,
    startedAt,
    completedAt: new Date().toISOString(),
    source: redactDatabaseUrl(sourceUrl),
    restoreTarget: redactDatabaseUrl(restoreUrl),
    backup: {
      file: basename(dumpPath),
      bytes: dumpBytes.byteLength,
      sha256: dumpSha256,
      format: "postgres-custom",
    },
    verification: {
      requiredMigration: "0022",
      latestMigration: latestMigration.latestMigration,
      missingTables,
      missingFunctions,
      rowCounts,
    },
  };

  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  if (process.env.KEEP_BACKUP_DUMP !== "true") await rm(dumpPath, { force: true });

  console.log(JSON.stringify(evidence, null, 2));
  if (!passed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
