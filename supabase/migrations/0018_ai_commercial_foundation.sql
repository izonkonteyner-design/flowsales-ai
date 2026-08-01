-- FlowSales AI commercial foundation
-- Adds persistent AI history, approval queue, usage, notifications, trial and billing state.

create table if not exists public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete restrict,
  lead_id uuid references public.leads(id) on delete set null,
  capability text not null check (capability in ('lead_scoring','next_best_action','opportunity_summary','follow_up_draft','product_recommendation','quote_recommendation')),
  status text not null check (status in ('started','completed','failed')),
  provider text,
  model text,
  decision text check (decision is null or decision in ('informational','approval_required','blocked')),
  approval_required boolean not null default false,
  output jsonb,
  error_code text,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  estimated_cost_usd numeric(12,6) not null default 0 check (estimated_cost_usd >= 0),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.ai_approval_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid not null references public.ai_runs(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete restrict,
  capability text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled','expired')),
  actions jsonb not null default '[]'::jsonb,
  summary text not null,
  risk_level text not null check (risk_level in ('low','medium','high')),
  version integer not null default 1 check (version > 0),
  expires_at timestamptz not null default (now() + interval '7 days'),
  decided_by uuid references auth.users(id) on delete restrict,
  decision_reason text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (run_id)
);

create table if not exists public.ai_approval_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  approval_id uuid not null references public.ai_approval_requests(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete restrict,
  event_type text not null check (event_type in ('created','approved','rejected','cancelled','expired','execution_started','execution_completed','execution_failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.organization_entitlements (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  plan_key text not null default 'trial' check (plan_key in ('trial','starter','growth','pro','enterprise')),
  subscription_status text not null default 'trialing' check (subscription_status in ('trialing','active','past_due','cancelled','expired')),
  trial_started_at timestamptz not null default now(),
  trial_ends_at timestamptz not null default (now() + interval '14 days'),
  billing_customer_id text,
  billing_subscription_id text,
  seat_limit integer not null default 3 check (seat_limit > 0),
  monthly_ai_run_limit integer not null default 100 check (monthly_ai_run_limit >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_usage_monthly (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  usage_month date not null,
  capability text not null,
  run_count integer not null default 0 check (run_count >= 0),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  estimated_cost_usd numeric(14,6) not null default 0 check (estimated_cost_usd >= 0),
  primary key (organization_id, usage_month, capability)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists ai_runs_org_created_idx on public.ai_runs (organization_id, created_at desc);
create index if not exists ai_runs_lead_created_idx on public.ai_runs (organization_id, lead_id, created_at desc);
create index if not exists ai_approval_pending_idx on public.ai_approval_requests (organization_id, status, created_at desc);
create index if not exists ai_approval_events_idx on public.ai_approval_events (organization_id, approval_id, created_at);
create index if not exists notifications_user_idx on public.notifications (organization_id, user_id, created_at desc);

alter table public.ai_runs enable row level security;
alter table public.ai_approval_requests enable row level security;
alter table public.ai_approval_events enable row level security;
alter table public.organization_entitlements enable row level security;
alter table public.ai_usage_monthly enable row level security;
alter table public.notifications enable row level security;

create or replace function public.is_org_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.can_review_ai_approvals(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and m.role in ('owner','admin','manager','sales_manager')
  );
$$;

revoke all on function public.is_org_member(uuid) from public;
revoke all on function public.can_review_ai_approvals(uuid) from public;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.can_review_ai_approvals(uuid) to authenticated;

create policy ai_runs_select_member on public.ai_runs for select to authenticated
using (public.is_org_member(organization_id));
create policy ai_runs_insert_actor on public.ai_runs for insert to authenticated
with check (public.is_org_member(organization_id) and actor_id = auth.uid());

create policy approvals_select_reviewer on public.ai_approval_requests for select to authenticated
using (public.can_review_ai_approvals(organization_id) or requested_by = auth.uid());
create policy approvals_insert_requester on public.ai_approval_requests for insert to authenticated
with check (public.is_org_member(organization_id) and requested_by = auth.uid());
create policy approvals_update_reviewer on public.ai_approval_requests for update to authenticated
using (public.can_review_ai_approvals(organization_id))
with check (public.can_review_ai_approvals(organization_id));

create policy approval_events_select_member on public.ai_approval_events for select to authenticated
using (public.is_org_member(organization_id));
create policy approval_events_insert_actor on public.ai_approval_events for insert to authenticated
with check (public.is_org_member(organization_id) and actor_id = auth.uid());

create policy entitlements_select_member on public.organization_entitlements for select to authenticated
using (public.is_org_member(organization_id));

create policy usage_select_member on public.ai_usage_monthly for select to authenticated
using (public.is_org_member(organization_id));

create policy notifications_select_owner on public.notifications for select to authenticated
using (public.is_org_member(organization_id) and user_id = auth.uid());
create policy notifications_update_owner on public.notifications for update to authenticated
using (public.is_org_member(organization_id) and user_id = auth.uid())
with check (public.is_org_member(organization_id) and user_id = auth.uid());

-- Demo workspace is read-only even for members. Service code must also enforce this boundary.
create or replace function public.is_demo_organization(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.organizations o where o.id = p_organization_id and o.slug = 'flowsales-demo');
$$;

revoke all on function public.is_demo_organization(uuid) from public;
grant execute on function public.is_demo_organization(uuid) to authenticated, service_role;

create or replace function public.decide_ai_approval(
  p_approval_id uuid,
  p_expected_version integer,
  p_decision text,
  p_reason text default null
)
returns public.ai_approval_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.ai_approval_requests;
begin
  if p_decision not in ('approved','rejected') then
    raise exception 'Invalid approval decision';
  end if;

  select * into v_row from public.ai_approval_requests where id = p_approval_id for update;
  if v_row.id is null then raise exception 'Approval not found'; end if;
  if not public.can_review_ai_approvals(v_row.organization_id) then raise exception 'Not authorized'; end if;
  if public.is_demo_organization(v_row.organization_id) then raise exception 'Demo workspace is read-only'; end if;
  if v_row.status <> 'pending' then raise exception 'Approval is not pending'; end if;
  if v_row.version <> p_expected_version then raise exception 'Approval version conflict'; end if;
  if v_row.expires_at <= now() then
    update public.ai_approval_requests set status = 'expired', version = version + 1 where id = p_approval_id returning * into v_row;
    raise exception 'Approval expired';
  end if;

  update public.ai_approval_requests
  set status = p_decision,
      decided_by = auth.uid(),
      decision_reason = nullif(trim(p_reason), ''),
      decided_at = now(),
      version = version + 1
  where id = p_approval_id
  returning * into v_row;

  insert into public.ai_approval_events (organization_id, approval_id, actor_id, event_type, metadata)
  values (v_row.organization_id, v_row.id, auth.uid(), p_decision, jsonb_build_object('version', v_row.version));

  return v_row;
end;
$$;

revoke all on function public.decide_ai_approval(uuid, integer, text, text) from public;
grant execute on function public.decide_ai_approval(uuid, integer, text, text) to authenticated;
