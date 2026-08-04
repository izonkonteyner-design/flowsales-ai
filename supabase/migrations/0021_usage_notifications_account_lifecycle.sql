-- Commercial observability, notifications and account lifecycle.

create table if not exists public.account_lifecycle_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete restrict,
  request_type text not null check (request_type in ('export','delete_workspace','delete_account')),
  status text not null default 'pending' check (status in ('pending','processing','completed','rejected','cancelled','failed')),
  reason text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists account_lifecycle_org_idx
  on public.account_lifecycle_requests (organization_id, requested_at desc);

alter table public.account_lifecycle_requests enable row level security;

create policy lifecycle_select_requester on public.account_lifecycle_requests
for select to authenticated
using (
  public.is_org_member(organization_id)
  and (requested_by = auth.uid() or public.has_org_permission(organization_id, 'manage_workspace'))
);

create policy lifecycle_insert_requester on public.account_lifecycle_requests
for insert to authenticated
with check (
  public.is_org_member(organization_id)
  and requested_by = auth.uid()
  and not public.is_demo_organization(organization_id)
);

create or replace function public.record_ai_usage(
  p_organization_id uuid,
  p_capability text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_estimated_cost_usd numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  if p_input_tokens < 0 or p_output_tokens < 0 or p_estimated_cost_usd < 0 then
    raise exception 'Usage values cannot be negative';
  end if;

  insert into public.ai_usage_monthly (
    organization_id, usage_month, capability, run_count,
    input_tokens, output_tokens, estimated_cost_usd
  ) values (
    p_organization_id, date_trunc('month', now())::date, p_capability, 1,
    p_input_tokens, p_output_tokens, p_estimated_cost_usd
  )
  on conflict (organization_id, usage_month, capability) do update
  set run_count = public.ai_usage_monthly.run_count + 1,
      input_tokens = public.ai_usage_monthly.input_tokens + excluded.input_tokens,
      output_tokens = public.ai_usage_monthly.output_tokens + excluded.output_tokens,
      estimated_cost_usd = public.ai_usage_monthly.estimated_cost_usd + excluded.estimated_cost_usd;
end;
$$;

revoke all on function public.record_ai_usage(uuid, text, integer, integer, numeric) from public;
grant execute on function public.record_ai_usage(uuid, text, integer, integer, numeric) to service_role;

create or replace function public.create_user_notification(
  p_organization_id uuid,
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_href text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  if not exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id and m.user_id = p_user_id
  ) then raise exception 'Notification recipient is not a workspace member'; end if;

  insert into public.notifications (organization_id, user_id, type, title, body, href)
  values (p_organization_id, p_user_id, p_type, p_title, p_body, p_href)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.create_user_notification(uuid, uuid, text, text, text, text) from public;
grant execute on function public.create_user_notification(uuid, uuid, text, text, text, text) to service_role;
