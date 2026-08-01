# FlowSales AI Production Deployment Verification

## Purpose

Verify that a deployed environment has the required application configuration, ordered commercial migrations, database tables and RPC functions without exposing secret values publicly.

## Components

- Migration manifest: `public.deployment_migrations`
- Database probe RPC: `public.deployment_readiness()`
- Secret-gated endpoint: `GET /api/health/deployment`
- Required migration version: `0022`

The public endpoint `/api/health` remains minimal and does not expose deployment details.

## Required environment contract

Core deployment readiness requires:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `HEALTH_CHECK_SECRET`
- `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL` or `VERCEL_URL`

Feature configuration is reported separately and does not expose values:

- Demo: `DEMO_USER_EMAIL`, `DEMO_USER_PASSWORD`, `DEMO_RATE_LIMIT_SECRET`
- AI: `GEMINI_API_KEY`
- Billing webhook: `BILLING_WEBHOOK_SECRET`

## Applying the manifest migration

Apply migrations in order through the intended Supabase deployment process. Migration `0022_deployment_manifest_probe.sql` assumes migrations `0018` through `0021` have already run.

Do not manually insert manifest rows as a substitute for applying the underlying migrations.

## Calling the probe

Use one of the supported secret headers:

```bash
curl --fail-with-body \
  -H "X-Health-Check-Secret: $HEALTH_CHECK_SECRET" \
  https://flowsales-ai-six.vercel.app/api/health/deployment
```

or:

```bash
curl --fail-with-body \
  -H "Authorization: Bearer $HEALTH_CHECK_SECRET" \
  https://flowsales-ai-six.vercel.app/api/health/deployment
```

Unauthorized requests return `404` to avoid advertising the internal endpoint. Repeated requests are rate limited.

## Successful response

A successful deployment returns HTTP `200` with:

- `status: "ok"`
- environment readiness
- latest and required migration versions
- empty missing-function and missing-table arrays
- feature configuration status without secret values

## Failure behavior

The endpoint returns HTTP `503` when:

- a required environment group is missing
- the service-role client cannot query the database
- migration `0022` is not recorded
- a required RPC function is missing
- a required table is missing

The endpoint fails closed. It never treats an unavailable database response as healthy.

## Evidence record

For every production deployment record:

- deployment commit SHA
- deployment timestamp
- Supabase project identifier
- probe timestamp and HTTP status
- latest migration reported
- missing functions or tables, if any
- operator name
- remediation or approval reference

Never store secret header values in the evidence record.
