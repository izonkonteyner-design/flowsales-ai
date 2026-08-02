# AI Quality Dashboard

## Purpose

The owner/admin AI Quality Dashboard at `/operations/ai-quality` combines production execution outcomes, user feedback and persisted regression evidence. It is a decision aid for prompt/model releases, not a substitute for sample review or customer validation.

## Security boundary

- The route authenticates the current user and requires an `owner` or `admin` organization membership.
- The database repeats the same authorization check inside `get_ai_quality_dashboard`.
- The browser never receives service-role credentials and does not query unrestricted evaluation evidence directly.
- The RPC accepts a bounded 1–365 day window and returns at most 20 evaluation records.
- Evaluation writes remain service-role/CI only.

## Metrics

- Completed and failed AI runs
- Feedback count and coverage
- Helpful and not-helpful counts
- Helpful rate
- Capability, prompt-version and model segments
- Recent persisted regression evaluation runs

Feedback coverage and helpful rate must be read together. A high rate with a very small sample is not release evidence.

## Risk gates

The dashboard reports a risk when:

- there are no completed runs in the selected period;
- feedback coverage is below 10%;
- helpful rate is below 70% after at least five feedback records;
- no persisted regression evaluation exists;
- the latest regression evaluation failed; or
- the latest evaluation evidence is older than 30 days.

A failed latest evaluation blocks prompt/model promotion.

## Database migration

Migration `0025_ai_quality_dashboard.sql` adds the bounded owner/admin RPC and advances deployment readiness to `0025`.

Production is not ready until migrations through `0025` are applied and the secret-gated deployment readiness probe reports:

- `ready: true`
- `latestMigration: 0025`
- `requiredMigration: 0025`
- no missing functions or tables

## Deferred production activation

The repository workflow `.github/workflows/supabase-production-migrate.yml` is manual-only and validates that `SUPABASE_DB_URL` is a single PostgreSQL URI before connecting. Production migration, deployment and post-deployment smoke remain separate activation steps and must not be represented as complete from code-level CI alone.
