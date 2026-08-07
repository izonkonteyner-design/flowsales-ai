-- 0040_whatsapp_ops_audit_hardening.sql
-- Production operations: audit history + bounded webhook retry/dead-letter lifecycle.

create table if not exists public.whatsapp_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in (
    'message_sent','message_failed','message_retry_requested',
    'template_sent','template_failed',
    'ai_suggestion_generated','ai_suggestion_reviewed',
    'crm_note_added','crm_task_created','crm_lead_converted','crm_quote_opened',
    'conversation_status_changed','conversation_assignee_changed',
    'webhook_reprocess_requested','webhook_reprocess_succeeded','webhook_dead_lettered'
  )),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.whatsapp_audit_events enable row level security;

create index if not exists whatsapp_audit_events_org_created_idx
  on public.whatsapp_audit_events (organization_id, created_at desc);
create index if not exists whatsapp_audit_events_conversation_created_idx
  on public.whatsapp_audit_events (conversation_id, created_at desc)
  where conversation_id is not null;

drop policy if exists "members_read_whatsapp_audit_events" on public.whatsapp_audit_events;
create policy "members_read_whatsapp_audit_events"
  on public.whatsapp_audit_events for select
  using (public.is_org_member(organization_id));

drop policy if exists "service_role_manage_whatsapp_audit_events" on public.whatsapp_audit_events;
create policy "service_role_manage_whatsapp_audit_events"
  on public.whatsapp_audit_events for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

alter table public.webhook_events
  add column if not exists last_attempt_at timestamptz,
  add column if not exists next_retry_at timestamptz,
  add column if not exists dead_lettered_at timestamptz;

create index if not exists webhook_events_retry_queue_idx
  on public.webhook_events (provider, status, next_retry_at)
  where status = 'failed' and dead_lettered_at is null;
create index if not exists webhook_events_dead_letter_idx
  on public.webhook_events (organization_id, provider, dead_lettered_at desc)
  where dead_lettered_at is not null;

create or replace function public.claim_webhook_event_for_reprocess(
  p_event_id uuid,
  p_organization_id uuid,
  p_max_attempts integer default 5
)
returns table (
  id uuid,
  organization_id uuid,
  provider text,
  payload jsonb,
  retry_count integer
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  if p_max_attempts < 1 or p_max_attempts > 20 then raise exception 'invalid retry limit'; end if;

  update public.webhook_events w
  set status = 'processing',
      processing_started_at = now(),
      last_attempt_at = now(),
      retry_count = w.retry_count + 1,
      next_retry_at = null,
      error_message = null
  where w.id = p_event_id
    and w.organization_id = p_organization_id
    and w.provider = 'whatsapp'
    and w.status in ('failed','received')
    and w.dead_lettered_at is null
    and w.retry_count < p_max_attempts;

  return query
  select w.id, w.organization_id, w.provider, w.payload, w.retry_count
  from public.webhook_events w
  where w.id = p_event_id
    and w.organization_id = p_organization_id
    and w.status = 'processing';
end;
$$;

revoke all on function public.claim_webhook_event_for_reprocess(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_webhook_event_for_reprocess(uuid, uuid, integer) to service_role;

create or replace function public.deployment_readiness()
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_missing_functions text[] := array[]::text[]; v_missing_tables text[] := array[]::text[];
  v_latest_version text; v_required_version constant text := '0040'; v_function text; v_table text;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  foreach v_function in array array[
    'health_check','join_demo_workspace','check_demo_rate_limit','is_demo_organization',
    'can_review_ai_approvals','check_workspace_entitlement','record_ai_usage',
    'create_user_notification','get_operational_alerts','resolve_operational_alert',
    'get_ai_quality_dashboard','persist_whatsapp_inbound_message','normalize_crm_phone',
    'get_whatsapp_identity_candidates','resolve_whatsapp_identity_manual','claim_webhook_event_for_reprocess'
  ] loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=v_function)
    then v_missing_functions := array_append(v_missing_functions, v_function); end if;
  end loop;
  foreach v_table in array array[
    'ai_runs','ai_approval_requests','ai_approval_events','workspace_entitlements',
    'ai_usage_monthly','notifications','organization_invitations','import_jobs',
    'billing_events','account_lifecycle_requests','deployment_migrations',
    'operational_alert_resolutions','ai_run_feedback','ai_evaluation_runs',
    'channel_connections','channel_accounts','channel_contacts','conversations','messages','webhook_events',
    'conversation_identity_resolution_audit','whatsapp_audit_events'
  ] loop
    if to_regclass(format('public.%I', v_table)) is null then v_missing_tables := array_append(v_missing_tables, v_table); end if;
  end loop;
  select max(version) into v_latest_version from deployment_migrations;
  return jsonb_build_object(
    'ready', coalesce(v_latest_version,'') >= v_required_version and cardinality(v_missing_functions)=0 and cardinality(v_missing_tables)=0,
    'latestMigration', v_latest_version, 'requiredMigration', v_required_version,
    'missingFunctions', to_jsonb(v_missing_functions), 'missingTables', to_jsonb(v_missing_tables));
end;
$$;
revoke all on function public.deployment_readiness() from public, anon, authenticated;
grant execute on function public.deployment_readiness() to service_role;

insert into public.deployment_migrations (version, name, checksum)
values ('0040', '0040_whatsapp_ops_audit_hardening.sql', 'e40a9c1d7f6b2a0039a11d7c0040f00d')
on conflict (version) do update set name = excluded.name, executed_at = now();
