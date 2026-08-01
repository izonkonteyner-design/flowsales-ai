import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const scriptPath = new URL("../scripts/verify-backup-restore.mjs", import.meta.url);
const packagePath = new URL("../package.json", import.meta.url);
const runbookPath = new URL("../docs/backup-restore-drill.md", import.meta.url);

test("backup restore drill requires separate non-production target", async () => {
  const source = await readFile(scriptPath, "utf8");

  assert.match(source, /SOURCE_DATABASE_URL/);
  assert.match(source, /RESTORE_DATABASE_URL/);
  assert.match(source, /RESTORE_TARGET_ACK/);
  assert.match(source, /NON_PRODUCTION/);
  assert.match(source, /Restore target must not equal the source database URL/);
  assert.match(source, /restore\|staging\|test\|localhost/);
});

test("backup restore drill uses PostgreSQL native backup and restore tools", async () => {
  const source = await readFile(scriptPath, "utf8");

  assert.match(source, /pg_dump/);
  assert.match(source, /--format=custom/);
  assert.match(source, /pg_restore/);
  assert.match(source, /--clean/);
  assert.match(source, /--if-exists/);
  assert.match(source, /--no-owner/);
  assert.match(source, /--no-privileges/);
});

test("backup restore evidence verifies migration, schema and data counts", async () => {
  const source = await readFile(scriptPath, "utf8");

  for (const value of [
    "deployment_migrations",
    "deployment_readiness",
    "create_ai_approval",
    "decide_ai_approval",
    "organizations",
    "leads",
    "customers",
    "products",
    "quotes",
    "ai_runs",
    "sha256",
    "rowCounts",
    'requiredMigration: "0022"',
  ]) {
    assert.ok(source.includes(value), `Expected drill source to include ${value}`);
  }
});

test("backup restore command and runbook are registered", async () => {
  const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const runbook = await readFile(runbookPath, "utf8");

  assert.equal(packageJson.scripts?.["verify:backup-restore"], "node scripts/verify-backup-restore.mjs");
  assert.match(runbook, /RESTORE_TARGET_ACK=NON_PRODUCTION/);
  assert.match(runbook, /Do not restore into production/i);
  assert.match(runbook, /evidence/i);
}
);
