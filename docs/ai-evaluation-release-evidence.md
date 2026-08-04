# AI evaluation release evidence

FlowSales AI persists deterministic regression evaluation evidence only after the normal verification job succeeds on a push to `main`.

## Safety boundary

- Pull-request CI generates and uploads the evaluation report but does not write to production.
- The persistence job requires the protected `production` GitHub environment.
- It authenticates with `SUPABASE_SERVICE_ROLE_KEY`; browser or anon credentials are never accepted.
- The service-role key is used only in request headers and is never printed.
- `SUPABASE_URL` must be an HTTPS Supabase project URL.

## Idempotency

Migration `0026_ai_evaluation_release_evidence.sql` adds the non-null unique `run_key` column to `ai_evaluation_runs`.

The run key combines:

- evaluation suite key
- prompt version
- model
- commit SHA

The release script uses PostgREST conflict resolution on `run_key`, so a retried workflow updates the same evidence record instead of creating duplicates.

## Release flow

1. `verify` runs tests, deterministic AI evaluation and the production build.
2. The JSON report is uploaded as `ai-evaluation-report`.
3. On a successful push to `main`, `persist-ai-evaluation` downloads that exact artifact.
4. `npm run eval:ai:persist` validates the report and upserts it into `ai_evaluation_runs`.
5. `/operations/ai-quality` surfaces the persisted evidence to owners and admins.

## Production prerequisite

Supabase migrations through `0026` must be applied before the first persistence job can succeed. The production migration workflow verifies the `run_key` column and unique index.
