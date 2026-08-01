-- Production deployment manifest and readiness probe.
-- This migration is expected to run after 0018-0021 in the ordered Supabase migration chain.

create table if not exists public.deployment_migrations (
  version text primary key,
  name text not null,
  applied_at timestamptz not null default now()
);

alter table public.deployment_migrations enable row level security;

-- No browser policies are created. Deployment metadata is service-role only.
insert into public.deployment_migrations (version, name)
values
  ('0018', 'ai_commercial_foundation'),
  ('0019', 'ai_approval_payload_alignment'),
  ('0020', 'commercial_access_onboarding_billing'),
  ('0021', 'usage_notifications_account_lifecycle'),
  ('0022', 'deployment_manifest_probe')
on conflict (version) do update set name = excluded.name;

create or replace function public.deployment_readiness()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_missing_functions text[] := array[]::text[];
  v_missing_tables text[] := array[]::text[];
  v_latest_version text;
  v_required_version constant text := '0022';
  v_function text;
  v_table text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;

  foreach v_function in array array[
    'health_check',
    'join_demo_workspace',
    'check_demo_rate_limit',
    'is_demo_organization',
    'can_review_ai_approvals',
    'check_workspace_entitlement',
    'record_ai_usage',
    'create_user_notification'
  ] loop
    if not exists (
      select 1
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = v_function
    ) then
      v_missing_functions := array_append(v_missing_functions, v_function);
    end if;
  end loop;

  foreach v_table in array array[
    'ai_runs',
    'ai_approval_requests',
    'ai_approval_events',
    'workspace_entitlements',
    'ai_usage_monthly',
    'notifications',
    'organization_invitations',
    'import_jobs',
    'billing_events',
    'account_lifecycle_requests',
    'deployment_migrations'
  ] loop
    if to_regclass(format('public.%I', v_table)) is null then
      v_missing_tables := array_append(v_missing_tables, v_table);
    end if;
  end loop;

  select max(version) into v_latest_version from public.deployment_migrations;

  return jsonb_build_object(
    'ready',
      coalesce(v_latest_version, '') >= v_required_version
      and cardinality(v_missing_functions) = 0
      and cardinality(v_missing_tables) = 0,
    'latestMigration', v_latest_version,
    'requiredMigration', v_required_version,
    'missingFunctions', to_jsonb(v_missing_functions),
    'missingTables', to_jsonb(v_missing_tables)
  );
end;
$$;

revoke all on table public.deployment_migrations from public, anon, authenticated;
revoke all on function public.deployment_readiness() from public, anon, authenticated;
grant select on table public.deployment_migrations to service_role;
grant execute on function public.deployment_readiness() to service_role;
