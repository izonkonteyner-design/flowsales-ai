# Deployment

FlowSales AI is set up for a standard Supabase plus Vercel deployment.

## Prerequisites

- A Supabase project
- A Vercel project
- Node.js 20 or newer

## Environment variables

Set these in both local and production environments as needed:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- `OPENAI_API_KEY`
- `STRIPE_SECRET_KEY`

## Deployment steps

1. Create the Supabase project and apply the SQL migrations in `supabase/migrations/`
2. Confirm auth settings and redirect URLs in Supabase
3. Create the Vercel project from this repository
4. Add the required environment variables in Vercel
5. Deploy the main branch
6. Verify `/api/health`, `/login`, and the protected app routes after deploy

## Production checks

- Confirm the root page loads
- Confirm auth redirects protect the app routes
- Confirm the build succeeds in CI
- Confirm the health endpoint returns a 200 response

## Operational notes

- `proxy.ts` handles auth boundary redirects and session refresh behavior
- Demo data keeps the UI functional when Supabase is not configured
- AI and billing integrations are scaffolded, so they should be connected deliberately before customer use
