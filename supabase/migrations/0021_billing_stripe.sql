-- 0021_billing_stripe.sql
-- Idempotent migration: subscription/billing tables wired to Stripe.

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text unique,
  plan text not null check (plan in ('starter', 'pro', 'business', 'custom')),
  status text not null default 'incomplete' check (
    status in ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused')
  ),
  seat_quantity integer not null default 1 check (seat_quantity > 0),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  trial_end timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_organization_id_idx
  on public.subscriptions (organization_id);

create index if not exists subscriptions_stripe_customer_id_idx
  on public.subscriptions (stripe_customer_id);

create index if not exists subscriptions_status_idx
  on public.subscriptions (status);

-- At most one subscription per organization (current). Active flag enforces uniqueness.
create unique index if not exists subscriptions_one_active_per_org
  on public.subscriptions (organization_id)
  where status in ('incomplete', 'trialing', 'active', 'past_due', 'unpaid', 'paused');

alter table public.subscriptions enable row level security;

create policy "members can read own subscription"
  on public.subscriptions for select
  using (public.is_org_member(organization_id));

create policy "service role manages subscriptions"
  on public.subscriptions for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  stripe_invoice_id text unique,
  number text,
  currency text not null default 'try',
  amount_due integer not null default 0,
  amount_paid integer not null default 0,
  amount_remaining integer not null default 0,
  status text not null default 'open' check (
    status in ('draft', 'open', 'paid', 'uncollectible', 'void')
  ),
  period_start timestamptz,
  period_end timestamptz,
  hosted_invoice_url text,
  invoice_pdf_url text,
  paid_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists invoices_organization_id_idx
  on public.invoices (organization_id);

create index if not exists invoices_subscription_id_idx
  on public.invoices (subscription_id);

alter table public.invoices enable row level security;

create policy "members can read own invoices"
  on public.invoices for select
  using (public.is_org_member(organization_id));

create policy "service role manages invoices"
  on public.invoices for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('stripe')),
  external_event_id text not null unique,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  status text not null default 'received' check (
    status in ('received', 'processed', 'failed', 'ignored', 'replayed')
  ),
  error text,
  created_at timestamptz not null default now()
);

create index if not exists webhook_events_source_event_idx
  on public.webhook_events (source, external_event_id);

create index if not exists webhook_events_status_idx
  on public.webhook_events (status);

alter table public.webhook_events enable row level security;

create policy "service role manages webhook events"
  on public.webhook_events for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Updated-at automation
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

drop trigger if exists invoices_set_updated_at on public.invoices;
create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

-- Plan helpers (tenant-safe reads)
create or replace function public.get_active_subscription(target_org uuid)
returns public.subscriptions
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.subscriptions
  where organization_id = target_org
    and status in ('incomplete', 'trialing', 'active', 'past_due', 'unpaid', 'paused')
  order by created_at desc
  limit 1;
$$;

grant execute on function public.get_active_subscription(uuid) to authenticated;

create or replace function public.get_org_plan(target_org uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select plan from public.get_active_subscription(target_org)),
    'starter'
  );
$$;

grant execute on function public.get_org_plan(uuid) to authenticated;

create or replace function public.get_org_seat_limit(target_org uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case plan
    when 'starter' then 3
    when 'pro' then 10
    when 'business' then 50
    when 'custom' then 1000000
    else 3
  end
  from public.get_active_subscription(target_org)
  union all
  select 3
  where not exists (
    select 1 from public.subscriptions
    where organization_id = target_org
      and status in ('incomplete', 'trialing', 'active', 'past_due', 'unpaid', 'paused')
  )
  limit 1;
$$;

grant execute on function public.get_org_seat_limit(uuid) to authenticated;

create or replace function public.get_org_ai_message_limit(target_org uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case plan
    when 'starter' then 100
    when 'pro' then 500
    when 'business' then 2000
    when 'custom' then 1000000
    else 100
  end
  from public.get_active_subscription(target_org)
  union all
  select 100
  where not exists (
    select 1 from public.subscriptions
    where organization_id = target_org
      and status in ('incomplete', 'trialing', 'active', 'past_due', 'unpaid', 'paused')
  )
  limit 1;
$$;

grant execute on function public.get_org_ai_message_limit(uuid) to authenticated;

-- Seat capacity validation: prevents over-inviting beyond the active plan limit.
create or replace function public.assert_seat_capacity(target_org uuid, candidate_count integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seat_limit integer;
  v_current_members integer;
begin
  select public.get_org_seat_limit(target_org) into v_seat_limit;

  select count(*) into v_current_members
  from public.organization_members
  where organization_id = target_org;

  if candidate_count > v_seat_limit then
    raise exception 'Seat limit reached. % seats allowed, % in use.', v_seat_limit, v_current_members
      using errcode = 'P0001';
  end if;

  return true;
end;
$$;

grant execute on function public.assert_seat_capacity(uuid, integer) to authenticated;

-- 0021.b: also create optional ai_message_limit column on subscriptions for backwards compat.
-- New subscription writes may set this column to the plan's limit so the 0015
-- reserve_quote_ai_usage RPC keeps working without a schema rewrite.
alter table public.subscriptions
  add column if not exists ai_message_limit integer not null default 100;

comment on column public.subscriptions.ai_message_limit is
  'Denormalized plan AI message limit, mirrored from get_org_ai_message_limit for older RPCs.';

-- Backfill any existing subscription rows from get_org_ai_message_limit.
do $$
declare
  row record;
  v_limit integer;
begin
  for row in select id, organization_id from public.subscriptions loop
    v_limit := public.get_org_ai_message_limit(row.organization_id);
    update public.subscriptions
      set ai_message_limit = v_limit
      where id = row.id;
  end loop;
end $$;

