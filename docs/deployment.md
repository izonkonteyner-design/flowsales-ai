# Deployment & Production Checklist

FlowSales AI is designed for deployment on Vercel with a Supabase PostgreSQL backend.

## Prerequisites

- A Supabase project (Database & Auth)
- A Vercel project
- Node.js 20 or newer

## Environment variables

Set these in both local `.env.local` and your Vercel production environment:

- `NEXT_PUBLIC_SITE_URL` (e.g. https://flowsales.ai)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `GOOGLE_GEMINI_API_KEY` (Required for AI quote assistant features)
- `DEMO_USER_EMAIL` (Optional: used for the public demo login button)
- `DEMO_USER_PASSWORD` (Optional: used for the public demo login button)
- `DEMO_RATE_LIMIT_SECRET` (Optional: server-only secret pepper for hashing IPs in demo rate limits)
- `SUPABASE_SERVICE_ROLE_KEY` (Server-only admin key used for secure internal operations)

## Deployment steps

1. Create the Supabase project.
2. Apply the SQL migrations in `supabase/migrations/` sequentially using the Supabase CLI or SQL Editor.
   *Ensure you run migration `0017_demo_mode.sql` if you intend to use the demo button.*
3. Confirm auth settings, email templates, and redirect URLs in Supabase Auth.
4. Create the Vercel project from this repository.
5. Add the required environment variables in Vercel.
6. Deploy the main branch.
7. Verify `/api/health`, `/login`, `/dashboard`, and the marketing pages.

## Production checks

- Confirm the root page `/` and `/pricing` load correctly.
- Confirm authentication redirects protect the app routes.
- Confirm the build succeeds in CI (lint, typecheck, tests).
- Create a test account, complete the onboarding flow, and create a test quote.
- Test the "Try Demo" button on the login/marketing pages (if demo mode is configured).

## Operational notes

- `app/(app)/layout.tsx` enforces workspace onboarding completion.
- `app/api/quotes/ai-draft/route.ts` rate-limits and blocks AI features for demo viewers.
- Demo users are automatically forced into a `viewer` role on the `flowsales-demo` workspace, preventing them from modifying any live data.
