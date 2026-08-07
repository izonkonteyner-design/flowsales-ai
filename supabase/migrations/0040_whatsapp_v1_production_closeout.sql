-- WhatsApp v1 production closeout: auditable conversation operations and webhook dead-letter lifecycle.

create table if not exists public.conversation_operation_audit (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  event_type text not null check (event_type in (
    'message_sent','message_retry','template_sent','ai_suggestion_generated','ai_suggestion_reviewed',
    'crm_lead_created','crm_lead_converted','crm_note_added','crm_task_created','crm_quote_created',
    'conversation_status_changed','conversation_assignee_changed','webhook_reprocessed'
  )),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.conversation_operation_audit enable row level security;
create index if not exists conversation_operation_audit_timeline_idx
  on public.conversation_operation_audit (organization_id, conversation_id, created_at desc);

drop policy if exists conversation_operation_audit_read on public.conversation_operation_audit;
create policy conversation_operation_audit_read on public.conversation_operation_audit
for select to authenticated using (public.is_org_member(organization_id));

-- Writes are server/service-role only so actor identity cannot be forged by a browser client.
revoke all on public.conversation_operation_audit from anon, authenticated;
grant select on public.conversation_operation_audit to authenticated;
grant all on public.conversation_operation_audit to service_role;

alter table public.webhook_events
  add column if not exists last_attempt_at timestamptz,
  add column if not exists dead_lettered_at timestamptz,
  add column if not exists last_error_code text;

create index if not exists webhook_events_dead_letter_idx
  on public.webhook_events (organization_id, provider, dead_lettered_at desc)
  where dead_lettered_at is not null;

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
    'get_ai_quality_dashboard','persist_whatsapp_inbound_message',
    'normalize_crm_phone','get_whatsapp_identity_candidates','resolve_whatsapp_identity_manual'
  ] loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=v_function)
    then v_missing_functions := array_append(v_missing_functions, v_function); end if;
  end loop;
  foreach v_table in array array[
    'ai_runs','ai_approval_requests','ai_approval_events','workspace_entitlements','ai_usage_monthly',
    'notifications','organization_invitations','import_jobs','billing_events','account_lifecycle_requests',
    'deployment_migrations','operational_alert_resolutions','ai_run_feedback','ai_evaluation_runs',
    'channel_connections','channel_accounts','channel_contacts','conversations','messages','webhook_events',
    'conversation_identity_resolution_audit','conversation_operation_audit'
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
values ('0040', '0040_whatsapp_v1_production_closeout.sql', '7d1dbb2b748942d3a417b11ef0bca040')
on conflict (version) do update set name = excluded.name, executed_at = now();
