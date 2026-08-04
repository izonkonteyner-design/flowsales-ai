-- Idempotent CI evaluation evidence persistence and deployment readiness version 0026.

alter table public.ai_evaluation_runs
  add column if not exists run_key text;

update public.ai_evaluation_runs
set run_key = concat_ws(':', suite_key, prompt_version, coalesce(model, 'unknown'), coalesce(commit_sha, id::text))
where run_key is null;

alter table public.ai_evaluation_runs
  alter column run_key set not null;

create unique index if not exists ai_evaluation_runs_run_key_uidx
  on public.ai_evaluation_runs (run_key);

insert into public.deployment_migrations (version, name)
values ('0026', 'ai_evaluation_release_evidence')
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
  v_required_version constant text := '0026';
  v_function text;
  v_table text;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;

  foreach v_function in array array[
    'health_check','join_demo_workspace','check_demo_rate_limit','is_demo_organization',
    'can_review_ai_approvals','check_workspace_entitlement','record_ai_usage',
    'create_user_notification','get_operational_alerts','resolve_operational_alert',
    'get_ai_quality_dashboard'
  ] loop
    if not exists (
      select 1 from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = v_function
    ) then v_missing_functions := array_append(v_missing_functions, v_function); end if;
  end loop;

  foreach v_table in array array[
    'ai_runs','ai_approval_requests','ai_approval_events','workspace_entitlements',
    'ai_usage_monthly','notifications','organization_invitations','import_jobs',
    'billing_events','account_lifecycle_requests','deployment_migrations',
    'operational_alert_resolutions','ai_run_feedback','ai_evaluation_runs'
  ] loop
    if to_regclass(format('public.%I', v_table)) is null then
      v_missing_tables := array_append(v_missing_tables, v_table);
    end if;
  end loop;

  select max(version) into v_latest_version from public.deployment_migrations;
  return jsonb_build_object(
    'ready', coalesce(v_latest_version, '') >= v_required_version
      and cardinality(v_missing_functions) = 0 and cardinality(v_missing_tables) = 0,
    'latestMigration', v_latest_version,
    'requiredMigration', v_required_version,
    'missingFunctions', to_jsonb(v_missing_functions),
    'missingTables', to_jsonb(v_missing_tables)
  );
end;
$$;

revoke all on function public.deployment_readiness() from public, anon, authenticated;
grant execute on function public.deployment_readiness() to service_role;
