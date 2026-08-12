# FlowSales AI - Production Runbook

This runbook is the operational source of truth for deploying, verifying and troubleshooting FlowSales AI.

## 1. Production identity

- Repository: `izonkonteyner-design/flowsales-ai`
- Default branch: `main`
- Production URL: `https://flowsales-ai-six.vercel.app`
- Database migration head: `0051_readiness_entitlements_fix.sql`
- Scheduled job: `/api/cron/sales-automation` at `0 5 * * *`

Never treat a preview deployment, branch commit or successful build as production acceptance. The exact merge commit must reach a Vercel production deployment in `READY` state.

## 2. Critical environment variables

Use [`.env.example`](../.env.example) as the canonical variable-name inventory. Never place real values in documentation, issues, PR descriptions or chat.

### Supabase

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — server only

### Application security

- `NEXT_PUBLIC_SITE_URL`
- `TOKEN_ENCRYPTION_KEY` — stored integration tokens depend on it; do not rotate without a migration/re-encryption plan
- `HEALTH_CHECK_SECRET`
- `CRON_SECRET`

### Demo

- `DEMO_USER_EMAIL`
- `DEMO_USER_PASSWORD`
- `DEMO_RATE_LIMIT_SECRET`

### AI

- `GEMINI_API_KEY`
- `GEMINI_MODEL` — optional; the application has a controlled fallback

### Meta / WhatsApp / Instagram / Messenger

- `META_APP_ID`
- `META_APP_SECRET`
- `META_WEBHOOK_VERIFY_TOKEN`
- `META_EMBEDDED_SIGNUP_CONFIG_ID`
- `META_GRAPH_VERSION` — optional
- `INSTAGRAM_APP_ID`
- `INSTAGRAM_APP_SECRET`

Callback URLs are derived from `NEXT_PUBLIC_SITE_URL`:

- Facebook: `/api/integrations/meta/callback?provider=facebook`
- Instagram: `/api/integrations/meta/callback?provider=instagram`
- Messaging webhook: `/api/webhooks/meta-messaging`
- Data deletion callback: use the application route configured for Meta data deletion

Owner/Admin users can inspect boolean-only readiness at `/api/integrations/meta/status`. It must never return app secrets, verify tokens, encryption keys or access tokens.

Meta permissions must remain aligned with the exact OAuth implementation and current App Review use cases. Do not add unused permissions and do not rename permissions only in documentation.

### Voice

- `TWILIO_AUTH_TOKEN`
- `TELNYX_API_KEY`
- `TELNYX_PUBLIC_KEY`
- `TELNYX_TTS_VOICE` — optional
- `TELNYX_TRANSCRIPTION_ENGINE` — optional
- `TWILIO_TRIAL_WEBHOOK_SECRET` — only for the isolated Trial route when that experimental path is enabled

Production Twilio webhooks must retain signature validation. The Trial shared-secret route is isolated and must never weaken the normal production route.

### Billing - Lemon Squeezy

- `LEMONSQUEEZY_API_KEY`
- `LEMONSQUEEZY_STORE_ID`
- `LEMONSQUEEZY_STARTER_VARIANT_ID`
- `LEMONSQUEEZY_GROWTH_VARIANT_ID`
- `LEMONSQUEEZY_PRO_VARIANT_ID`
- `BILLING_WEBHOOK_SECRET`

Routes:

- Checkout: `/api/billing/checkout?plan=starter|growth|pro`
- Customer portal: `/api/billing/portal`
- Webhook: `/api/billing/webhook`

### Observability

- `NEXT_PUBLIC_SENTRY_DSN`
- `SENTRY_AUTH_TOKEN` — build/server use only

## 3. Database migration readiness

Production must be migrated through `0051_readiness_entitlements_fix.sql`.

Recent capability boundaries:

- `0042_productization_i18n_calendar_api.sql`: Turkish-first locale, calendar, workspace API keys, audit storage, seat/AI limits and notification publication
- `0043_channel_contact_avatar.sql`: channel contact avatars
- `0044_inbox_conversation_fields.sql`: Inbox conversation fields
- `0045_conversation_intelligence_v2.sql`: Conversation Intelligence 2.0 persistence
- `0046_lead_identity_guard.sql`: lead identity safety
- `0047_voice_sales_v1.sql`: voice calls, transcripts, events, handoffs and after-call actions
- `0048_sales_operations_v5.sql`: sales operations workflows
- `0049_sales_growth_v6.sql`: growth intelligence, controls and reporting foundations
- `0050_onboarding_roles.sql`: validated onboarding fields and canonical workspace roles
- `0051_readiness_entitlements_fix.sql`: canonical entitlement-table readiness manifest

Rules:

