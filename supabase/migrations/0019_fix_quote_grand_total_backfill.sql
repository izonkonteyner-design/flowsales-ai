-- Backfill quote commercial totals that the 0007 backfill left as literal 0.
--
-- Root cause: 0007_quotes_foundation.sql line 19 added
--   `grand_total numeric(14,2) not null default 0`
-- to a table that already had seeded rows. PostgreSQL backfills the literal
-- default (0), not NULL, for existing rows. The follow-up UPDATE on line 30
--   `grand_total = coalesce(grand_total, total, subtotal)`
-- then short-circuited at the literal 0, so the UPDATE was a no-op for every
-- pre-existing row and `grand_total` stayed permanently 0 while `total` held
-- the correct sum. The same short-circuit trapped `taxable_subtotal` at 0.
--
-- This migration is idempotent: it only rewrites rows whose commercial columns
-- are stuck at 0 while the legacy `total` / `subtotal` carry the real values.
-- Re-running yields no further changes because the guarded values are no
-- longer 0. The canonical computation lives in `server/services/quote-math.ts`
-- (`calculateQuoteTotals`); this migration only repairs stored snapshots so
-- they match what the canonical function would produce for the seeded lines.

-- grand_total: prefer the legacy `total` (already the correct arithmetic sum
-- written by 0002_seed.sql); fall back to `subtotal + tax_total` when `total`
-- itself is 0 but the parts are positive. Never touch rows whose `total` is
-- also 0 and no parts are positive (those are legitimately empty quotes).
update public.quotes
set
  grand_total = case
    when total > 0 then total
    when subtotal > 0 or tax_total > 0 then subtotal + tax_total + shipping_total - discount_total
    else 0
  end
where grand_total = 0;

-- taxable_subtotal: the discounted base that the canonical function defines as
-- `subtotal - line_discount_total - order_discount_total`. For seeded rows the
-- legacy `discount_total` holds the combined discount value (it was the only
-- discount column before 0007 split it into line and order components), so we
-- derive `taxable_subtotal = subtotal - discount_total` when the stored value
-- is 0 and the parts are positive.
update public.quotes
set taxable_subtotal = subtotal - coalesce(discount_total, 0)
where taxable_subtotal = 0
  and subtotal > 0
  and subtotal - coalesce(discount_total, 0) > 0;

-- line_discount_total: 0007 backfilled this from `coalesce(line_discount_total,
-- discount_total, 0)`, which worked (legacy `discount_total` was non-null on
-- seeded rows). Ensure any straggler with 0 but a positive `discount_total`
-- also gets repaired. Idempotent: only fires when the row is stuck at 0.
update public.quotes
set line_discount_total = coalesce(discount_total, 0)
where line_discount_total = 0
  and coalesce(discount_total, 0) > 0;
