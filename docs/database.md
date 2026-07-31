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
- `0019_fix_quote_grand_total_backfill.sql` repairs `grand_total`, `taxable_subtotal`, and `line_discount_total` columns that 0007 left locked to literal `0` on seeded rows (see History: Quote total back-fill)

## Quote totals contract

Every quote carries both a canonical stored snapshot and a recompute path:

- `quotes.subtotal` — sum of line-level `qty × unit_price` (gross)
- `quotes.line_discount_total` — sum of per-line discounts
- `quotes.order_discount_total` — single whole-quote discount
- `quotes.discount_total` — legacy alias kept in sync (`= line_discount_total + order_discount_total`)
- `quotes.taxable_subtotal` — `subtotal - line_discount_total - order_discount_total`
- `quotes.tax_total` — sum of per-line tax after order-discount allocation
- `quotes.shipping_total` — flat shipping amount
- `quotes.grand_total` — `taxable_subtotal + tax_total + shipping_total` (canonical)
- `quotes.total` — legacy alias kept in sync (`= grand_total`)

The canonical computation lives in `server/services/quote-math.ts` (`calculateQuoteTotals`). The server `buildQuotePayload` always recomputes before writing, so client-sent totals are ignored (regression guard: `tests/quote-crud.test.ts`). The read-path `normalizeQuoteRecord` (`server/services/quotes.ts`) recomputes from stored parts whenever a commercial column is stuck at `0` while its parts are positive, which is a defense-in-depth backstop for the historical back-fill defect.

## History: Quote total back-fill

`0007_quotes_foundation.sql` introduced `grand_total`, `taxable_subtotal`, `line_discount_total`, `order_discount_total`, `shipping_total`, and `line_subtotal` columns with `NOT NULL DEFAULT 0` and then attempted to back-fill existing rows from `coalesce(new_col, legacy_col)`.

The back-fill was a **no-op** for rows that existed before 0007 ran: PostgreSQL attaches the literal `DEFAULT` (0) to existing rows when adding a `NOT NULL DEFAULT` column, so `coalesce(0, total, subtotal)` short-circuited at `0` and never fell through to the legacy `total` column. Three seeded quotes had a permanent `grand_total = 0` while their legacy `total` held the correct arithmetic.

`0019_fix_quote_grand_total_backfill.sql` repairs the affected rows with an idempotent `UPDATE ... WHERE ... = 0` guarded on positive legacy columns:

- `grand_total = total` (or `subtotal + tax_total + shipping_total - discount_total` if `total` is also 0)
- `taxable_subtotal = subtotal - discount_total`
- `line_discount_total = discount_total`

Re-running 0019 is safe — the guarded `WHERE` clauses prevent rows that are already correct from being re-touched.

## Local development notes

- Apply migrations through the Supabase CLI or SQL editor
- Seed data is intended for development and demo environments only
- The demo seed references placeholder auth identities, so a real Supabase project may need manual user alignment before the seed runs cleanly

## Practical usage

- Use the demo service layer in `server/services/crm-data.ts` when Supabase is not configured
- Swap those service methods for live queries without changing page contracts
- Keep schema changes additive where possible so migration and seed scripts remain easy to reason about
