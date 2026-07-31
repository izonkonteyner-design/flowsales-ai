# FlowSales AI - Production Runbook

This runbook contains operational guidelines for maintaining and troubleshooting the FlowSales AI application in production.

## 1. Environment Variables Configuration

The application requires strict environment variable configuration for authenticated and protected features. The public health endpoint stays lightweight and cacheable, while the protected health probe requires the internal secret and Supabase admin access.

### Critical Variables
* `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
* `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: Client-side safe API key.
* `SUPABASE_SERVICE_ROLE_KEY`: Admin API key (Server only).

### Feature-Specific: Demo Mode
* `DEMO_USER_EMAIL`: Email for the automated demo account.
* `DEMO_USER_PASSWORD`: Password for the automated demo account.
* `DEMO_RATE_LIMIT_SECRET`: Secret token used for rate-limiting demo logins.

### Feature-Specific: AI
* `GEMINI_API_KEY`: API Key for Google Gemini.
* `GEMINI_MODEL`: (Optional) Custom model name. Defaults to `gemini-2.5-flash`.

### Feature-Specific: Sentry Error Monitoring
* `NEXT_PUBLIC_SENTRY_DSN`: Required for client/server error tracking. The app will boot safely if missing.
* `SENTRY_AUTH_TOKEN`: Required in CI to upload source maps.

## 2. Production Health Endpoint

The application exposes a public liveness endpoint at `/api/health` and a protected database probe at `/api/health/internal`.

### Response Schema

```json
{
  "status": "ok"
}
```

* Public `/api/health` always returns `{"status":"ok"}` and is safe to cache at the edge.
* Protected `/api/health/internal` returns `ok`, `degraded`, or `error` and requires `HEALTH_CHECK_SECRET`.
* Both endpoints keep responses minimal and never expose raw database errors, stack traces, or secrets.

## 3. Playwright Smoke Tests

We run continuous smoke tests against the deployed application.

### Running Manually against Production
1. Obtain the Production URL.
2. Run the tests:
   ```bash
   PLAYWRIGHT_BASE_URL="https://flowsales-ai-six.vercel.app" npm run test:e2e
   ```

## 4. Troubleshooting and Incident Checklist

If `status: error` or users report issues:

1. **Verify Environment Variables**: Use the Vercel Dashboard to ensure no environment variables were recently deleted.
2. **Check Sentry**: Open Sentry to view structured error reports. `lib/logger.ts` ensures passwords and tokens are redacted.
3. **Database Health**: Verify Supabase is responsive and the `health_check()` RPC exists for `/api/health/internal`.
   * *Resolution*: Run the idempotent migration `supabase db push`.
4. **Demo Mode Failure**: If demo login is unavailable, verify `DEMO_USER_EMAIL`, `DEMO_USER_PASSWORD`, and `DEMO_RATE_LIMIT_SECRET` in Vercel and review server logs for the logged stage only.

## 5. Rollback Procedures

If a bad deployment occurs:

1. Open the Vercel Dashboard.
2. Navigate to the "Deployments" tab.
3. Find the last known good deployment.
4. Click the three dots (...) and select **Promote to Production** or **Redeploy**.
5. Do NOT manually manipulate the Supabase database migrations unless instructed by a DBA, as migrations are idempotent and cumulative.

## 6. Quote grand total migration (0019)

`0019_fix_quote_grand_total_backfill.sql` repairs seeded quote rows whose `grand_total`, `taxable_subtotal`, and `line_discount_total` columns were locked to the literal `0` by the broken `0007` back-fill.

### Expected impact on a fresh database

- Three seeded quotes (`FSA-2026-0142`, `FSA-2026-0143`, `FSA-2026-0144`) get their `grand_total` set to the legacy `total` value.
- Any row whose `grand_total = 0` but `total > 0` (e.g. older live data with the same historical defect) is repaired.
- Idempotent: re-running 0019 produces no further changes because the guarded `WHERE col = 0` clauses no longer match.

### Verification queries

Run before applying 0019 to capture the affected row count:

```sql
select id, quote_number, subtotal, tax_total, total, grand_total
from public.quotes
where grand_total = 0 and total > 0;
```

Run after applying 0019 to confirm repair:

```sql
select id, quote_number, grand_total, total
from public.quotes
where grand_total <> total
order by quote_number;
```

The expected result of the second query is empty (every row now has `grand_total = total`). Any remaining rows with a positive `tax_total` and a zero `grand_total` indicate a regression that the read-path defense in `normalizeQuoteRecord` (`server/services/quotes.ts`) will still mask, but should be reported for a data investigation.

### Rollback

0019 only writes `UPDATE`s scoped to `WHERE col = 0` clauses. It contains no schema changes, so it is a pure data repair — there is nothing to reverse structurally. If 0019 was applied in error, restore the previous snapshot with Vault/Point-in-Time Recovery (`docs/SUPABASE_PRODUCTION.md`); the migration itself isδιο_UPD-only and cannot tear down columns or rows.
