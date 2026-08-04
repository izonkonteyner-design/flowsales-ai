-- Commercial access, onboarding, import, entitlements and billing foundation.

create table if not exists public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin','sales_manager','sales_rep','viewer')),
  invited_by uuid not null references auth.users(id) on delete restrict,
  accepted_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  unique (organization_id, email)
);

create table if not exists public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete restrict,
  entity_type text not null check (entity_type in ('leads','contacts','products')),
  status text not null default 'pending' check (status in ('pending','processing','completed','failed')),
  total_rows integer not null default 0 check (total_rows >= 0),
  imported_rows integer not null default 0 check (imported_rows >= 0),
  rejected_rows integer not null default 0 check (rejected_rows >= 0),
  error_report jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.billing_events (
  id text primary key,
  provider text not null,
  event_type text not null,
  organization_id uuid references public.organizations(id) on delete set null,
  payload jsonb not null,
  status text not null default 'received' check (status in ('received','processed','ignored','failed')),
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.organization_invitations enable row level security;
alter table public.import_jobs enable row level security;
alter table public.billing_events enable row level security;

create or replace function public.current_org_role(p_organization_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.role from public.organization_members m
  where m.organization_id = p_organization_id and m.user_id = auth.uid()
  limit 1;
$$;

create or replace function public.has_org_permission(p_organization_id uuid, p_permission text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_role text;
begin
  v_role := public.current_org_role(p_organization_id);
  if v_role is null then return false; end if;
  if v_role = 'owner' then return true; end if;
  if p_permission in ('manage_members','manage_billing','manage_workspace') then return v_role = 'admin'; end if;
  if p_permission in ('review_ai','manage_pipeline') then return v_role in ('admin','manager','sales_manager'); end if;
  if p_permission in ('run_ai','import_data','edit_crm') then return v_role in ('admin','manager','sales_manager','sales_rep','member'); end if;
  if p_permission = 'view_crm' then return true; end if;
  return false;
end;
$$;

revoke all on function public.current_org_role(uuid) from public;
revoke all on function public.has_org_permission(uuid,text) from public;
grant execute on function public.current_org_role(uuid) to authenticated;
grant execute on function public.has_org_permission(uuid,text) to authenticated;

create policy invitations_admin_all on public.organization_invitations for all to authenticated
using (public.has_org_permission(organization_id, 'manage_members'))
with check (public.has_org_permission(organization_id, 'manage_members') and invited_by = auth.uid());

create policy import_jobs_member_select on public.import_jobs for select to authenticated
using (public.is_org_member(organization_id));
create policy import_jobs_actor_insert on public.import_jobs for insert to authenticated
with check (public.has_org_permission(organization_id, 'import_data') and actor_id = auth.uid());

-- Billing events are service-role only. No authenticated policies are intentionally defined.

create or replace function public.check_workspace_entitlement(
  p_organization_id uuid,
  p_capability text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ent public.organization_entitlements;
  v_usage integer;
begin
  select * into v_ent from public.organization_entitlements where organization_id = p_organization_id;
  if v_ent.organization_id is null then return false; end if;
  if v_ent.subscription_status not in ('trialing','active') then return false; end if;
  if v_ent.subscription_status = 'trialing' and v_ent.trial_ends_at <= now() then return false; end if;
  if p_capability = 'ai_run' then
    select coalesce(sum(run_count),0) into v_usage from public.ai_usage_monthly
    where organization_id = p_organization_id and usage_month = date_trunc('month', now())::date;
    return v_usage < v_ent.monthly_ai_run_limit;
  end if;
  return true;
end;
$$;

revoke all on function public.check_workspace_entitlement(uuid,text) from public;
grant execute on function public.check_workspace_entitlement(uuid,text) to authenticated, service_role;

create or replace function public.initialize_workspace_trial(p_organization_id uuid)
returns public.organization_entitlements
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.organization_entitlements;
begin
  if not public.has_org_permission(p_organization_id, 'manage_workspace') then raise exception 'Not authorized'; end if;
  if public.is_demo_organization(p_organization_id) then raise exception 'Demo workspace is read-only'; end if;
  insert into public.organization_entitlements (organization_id)
  values (p_organization_id)
  on conflict (organization_id) do nothing;
  select * into v_row from public.organization_entitlements where organization_id = p_organization_id;
  return v_row;
end;
$$;

revoke all on function public.initialize_workspace_trial(uuid) from public;
grant execute on function public.initialize_workspace_trial(uuid) to authenticated;
