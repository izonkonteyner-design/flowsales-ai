# FlowSales AI - Production Runbook

This runbook contains operational guidelines for maintaining and troubleshooting the FlowSales AI application in production.

## 1. Environment Variables Configuration

The application requires strict environment variable configuration. Missing critical variables will cause the Health Endpoint to return `status: error`.

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

The application exposes a health check endpoint at `/api/health`.

### Response Schema

```json
{
  "status": "ok"
}
```

* `status`: `ok` (Fully healthy), `degraded` (Rate limited or partial availability), `error` (Core systems down).
* The public endpoint intentionally returns only a minimal payload and includes `Cache-Control: no-store`.
* Internal diagnostics should be captured through server logs or a protected health endpoint.

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
3. **Database Health**: Verify Supabase is responsive and the `health_check()` RPC exists.
   * *Resolution*: Run the idempotent migration `supabase db push`.
4. **Demo Mode Failure**: If demo login is unavailable, verify `DEMO_USER_EMAIL`, `DEMO_USER_PASSWORD`, and `DEMO_RATE_LIMIT_SECRET` in Vercel and review server logs for the logged stage only.

## 5. Rollback Procedures

If a bad deployment occurs:

1. Open the Vercel Dashboard.
2. Navigate to the "Deployments" tab.
3. Find the last known good deployment.
4. Click the three dots (...) and select **Promote to Production** or **Redeploy**.
5. Do NOT manually manipulate the Supabase database migrations unless instructed by a DBA, as migrations are idempotent and cumulative.
