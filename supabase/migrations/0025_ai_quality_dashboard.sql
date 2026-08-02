-- Owner/admin AI quality dashboard aggregation and deployment readiness version 0025.

create or replace function public.get_ai_quality_dashboard(
  p_organization_id uuid,
  p_days integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 30), 365));
  v_since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)));
  v_summary jsonb;
  v_segments jsonb;
  v_evaluations jsonb;
  v_risks jsonb := '[]'::jsonb;
  v_total bigint := 0;
  v_feedback bigint := 0;
  v_helpful bigint := 0;
  v_failed bigint := 0;
  v_latest_eval_status text;
  v_latest_eval_at timestamptz;
begin
  if not exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
  ) then
    raise exception 'Owner or admin role required';
  end if;

  select
    count(*) filter (where r.status = 'completed'),
    count(*) filter (where r.status = 'failed')
  into v_total, v_failed
  from public.ai_runs r
  where r.organization_id = p_organization_id
    and r.created_at >= v_since;

  select
    count(*),
    count(*) filter (where f.rating = 'helpful')
  into v_feedback, v_helpful
  from public.ai_run_feedback f
  where f.organization_id = p_organization_id
    and f.created_at >= v_since;

  v_summary := jsonb_build_object(
    'windowDays', v_days,
    'completedRuns', v_total,
    'failedRuns', v_failed,
    'feedbackCount', v_feedback,
    'helpfulCount', v_helpful,
    'notHelpfulCount', greatest(v_feedback - v_helpful, 0),
    'feedbackCoverage', case when v_total = 0 then 0 else round((v_feedback::numeric / v_total::numeric), 4) end,
    'helpfulRate', case when v_feedback = 0 then null else round((v_helpful::numeric / v_feedback::numeric), 4) end
  );

  select coalesce(jsonb_agg(to_jsonb(s) order by s.completed_runs desc, s.capability, s.prompt_version, s.model), '[]'::jsonb)
  into v_segments
  from (
    select
      r.capability,
      coalesce(r.prompt_version, 'unknown') as prompt_version,
      coalesce(r.model, 'unknown') as model,
      count(*) filter (where r.status = 'completed')::integer as completed_runs,
      count(*) filter (where r.status = 'failed')::integer as failed_runs,
      count(f.id)::integer as feedback_count,
      count(f.id) filter (where f.rating = 'helpful')::integer as helpful_count,
      count(f.id) filter (where f.rating = 'not_helpful')::integer as not_helpful_count,
      case
        when count(f.id) = 0 then null
        else round((count(f.id) filter (where f.rating = 'helpful'))::numeric / count(f.id)::numeric, 4)
      end as helpful_rate,
      max(r.created_at) as latest_run_at
    from public.ai_runs r
    left join public.ai_run_feedback f on f.run_id = r.id and f.organization_id = r.organization_id
    where r.organization_id = p_organization_id
      and r.created_at >= v_since
    group by r.capability, coalesce(r.prompt_version, 'unknown'), coalesce(r.model, 'unknown')
  ) s;

  select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc), '[]'::jsonb)
  into v_evaluations
  from (
    select
      id,
      suite_key,
      prompt_version,
      coalesce(model, 'unknown') as model,
      total_cases,
      passed_cases,
      score,
      status,
      commit_sha,
      created_at
    from public.ai_evaluation_runs
    order by created_at desc
    limit 20
  ) e;

  select status, created_at
  into v_latest_eval_status, v_latest_eval_at
  from public.ai_evaluation_runs
  order by created_at desc
  limit 1;

  if v_total = 0 then
    v_risks := v_risks || jsonb_build_array(jsonb_build_object(
      'key', 'no_completed_runs',
      'severity', 'medium',
      'title', 'No completed AI runs in the selected window',
      'detail', 'Quality cannot be evaluated without completed production runs.'
    ));
  end if;

  if v_total > 0 and (v_feedback::numeric / v_total::numeric) < 0.10 then
    v_risks := v_risks || jsonb_build_array(jsonb_build_object(
      'key', 'low_feedback_coverage',
      'severity', 'medium',
      'title', 'Feedback coverage is below 10%',
      'detail', 'Collect more user feedback before making prompt or model decisions.'
    ));
  end if;

  if v_feedback >= 5 and (v_helpful::numeric / v_feedback::numeric) < 0.70 then
    v_risks := v_risks || jsonb_build_array(jsonb_build_object(
      'key', 'low_helpful_rate',
      'severity', 'high',
      'title', 'Helpful rate is below 70%',
      'detail', 'Review the lowest-performing capability, prompt version and model segments.'
    ));
  end if;

  if v_latest_eval_status is null then
    v_risks := v_risks || jsonb_build_array(jsonb_build_object(
      'key', 'missing_evaluation_evidence',
      'severity', 'high',
      'title', 'No persisted regression evaluation evidence',
      'detail', 'CI evaluation reports must be persisted before a prompt release is promoted.'
    ));
  elsif v_latest_eval_status = 'failed' then
    v_risks := v_risks || jsonb_build_array(jsonb_build_object(
      'key', 'latest_evaluation_failed',
      'severity', 'critical',
      'title', 'Latest regression evaluation failed',
      'detail', 'Do not promote the evaluated prompt or model version.'
    ));
  elsif v_latest_eval_at < now() - interval '30 days' then
    v_risks := v_risks || jsonb_build_array(jsonb_build_object(
      'key', 'stale_evaluation_evidence',
      'severity', 'medium',
      'title', 'Regression evidence is older than 30 days',
      'detail', 'Run and persist the evaluation suite again before the next production release.'
    ));
  end if;

  return jsonb_build_object(
    'generatedAt', now(),
    'summary', v_summary,
    'segments', v_segments,
    'evaluations', v_evaluations,
    'risks', v_risks
  );
end;
$$;

revoke all on function public.get_ai_quality_dashboard(uuid, integer) from public, anon;
grant execute on function public.get_ai_quality_dashboard(uuid, integer) to authenticated;

insert into public.deployment_migrations (version, name)
values ('0025', 'ai_quality_dashboard')
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
  v_required_version constant text := '0025';
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
