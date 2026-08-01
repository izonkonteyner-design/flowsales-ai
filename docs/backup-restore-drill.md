# Backup and Restore Drill

## Purpose

This drill proves that a PostgreSQL backup can be created from the intended Supabase database, restored into a separate disposable environment, and checked for the critical FlowSales AI schema, RPC functions, migration level, and representative row counts.

The repository implementation does not prove that production backups are currently recoverable. The launch gate closes only after a dated drill is run against the intended source and a separate non-production restore target, with the generated evidence retained.

## Safety boundary

- Do not restore into production.
- The source and restore URLs must be different.
- The restore database hostname or database name must visibly contain `restore`, `staging`, `test`, `localhost`, or `127.0.0.1`.
- The operator must explicitly set `RESTORE_TARGET_ACK=NON_PRODUCTION`.
- The script uses `pg_restore --clean --if-exists`; every object in the target database may be replaced.
- Use a disposable, isolated restore target with no customer traffic.
- Database credentials must be supplied as environment variables and must never be committed.

## Prerequisites

- PostgreSQL client tools compatible with the source database major version:
  - `pg_dump`
  - `pg_restore`
  - `psql`
- Network access to both databases.
- A source role with permission to dump the required schemas and data.
- A restore role with permission to recreate objects in the disposable target.
- Migration `0022_deployment_manifest_probe.sql` applied to the source before the launch-gate drill.

## Required environment variables

```bash
export SOURCE_DATABASE_URL='postgresql://...'
export RESTORE_DATABASE_URL='postgresql://...restore...'
export RESTORE_TARGET_ACK=NON_PRODUCTION
```

Optional settings:

```bash
export BACKUP_EVIDENCE_DIR=backup-evidence
export KEEP_BACKUP_DUMP=false
```

`KEEP_BACKUP_DUMP` defaults to false. The dump is deleted after verification, while the JSON evidence file is retained. Keep a dump only in approved encrypted storage with documented retention and access controls.

## Run the drill

```bash
npm run verify:backup-restore
```

The command performs these operations:

1. Creates a PostgreSQL custom-format backup using `pg_dump`.
2. Computes the dump SHA-256 checksum and byte size.
3. Restores into the confirmed non-production target using `pg_restore`.
4. Verifies critical public tables.
5. Verifies critical RPC functions.
6. Confirms the deployment migration manifest is at least version `0022`.
7. Captures representative row counts.
8. Writes a redacted JSON evidence report.
9. Exits non-zero if any required object or migration is missing.

## Required verification scope

Critical tables include organization membership, CRM entities, AI execution and approval data, imports, notifications, and deployment migration records.

Critical functions include:

- `health_check`
- `deployment_readiness`
- `create_ai_approval`
- `decide_ai_approval`

Representative row counts are captured for:

- organizations
- leads
- customers
- products
- quotes
- AI runs

Row counts are evidence signals, not a complete semantic data comparison. The drill should additionally include manual spot checks for at least one workspace, one lead, one customer, one product, one quote, and one AI run when production-like data is permitted in the restore environment.

## Evidence to retain

Retain the generated `backup-restore-<timestamp>.json` file in the approved operations evidence location. Record:

- drill date and operator
- source environment identifier
- restore environment identifier
- backup checksum and size
- PostgreSQL client version
- source and target PostgreSQL major versions
- latest migration version
- missing table/function result
- representative row counts
- total elapsed time
- restore issues and remediation
- final PASS or FAIL decision

Do not retain plaintext database URLs, passwords, service-role keys, or unencrypted customer data in tickets or repository files.

## Pass criteria

The drill passes only when:

- backup creation succeeds
- restore completes into a separate non-production target
- checksum and size are recorded
- no required table is missing
- no required function is missing
- migration level is at least `0022`
- representative row-count queries complete
- the evidence file is saved
- any restore warnings are reviewed and accepted by the deployment owner

## Failure handling

A failed drill is a launch blocker. Preserve the evidence JSON and command logs without secrets, identify whether the failure is caused by credentials, PostgreSQL version mismatch, missing extensions, migration drift, object ownership, or corrupted/incomplete backup, then rerun from a new clean restore target after remediation.

## Recommended cadence

- Before the first commercial launch
- Before major schema or billing changes
- At least quarterly after launch
- After changing the Supabase project, backup policy, database major version, or disaster-recovery process
