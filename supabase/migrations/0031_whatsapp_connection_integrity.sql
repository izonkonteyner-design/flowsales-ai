-- Migration: 0031_whatsapp_connection_integrity.sql
-- Atomic WhatsApp Embedded Signup authorization code consumption RPC & Serverless Distributed Rate Limiting.

-- ============================================================================
-- 1. Atomic Authorization Code Consumption RPC
-- ============================================================================

create or replace function public.consume_whatsapp_authorization_code(
  p_provider text,
  p_code_hash text,
  p_organization_id uuid,
  p_user_id uuid,
  p_ttl_seconds integer default 600
)
returns table (
  status text
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_expires_at timestamptz := v_now + (p_ttl_seconds || ' seconds')::interval;
  v_existing record;
  v_updated_id uuid;
begin
  -- Try to insert new code record pre-consumed atomically
  insert into public.oauth_authorization_codes (
    organization_id,
    user_id,
    provider,
    code_hash,
    expires_at,
    consumed_at
  )
  values (
    p_organization_id,
    p_user_id,
    p_provider,
    p_code_hash,
    v_expires_at,
    v_now
  );

  return query select 'consumed'::text;
  return;

exception
  when unique_violation then
    -- Record already exists. Lock row and check state atomically
    select id, organization_id, user_id, consumed_at, expires_at
    into v_existing
    from public.oauth_authorization_codes
    where provider = p_provider and code_hash = p_code_hash
    for update;

    if v_existing.id is null then
      return query select 'already_used'::text;
      return;
    end if;

    if v_existing.organization_id <> p_organization_id or v_existing.user_id <> p_user_id then
      return query select 'already_used'::text;
      return;
    end if;

    if v_existing.consumed_at is not null then
      return query select 'already_used'::text;
      return;
    end if;

    if v_existing.expires_at < v_now then
      return query select 'expired'::text;
      return;
    end if;

    -- Atomically update if unconsumed
    update public.oauth_authorization_codes
    set consumed_at = v_now
    where id = v_existing.id and consumed_at is null
    returning id into v_updated_id;

    if v_updated_id is not null then
      return query select 'consumed'::text;
    else
      return query select 'already_used'::text;
    end if;
    return;
end;
$$;

revoke all on function public.consume_whatsapp_authorization_code(text, text, uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.consume_whatsapp_authorization_code(text, text, uuid, uuid, integer) to service_role;

-- ============================================================================
-- 2. Serverless Distributed Rate Limiting Table & RPC
-- ============================================================================

create table if not exists public.rate_limits (
  id                uuid        primary key default gen_random_uuid(),
  key_hash          text        not null,
  action            text        not null,
  window_started_at timestamptz not null default now(),
  request_count     integer     not null default 1,
  expires_at        timestamptz not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint rate_limits_key_action_unique unique (key_hash, action)
);

create index if not exists idx_rate_limits_lookup
  on public.rate_limits (key_hash, action);

create index if not exists idx_rate_limits_expires
  on public.rate_limits (expires_at);

alter table public.rate_limits enable row level security;

create policy "service_role_manage_rate_limits"
  on public.rate_limits for all
  using (auth.role() = 'service_role');

create or replace function public.check_distributed_rate_limit(
  p_key_hash text,
  p_action text,
  p_max_requests integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  remaining integer,
  reset_ms integer
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window_start timestamptz := v_now - (p_window_seconds || ' seconds')::interval;
  v_expires_at timestamptz := v_now + (p_window_seconds || ' seconds')::interval;
  v_rec record;
  v_new_count integer;
  v_reset_ms integer;
begin
  -- Delete expired rate limit records periodically
  delete from public.rate_limits
  where expires_at < v_now;

  select * into v_rec
  from public.rate_limits
  where key_hash = p_key_hash and action = p_action
  for update;

  if v_rec.id is null then
    begin
      insert into public.rate_limits (
        key_hash,
        action,
        window_started_at,
        request_count,
        expires_at
      )
      values (
        p_key_hash,
        p_action,
        v_now,
        1,
        v_expires_at
      );

      return query select true, p_max_requests - 1, p_window_seconds * 1000;
      return;
    exception
      when unique_violation then
        select * into v_rec
        from public.rate_limits
        where key_hash = p_key_hash and action = p_action
        for update;
    end;
  end if;

  if v_rec.window_started_at < v_window_start then
    update public.rate_limits
    set window_started_at = v_now,
        request_count = 1,
        expires_at = v_expires_at,
        updated_at = v_now
    where id = v_rec.id;

    return query select true, p_max_requests - 1, p_window_seconds * 1000;
    return;
  end if;

  v_new_count := v_rec.request_count + 1;
  v_reset_ms := greatest(0, extract(epoch from (v_rec.window_started_at + (p_window_seconds || ' seconds')::interval - v_now)) * 1000)::integer;

  if v_new_count > p_max_requests then
    return query select false, 0, v_reset_ms;
    return;
  end if;

  update public.rate_limits
  set request_count = v_new_count,
      expires_at = v_expires_at,
      updated_at = v_now
  where id = v_rec.id;

  return query select true, p_max_requests - v_new_count, v_reset_ms;
  return;
end;
$$;

revoke all on function public.check_distributed_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_distributed_rate_limit(text, text, integer, integer) to service_role;

-- Register migration 0031 in deployment manifest
insert into public.deployment_migrations (version, name, checksum)
values (
  '0031',
  '0031_whatsapp_connection_integrity.sql',
  'a1b2c3d4e5f607182930415263748596'
)
on conflict (version) do update
set name = excluded.name, executed_at = now();
