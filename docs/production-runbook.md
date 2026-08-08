# FlowSales AI - Production Runbook

This runbook contains operational guidelines for maintaining and troubleshooting FlowSales AI in production.

## 1. Critical environment variables

### Supabase
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server only)

### Application security
- `NEXT_PUBLIC_SITE_URL`
- `TOKEN_ENCRYPTION_KEY` — never rotate casually; stored integration tokens depend on it.
- `HEALTH_CHECK_SECRET`

### Demo
- `DEMO_USER_EMAIL`
- `DEMO_USER_PASSWORD`
- `DEMO_RATE_LIMIT_SECRET`

### AI
- `GEMINI_API_KEY`
- `GEMINI_MODEL` (optional)

### Meta / WhatsApp / Instagram / Messenger
- `META_APP_ID` (or legacy `META_CLIENT_ID`)
- `META_APP_SECRET` (or legacy `META_CLIENT_SECRET`)
- `META_WEBHOOK_VERIFY_TOKEN` (or legacy `WHATSAPP_WEBHOOK_VERIFY_TOKEN`)
- `META_EMBEDDED_SIGNUP_CONFIG_ID` for WhatsApp Embedded Signup
- `META_GRAPH_VERSION` (optional)

Meta callback URLs are derived from `NEXT_PUBLIC_SITE_URL`:
- Facebook: `/api/integrations/meta/callback?provider=facebook`
- Instagram: `/api/integrations/meta/callback?provider=instagram`
- Messaging webhook: `/api/webhooks/meta-messaging`

Owner/Admin users can inspect boolean-only Meta readiness at `/api/integrations/meta/status`. This endpoint never returns app secrets, verify tokens, encryption keys or access tokens.

Required Meta OAuth scopes:
- Facebook: `pages_show_list`, `pages_manage_metadata`, `pages_messaging`, `pages_read_engagement`
- Instagram: `pages_show_list`, `pages_manage_metadata`, `pages_read_engagement`, `instagram_basic`, `instagram_manage_messages`

### Billing - Lemon Squeezy
- `LEMONSQUEEZY_API_KEY`
- `LEMONSQUEEZY_STORE_ID`
- `LEMONSQUEEZY_STARTER_VARIANT_ID`
- `LEMONSQUEEZY_GROWTH_VARIANT_ID`
- `LEMONSQUEEZY_PRO_VARIANT_ID`
- `BILLING_WEBHOOK_SECRET`

Checkout route: `/api/billing/checkout?plan=starter|growth|pro`
Customer portal route: `/api/billing/portal`
Webhook route: `/api/billing/webhook`

## 2. Database migration readiness

Production must be migrated through `0042_productization_i18n_calendar_api.sql` before enabling the new productized surfaces.

Migration 0042 provides:
- Turkish-first profile language default
- live calendar events + RLS
- hashed workspace API keys + RLS
- application audit log explorer storage
- workspace seat-limit enforcement at DB boundary
- AI subscription/monthly-run enforcement at DB boundary
- Realtime publication for user notifications

Do not enable a UI that depends on 0042 before confirming the migration is applied.

## 3. Turkish / English locale

- Default locale: `tr`
- Secondary locale: `en`
- Cookie: `flowsales_locale`
- Authenticated preferences are persisted to `profiles.language`.
- Date/number/currency formatting defaults to `tr-TR` and TRY unless the record explicitly carries another currency.

## 4. Public API security

Workspace API keys:
- begin with `fsa_`
- raw secret is shown only at creation time
- only SHA-256 hash + short prefix are stored
- can be revoked by Owner/Admin
- are tenant-bound and scope-bound (`crm:read`, `crm:write`)
- requests are rate-limited

First public resource: `/api/v1/leads`
- `GET` requires `crm:read`
- `POST` requires `crm:write`
- `POST` requires `Idempotency-Key`

Never log Authorization headers or raw API keys.

## 5. Production health

Public liveness: `/api/health`
Protected database probe: `/api/health/internal`

Public health responses remain minimal. Internal probes require `HEALTH_CHECK_SECRET` and must not expose raw provider/database errors.

## 6. Playwright and release verification

Run:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
PLAYWRIGHT_BASE_URL="https://flowsales-ai-six.vercel.app" npm run test:e2e:production
```

For release readiness, also verify:
1. migrations through 0042 applied
2. Meta readiness endpoint returns all required booleans true
3. Facebook OAuth completes with a real managed Page
4. Instagram OAuth discovers the linked professional account
5. Meta webhook verification succeeds and signed inbound payloads persist
6. WhatsApp Embedded Signup can reconnect safely without manual token copying
7. Omnichannel Inbox receives and replies through the explicitly selected channel
8. no automated WhatsApp verification send targets a real customer
9. Lemon Squeezy checkout + webhook update entitlements in a controlled test workspace
10. Turkish/English switch survives refresh/login and core pages render correctly on desktop/mobile

## 7. Troubleshooting

If Meta integration cards show configuration required:
1. open `/api/integrations/meta/status` while authenticated as Owner/Admin
2. verify only the boolean fields; do not paste secret values into support/chat
3. confirm the production deployment was created after the latest environment changes
4. verify exact redirect URIs in Meta
5. verify webhook callback uses the same verify-token value as production env

If a webhook signature fails, verify `META_APP_SECRET` and inspect server logs for redacted stage/error codes only.

If tasks/calendar/API/audit pages fail after deployment, verify migration 0042 is present before debugging UI code.

## 8. Rollback

1. Open Vercel Deployments.
2. Promote the last known-good deployment if application code is unhealthy.
3. Do not delete or manually roll back cumulative Supabase migrations without a reviewed database recovery plan.
4. If 0042 has already run, leave its additive tables/guards in place unless a dedicated forward migration removes or changes them.
