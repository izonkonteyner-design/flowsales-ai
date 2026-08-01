-- Owner/admin operational dashboard and alert resolution audit.
create table if not exists public.operational_alert_resolutions (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  alert_key text not null,
  resolved_by uuid not null references auth.users(id) on delete restrict,
  resolution_note text,
  resolved_at timestamptz not null default now(),
  primary key (organization_id, alert_key)
);

alter table public.operational_alert_resolutions enable row level security;

create policy operational_resolutions_admin_select on public.operational_alert_resolutions
for select to authenticated
using (public.has_org_permission(organization_id, 'manage_workspace'));

create or replace function public.resolve_operational_alert(
  p_organization_id uuid,
  p_alert_key text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_org_permission(p_organization_id, 'manage_workspace') then
    raise exception 'Not authorized';
  end if;
  if public.is_demo_organization(p_organization_id) then
    raise exception 'Demo workspace is read-only';
  end if;
  if length(trim(p_alert_key)) < 3 or length(p_alert_key) > 300 then
    raise exception 'Invalid alert key';
  end if;
  insert into public.operational_alert_resolutions (organization_id, alert_key, resolved_by, resolution_note)
  values (p_organization_id, trim(p_alert_key), auth.uid(), nullif(trim(p_note), ''))
  on conflict (organization_id, alert_key) do update
  set resolved_by = auth.uid(), resolution_note = excluded.resolution_note, resolved_at = now();
end;
$$;

revoke all on function public.resolve_operational_alert(uuid,text,text) from public;
grant execute on function public.resolve_operational_alert(uuid,text,text) to authenticated;

create or replace function public.get_operational_alerts(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_alerts jsonb;
begin
  if not public.has_org_permission(p_organization_id, 'manage_workspace') then
    raise exception 'Not authorized';
  end if;

  with raw_alerts as (
    select 'ai:' || r.id::text alert_key, 'ai_failure' category, 'high' severity,
      'AI run failed' title,
      concat(r.capability, coalesce(' · ' || r.error_code, '')) detail,
      r.created_at occurred_at, '/ai-history' href
    from public.ai_runs r
    where r.organization_id = p_organization_id and r.status = 'failed'
      and r.created_at >= now() - interval '30 days'
    union all
    select 'import:' || j.id::text, 'import_failure', 'medium', 'CSV import failed',
      concat(j.rejected_rows, ' rejected rows'), j.created_at, '/onboarding/import'
    from public.import_jobs j
    where j.organization_id = p_organization_id and j.status = 'failed'
      and j.created_at >= now() - interval '30 days'
    union all
    select 'billing:' || b.id, 'billing_failure', 'critical', 'Billing webhook failed',
      concat(b.event_type, coalesce(' · ' || left(b.error_message, 160), '')), b.received_at, '/upgrade'
    from public.billing_events b
    where b.organization_id = p_organization_id and b.status = 'failed'
      and b.received_at >= now() - interval '30 days'
    union all
    select 'lifecycle:' || l.id::text, 'lifecycle_request',
      case when l.requested_at < now() - interval '3 days' then 'high' else 'medium' end,
      'Account lifecycle request pending', l.request_type, l.requested_at, '/account/data'
    from public.account_lifecycle_requests l
    where l.organization_id = p_organization_id and l.status in ('pending','failed')
    union all
    select 'approval:' || a.id::text, 'stale_approval', 'medium', 'AI approval waiting',
      concat(a.capability, ' · ', a.risk_level), a.created_at, '/approvals'
    from public.ai_approval_requests a
    where a.organization_id = p_organization_id and a.status = 'pending'
      and a.created_at < now() - interval '24 hours'
    union all
    select 'entitlement:' || e.organization_id::text, 'entitlement_mismatch', 'critical',
      'Subscription entitlement needs review', concat(e.plan_key, ' · ', e.subscription_status), e.updated_at, '/upgrade'
    from public.organization_entitlements e
    where e.organization_id = p_organization_id
      and ((e.subscription_status = 'active' and e.billing_subscription_id is null)
        or (e.subscription_status in ('cancelled','expired') and e.plan_key <> 'trial'))
  ), visible as (
    select r.* from raw_alerts r
    left join public.operational_alert_resolutions x
      on x.organization_id = p_organization_id and x.alert_key = r.alert_key
    where x.alert_key is null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'key', alert_key, 'category', category, 'severity', severity,
    'title', title, 'detail', detail, 'occurredAt', occurred_at, 'href', href
  ) order by
    case severity when 'critical' then 1 when 'high' then 2 when 'medium' then 3 else 4 end,
    occurred_at desc), '[]'::jsonb)
  into v_alerts from visible;

  return v_alerts;
end;
$$;

revoke all on function public.get_operational_alerts(uuid) from public;
grant execute on function public.get_operational_alerts(uuid) to authenticated;
