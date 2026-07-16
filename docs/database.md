# Database

FlowSales AI uses a tenant-aware Supabase schema designed for a single app codebase with multiple organizations.

## Core tables

- `organizations` stores workspace-level tenant records
- `profiles` stores user profile metadata
- `organization_members` links users to organizations and roles
- `contacts` stores CRM contacts
- `leads` stores lead pipeline records
- `products` stores catalog items used in quotes
- `quotes` stores quote headers and totals
- `quote_items` stores line items for each quote
- `activities` stores timeline events
- `tasks` stores follow-up work
- `ai_agent_settings` stores AI workflow configuration
- `knowledge_documents` stores uploaded knowledge base files
- `subscriptions` stores billing and plan metadata

## Security model

- Row level security is enabled on tenant-scoped tables
- Membership checks are enforced through helper functions
- Role checks support `owner`, `admin`, `sales`, and `viewer`
- Browser clients should only use the publishable Supabase key
- Service-role access should stay server-side only

## Migrations

The main schema lives in `supabase/migrations/0001_initial.sql`.

- `0002_seed.sql` creates demo data for local development and previews
- `0003_migrate_legacy_leads.sql` preserves older lead data during schema expansion

## Local development notes

- Apply migrations through the Supabase CLI or SQL editor
- Seed data is intended for development and demo environments only
- The demo seed references placeholder auth identities, so a real Supabase project may need manual user alignment before the seed runs cleanly

## Practical usage

- Use the demo service layer in `server/services/crm-data.ts` when Supabase is not configured
- Swap those service methods for live queries without changing page contracts
- Keep schema changes additive where possible so migration and seed scripts remain easy to reason about
