# FlowSales AI Environment Contract

This document specifies the authoritative environment variables required for FlowSales AI across development, staging, and production environments.

## Core Supabase Integration

These variables are required for the application to boot and resolve database connections.

- `NEXT_PUBLIC_SUPABASE_URL`: The URL of your Supabase instance.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: The public anon key for your Supabase instance.
  > **Note for Vercel Users**: Vercel's Supabase integration may inject `NEXT_PUBLIC_SUPABASE_ANON_KEY` instead. The application supports this alias dynamically as a fallback for Vercel deployments, but `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` remains the standard.

## Admin & Demo Mode

These variables are feature-scoped and evaluated only when administrative bypasses or demo-mode routes are accessed.

- `SUPABASE_SERVICE_ROLE_KEY`: Required for executing privileged RPCs like `check_demo_rate_limit`. Keep this secret and never expose it with a `NEXT_PUBLIC_` prefix.
- `DEMO_USER_EMAIL`: The designated email address for the demo login flow.
- `DEMO_USER_PASSWORD`: The secure password for the demo user account.
- `DEMO_RATE_LIMIT_SECRET`: A server-side pepper used to securely hash client identifiers during demo rate-limiting.

## AI Integration

These variables are feature-scoped and are validated dynamically only when invoking the AI assistance routes (e.g., generating quote drafts).

- `GEMINI_API_KEY`: The server-side API key for Google Gemini.
- `GEMINI_MODEL`: The designated model to use (default: `gemini-3.1-flash-lite`).

## Site Routing

- `NEXT_PUBLIC_SITE_URL`: The absolute canonical URL of the application. Used for authentication redirects, invite links, and emails.
  > **Note**: In Vercel deployments, the application will automatically fall back to Vercel's standard system variables (`NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL` -> `NEXT_PUBLIC_VERCEL_URL` -> `VERCEL_URL`) if `NEXT_PUBLIC_SITE_URL` is omitted. For local development, it defaults to `http://localhost:3000`.

## Important Security Rules

1. **Never use `NEXT_PUBLIC_` prefixes on secrets**. The only variables requiring this prefix are the Supabase URL, Supabase Anon/Publishable Key, and Site URL.
2. **Fail closed**. The application handles missing configuration gracefully but firmly by returning 500 or redirecting with safe error toasts rather than crashing the Next.js build or server initialization.
3. **Do not expose secrets in logs**.
