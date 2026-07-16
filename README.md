# FlowSales AI

FlowSales AI is an AI-powered CRM and sales workspace for SMEs. It combines lead management, quotes, tasks, reporting, settings, and a secure auth boundary with a premium SaaS UI.

## Features

- Marketing landing page
- Auth routes: login, signup, forgot password, reset password
- Protected app shell with light/dark mode and mobile navigation
- Leads CRM with detail view
- Products catalog
- Quotes list, draft, and detail pages
- Tasks and follow-up board
- AI assistant workspace
- Reports and workspace settings
- Supabase SSR client/server boundary
- Tenant-aware database migrations and RLS
- Unit tests and CI

## Architecture

- `app/` contains route groups for marketing, auth, and the application shell
- `components/` contains reusable layout and UI primitives
- `lib/` contains constants, validation schemas, utility helpers, and Supabase helpers
- `server/` contains demo data and calculation helpers
- `supabase/migrations/` contains reproducible SQL
- `tests/` contains unit tests for validation and quote math

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` from [`.env.example`](./.env.example)

3. Run the app:

```bash
npm run dev
```

## Environment variables

Required for auth and live Supabase data:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Optional:

- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `STRIPE_SECRET_KEY`
- `NEXT_PUBLIC_APP_URL`

## Database

Apply migrations in `supabase/migrations/` with the Supabase CLI or SQL editor. The demo seed is in `0002_seed.sql`.

## Commands

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## Deployment

Deploy to Vercel with the environment variables above. See [docs/deployment.md](./docs/deployment.md) for the checklist.

## Limitations

- Live Supabase auth/data requires environment variables and a configured project.
- AI and billing integrations are scaffolded but not connected to paid providers yet.
- Demo data powers the product screens when live data is unavailable.
