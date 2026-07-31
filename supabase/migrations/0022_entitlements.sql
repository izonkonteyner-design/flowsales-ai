-- 0022_entitlements.sql
-- FlowSales AI: plan/feature entitlement model + trial state.
--
-- Strategy: extend the existing `subscriptions` table to express the
-- demo / trial / paid plan tier and the trial lifecycle without spawning a
-- parallel entitlements subsystem. The app-level Feature enum maps a plan to
-- a set of entitlements in a SINGLE central place (`lib/entitlements.ts`); the
-- database stores only the source-of-truth plan value and trial dates.
--
-- A separate `workspace_feature_entitlements` table is NOT created: the spec
-- explicitly says "if existing tables satisfy the need, don't create a new
-- one". Plan -> features lives in code (single source of truth) so changes
-- don't require migrations; this keeps the demo and paid paths identical.

-- 1. Expand the plan enum constraint to include 'demo' and 'trial'.
--    Existing rows are all in {'starter','pro','business'} so the constraint
--    change is forward-compatible (no data migration needed).
alter table public.subscriptions
  drop constraint if exists subscriptions_plan_check;

alter table public.subscriptions
  add constraint subscriptions_plan_check
  check (plan in ('demo', 'trial', 'starter', 'pro', 'business'));

-- 2. Trial lifecycle. `trial_started_at` / `trial_ends_at` nullable; for
--    non-trial plans both stay null. `trial_converted_at` records the moment
--    a trial was upgraded to a paid plan (for funnel analytics).
alter table public.subscriptions
  add column if not exists trial_started_at   timestamptz,
  add column if not exists trial_ends_at      timestamptz,
  add column if not exists trial_converted_at timestamptz;

-- 3. Status enum expansion: a subscription can now be in trial/demo states.
--    Existing constraint was `status text not null default 'active'` with no
--    check; keep it open but add a check that lists valid values.
alter table public.subscriptions
  drop constraint if exists subscriptions_status_check;

alter table public.subscriptions
  add constraint subscriptions_status_check
  check (status in ('active', 'trialing', 'trial_expired', 'past_due', 'canceled', 'demo'));

-- 4. Seed a 'demo' subscription row for the global demo org so the Account
--    screen can show "Demo plan" rather than falling through to "no plan".
--    The demo org's id is fixed at d3e00000-… (see 0017_demo_mode.sql).
insert into public.subscriptions (
  organization_id, plan, status, seat_limit, ai_message_limit
)
values
  ('d3e00000-0000-0000-0000-000000000000', 'demo', 'demo', 1, 25)
on conflict (organization_id) do update
set plan           = excluded.plan,
    status         = excluded.status,
    seat_limit     = excluded.seat_limit,
    ai_message_limit = excluded.ai_message_limit
where public.subscriptions.plan <> 'demo';

-- Trigger: when a subscription transitions from 'trial' to any paid plan,
-- stamp trial_converted_at automatically (best-effort audit).
create or replace function public.stamp_trial_conversion()
returns trigger
language plpgsql
as $$
begin
  if (old.plan = 'trial' and new.plan in ('starter', 'pro', 'business') and new.trial_converted_at is null) then
    new.trial_converted_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists set_subscription_trial_conversion
  on public.subscriptions;
create trigger set_subscription_trial_conversion
  before update on public.subscriptions
  for each row execute function public.stamp_trial_conversion();

-- ============================================================================
-- Rollback notes
-- ============================================================================
-- To revert this migration cleanly:
--   drop trigger if exists set_subscription_trial_conversion on public.subscriptions;
--   drop function if exists public.stamp_trial_conversion();
--   update public.subscriptions set plan='starter', status='active'
--     where organization_id = 'd3e00000-0000-0000-0000-000000000000';
--   delete from public.subscriptions where organization_id = 'd3e00000-0000-0000-0000-000000000000' and plan='demo';
--   alter table public.subscriptions
--     drop column if exists trial_started_at,
--     drop column if exists trial_ends_at,
--     drop column if exists trial_converted_at,
--     drop constraint if exists subscriptions_status_check,
--     drop constraint if exists subscriptions_plan_check,
--     add constraint subscriptions_plan_check check (plan in ('starter','pro','business'));
