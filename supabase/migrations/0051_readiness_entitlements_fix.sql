-- Repair the production readiness manifest to use the canonical entitlement table.

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
  v_required_version constant text := '0051';
  v_function text;
  v_table text;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;

  foreach v_function in array array[
    'health_check','join_demo_workspace','check_demo_rate_limit','is_demo_organization',
    'can_review_ai_approvals','check_workspace_entitlement','record_ai_usage',
    'create_user_notification','get_operational_alerts','resolve_operational_alert',
    'get_ai_quality_dashboard','persist_whatsapp_inbound_message','normalize_crm_phone',
    'get_whatsapp_identity_candidates','resolve_whatsapp_identity_manual','claim_webhook_event_for_reprocess'
  ] loop
    if not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = v_function
    ) then
      v_missing_functions := array_append(v_missing_functions, v_function);
    end if;
  end loop;

  foreach v_table in array array[
    'ai_runs','ai_approval_requests','ai_approval_events','organization_entitlements',
    'ai_usage_monthly','notifications','organization_invitations','import_jobs',
    'billing_events','account_lifecycle_requests','deployment_migrations',
    'operational_alert_resolutions','ai_run_feedback','ai_evaluation_runs',
    'channel_connections','channel_accounts','channel_contacts','conversations','messages','webhook_events',
    'conversation_identity_resolution_audit','whatsapp_audit_events'
  ] loop
    if to_regclass(format('public.%I', v_table)) is null then
      v_missing_tables := array_append(v_missing_tables, v_table);
    end if;
  end loop;

  select max(version) into v_latest_version from public.deployment_migrations;
  return jsonb_build_object(
    'ready', coalesce(v_latest_version, '') >= v_required_version
      and cardinality(v_missing_functions) = 0
      and cardinality(v_missing_tables) = 0,
    'latestMigration', v_latest_version,
    'requiredMigration', v_required_version,
    'missingFunctions', to_jsonb(v_missing_functions),
    'missingTables', to_jsonb(v_missing_tables)
  );
end;
$$;

revoke all on function public.deployment_readiness() from public, anon, authenticated;
grant execute on function public.deployment_readiness() to service_role;

insert into public.deployment_migrations(version, name, checksum)
values ('0051','0051_readiness_entitlements_fix.sql','readiness-entitlements-2026-08-12')
on conflict (version) do update set name = excluded.name, checksum = excluded.checksum, executed_at = now();