1. Apply migrations in numeric order.
2. Confirm the production migration workflow/verifier passes through `0051`.
3. Do not enable dependent UI before its migration is present.
4. Do not delete or manually roll back cumulative migrations.
5. Use a reviewed forward migration for schema corrections.
6. Run tenant-isolation/RLS verification after security-sensitive schema changes.

## 4. Locale and regional defaults

- Default locale: `tr`
- Secondary locale: `en`
- Cookie: `flowsales_locale`
- Authenticated preference: `profiles.language`
- Default formatting: `tr-TR` and TRY unless a record explicitly carries another locale/currency

Verify that locale selection survives refresh and login and that Turkish characters remain intact in redirects, headers, PDFs and provider payloads.

## 5. Public API security

Workspace API keys:

- start with `fsa_`
- show the raw secret only once
- store only SHA-256 hash and short prefix
- are tenant-bound and scope-bound
- can be revoked by Owner/Admin
- are rate-limited

First public resource: `/api/v1/leads`

- `GET` requires `crm:read`
- `POST` requires `crm:write`
- `POST` requires `Idempotency-Key`

Never log authorization headers, raw API keys, provider tokens or webhook secrets.

## 6. Production health and scheduled work

- Public liveness: `/api/health`
- Protected database probe: `/api/health/internal`
- Daily sales automation: `/api/cron/sales-automation`

The internal probe requires `HEALTH_CHECK_SECRET`. The cron route requires the expected `CRON_SECRET` bearer authentication. Responses and logs must expose only redacted provider/database failures.

## 7. Release verification

Run the relevant checks:

```bash
npm run lint
npm run typecheck
npm run test
npm run eval:ai
npm run build
npm run test:e2e
npm run test:e2e:negative
PLAYWRIGHT_BASE_URL="https://flowsales-ai-six.vercel.app" npm run test:e2e:production
```

Release acceptance requires:

1. CI `verify` PASS
2. CI `e2e-production` PASS when applicable
3. migration verification through `0051`
4. relevant RLS/two-workspace checks PASS
5. exact merge commit deployed to production
6. Vercel deployment state `READY`
7. no new runtime error cluster
8. authenticated desktop/mobile smoke test for changed surfaces
9. rollback target remains available

## 8. External integration acceptance

Code and CI do not prove a provider integration is live.

### Meta

Acceptance requires:

1. readiness endpoint reports required configuration booleans
2. real managed asset OAuth completes
3. exact Page/Instagram asset is explicitly selected
4. webhook verification succeeds
5. signed inbound payload persists to the correct tenant
6. human-initiated reply uses the selected provider
7. no automated verification message targets an uncontrolled customer

If Meta Business Verification or Advanced Access is unavailable, keep the integration pending; do not weaken permissions or webhook security.

### WhatsApp

Verify inbound persistence, outbound replies, delivery/read/failure statuses, 24-hour policy, templates, bounded retries, dead-letter handling, manual reprocess and CRM identity linking.

### Voice

Voice acceptance requires a provider-ready/funded account, real destination routing, Turkish speech/TTS, callback continuity, trusted product/price answers, live handoff and after-call persistence. Twilio Trial behavior is not production acceptance.

### Billing

Use a controlled test workspace to verify checkout, webhook signature, idempotency, entitlement update, portal access, upgrade/downgrade, cancellation and failed-payment behavior.

## 9. AI and sales safety

- Product, price, showroom, delivery and technical answers must use trusted sources.
- If trusted data is missing, fail closed and ask one concise clarification question.
- AI suggestions and follow-up actions remain human-approved.
- AI must not directly send customer messages.
- Margin calculations fail closed when trusted cost data is absent.
- Persist release evaluation evidence when the production workflow is configured to do so.
- Do not expose model/provider errors directly to end users.

## 10. Troubleshooting

### Meta configuration

1. Open `/api/integrations/meta/status` as Owner/Admin.
2. Inspect boolean readiness only.
3. Confirm production was deployed after environment changes.
4. Confirm exact redirect/callback URLs.
5. Confirm the webhook verify-token value matches production.
6. Inspect redacted Vercel runtime logs.

### Voice

1. Separate provider/trial announcements from application audio.
2. Count webhook POSTs and status codes.
3. Confirm a `SpeechResult` callback exists before debugging sales orchestration.
4. Inspect provider call/debug logs for TwiML or media errors.
5. Never request secrets in chat or log them.

### Database-backed surfaces

If onboarding, roles, tasks, calendar, API, Inbox, intelligence, voice or sales operations fail, verify the exact required migration through `0051` before changing UI code.

## 11. Rollback

1. Identify the exact unhealthy merge commit.
2. Promote the last known-good Vercel deployment when application code is unhealthy.
3. Do not destructively roll back cumulative Supabase migrations.
4. Keep additive schema in place unless a reviewed forward migration changes it.
5. Re-run health, authentication and production smoke checks after rollback.
