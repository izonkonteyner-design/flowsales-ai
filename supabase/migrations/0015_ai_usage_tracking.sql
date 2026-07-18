create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  feature text not null default 'quote_draft' check (feature = 'quote_draft'),
  provider text not null default 'gemini' check (provider = 'gemini'),
  model text,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_events_organization_created_idx
  on public.ai_usage_events (organization_id, created_at desc);

create index if not exists ai_usage_events_user_created_idx
  on public.ai_usage_events (user_id, created_at desc);

create index if not exists ai_usage_events_organization_feature_created_idx
  on public.ai_usage_events (organization_id, feature, created_at desc);

alter table public.ai_usage_events enable row level security;

drop policy if exists "members can read organization AI usage" on public.ai_usage_events;

create policy "members can read organization AI usage"
on public.ai_usage_events
for select
using (public.is_org_member(organization_id));

create or replace function public.reserve_quote_ai_usage(target_org uuid, target_model text default null)
returns table (
  usage_event_id uuid,
  remaining_usage integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  usage_limit_value integer;
  ai_message_limit_value integer;
  period_start timestamptz;
  period_end timestamptz;
  effective_limit integer;
  usage_count integer;
  normalized_model text := nullif(trim(coalesce(target_model, '')), '');
begin
  if current_user_id is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  if target_org is null then
    raise exception 'Organization is required.' using errcode = '22023';
  end if;

  if not public.is_org_member(target_org) then
    raise exception 'Workspace membership required.' using errcode = '42501';
  end if;

  perform 1
  from public.organizations o
  where o.id = target_org
  for update;

  if not found then
    raise exception 'Organization not found.' using errcode = 'P0002';
  end if;

  select s.usage_limit
  into usage_limit_value
  from public.ai_agent_settings s
  where s.organization_id = target_org;

  select
    sub.ai_message_limit,
    coalesce(sub.current_period_start, date_trunc('month', now())),
    coalesce(sub.current_period_end, coalesce(sub.current_period_start, date_trunc('month', now())) + interval '1 month')
  into ai_message_limit_value, period_start, period_end
  from public.subscriptions sub
  where sub.organization_id = target_org;

  if period_start is null then
    period_start := date_trunc('month', now());
  end if;

  if period_end is null or period_end <= period_start then
    period_end := period_start + interval '1 month';
  end if;

  effective_limit := least(
    greatest(coalesce(usage_limit_value, 500), 0),
    greatest(coalesce(ai_message_limit_value, 100), 0)
  );

  if effective_limit <= 0 then
    raise exception 'AI usage limit reached.' using errcode = 'P0001';
  end if;

  select count(*)
  into usage_count
  from public.ai_usage_events e
  where e.organization_id = target_org
    and e.feature = 'quote_draft'
    and e.provider = 'gemini'
    and e.created_at >= period_start
    and e.created_at < period_end
    and e.status in ('pending', 'succeeded', 'failed');

  if usage_count >= effective_limit then
    raise exception 'AI usage limit reached.' using errcode = 'P0001';
  end if;

  insert into public.ai_usage_events (
    organization_id,
    user_id,
    feature,
    provider,
    model,
    status
  )
  values (
    target_org,
    current_user_id,
    'quote_draft',
    'gemini',
    normalized_model,
    'pending'
  )
  returning id into usage_event_id;

  remaining_usage := greatest(effective_limit - usage_count - 1, 0);
  return next;
end;
$$;

revoke all on function public.reserve_quote_ai_usage(uuid, text) from public;
grant execute on function public.reserve_quote_ai_usage(uuid, text) to authenticated;

create or replace function public.finalize_quote_ai_usage(target_usage_event_id uuid, target_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  if target_status not in ('succeeded', 'failed') then
    raise exception 'Invalid usage status.' using errcode = '22023';
  end if;

  update public.ai_usage_events e
  set status = target_status
  where e.id = target_usage_event_id
    and e.user_id = current_user_id;

  if not found then
    raise exception 'Usage event not found.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.finalize_quote_ai_usage(uuid, text) from public;
grant execute on function public.finalize_quote_ai_usage(uuid, text) to authenticated;
