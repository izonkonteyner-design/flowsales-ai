# FlowSales AI

FlowSales AI is a Turkish-first, multi-tenant CRM and sales operating layer for SMEs. It combines CRM records, quotes, tasks, omnichannel conversations, AI-assisted sales intelligence, reporting, approval-gated automation, and phone-sales foundations in one Next.js application.

Production: https://flowsales-ai-six.vercel.app

## Current capabilities

### CRM and revenue

- Dashboard, Leads, Customers, Products, Quotes, Tasks, Calendar, Reports, Account and workspace settings
- Lead/customer identity linking, activity history, conversion and quote handoff
- Quote economics, trusted-cost margin guards, discount approvals, version history and deal-risk signals
- Pipeline snapshots, forecast confidence, revenue leakage, reactivation, expansion and referral opportunities

### Messaging and AI

- WhatsApp operations with delivery states, templates, retries, audit history and dead-letter recovery
- Instagram and Facebook Messenger foundations with encrypted tokens, signed webhooks and explicit asset selection
- Unified provider-aware Inbox and CRM actions
- Conversation Intelligence 2.0, Lead Score, Next Best Action and grounded reply suggestions
- Human approval boundaries: AI and follow-up engines do not automatically send customer messages

### Sales operations

- Callback queue, scheduling, call dispositions, objections and buying signals
- Follow-up sequences, SLA policies, workload/routing suggestions and data-hygiene checks
- Command center and grounded in-app sales analyst
- Daily sales automation cron protected by `CRON_SECRET`

### Voice

- Provider-neutral voice-sales domain, calls, transcripts, events, handoffs and after-call actions
- Trusted product, price and showroom tools
- Twilio and Telnyx adapter foundations
- Twilio Trial is an experimental test path; live end-to-end acceptance remains deferred until a suitable paid/provider configuration is available

### Platform

- Turkish-first UI with English as the secondary locale
- Supabase SSR auth, tenant-aware data access and Row Level Security
- Demo workspace with read-only boundaries
- Workspace API keys with hashed storage and scoped access
- Health probes, structured logging, Sentry integration, Playwright production smoke tests and GitHub Actions CI
- Lemon Squeezy billing foundation for Starter, Growth and Pro plans

## Architecture

- `app/`: marketing, auth, protected application routes and API/webhook handlers
- `components/`: reusable layout and UI components
- `lib/`: validation, utilities, provider clients and Supabase boundaries
- `server/`: CRM, messaging, AI, sales operations and voice domain services
- `supabase/migrations/`: ordered, cumulative production database migrations
- `tests/`: contract, security, regression and application tests
- `e2e/`: Playwright browser and production smoke coverage
- `docs/`: production, integration and operational runbooks

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` from [`.env.example`](./.env.example). Never commit real secrets.

3. Start the application:

```bash
npm run dev
```

## Database

Apply migrations in numeric order. The current repository migration head is:

```text
0049_sales_growth_v6.sql
```

Do not enable a surface that depends on a newer migration until production migration verification passes. Migrations are cumulative; do not manually roll them back without a reviewed forward-recovery plan.

## Verification

```bash
npm run lint
npm run typecheck
npm run test
npm run eval:ai
npm run build
npm run test:e2e
npm run test:e2e:negative
npm run test:e2e:production
```

A change is not production-complete until relevant CI checks pass and the exact merge commit has a Vercel production deployment in `READY` state.

## Production dependencies

Core production operation requires Supabase and application-security variables. Optional surfaces require their provider variables:

- Gemini for AI
- Meta for WhatsApp, Instagram and Messenger
- Twilio or Telnyx for voice
- Lemon Squeezy for billing
- Sentry for observability

See [docs/production-runbook.md](./docs/production-runbook.md) and [`.env.example`](./.env.example) for the current variable names and release gates.

## External activation boundaries

The following capabilities require external provider approval or configuration and are not proven by code/CI alone:

- Instagram/Facebook live messaging: Meta asset authorization, webhook delivery and required access
- Voice: funded/provider-ready account, destination routing and a real phone call
- Billing: controlled checkout, webhook and entitlement test
- Customer-facing automation: explicit human approval remains required

## Safety rules

- Never paste or commit secrets, access tokens or raw API keys.
- Never log authorization headers, provider tokens or webhook secrets.
- Product details and prices must come from trusted catalog/price sources.
- AI output remains advisory or draft-only unless an explicit approved workflow performs the action.
- Automated verification must never target an uncontrolled real customer.
