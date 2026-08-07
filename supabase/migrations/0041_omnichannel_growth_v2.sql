-- 0041_omnichannel_growth_v2.sql
-- Instagram/Facebook messaging support, AI qualification evidence, and human-approved follow-up automation.

create table if not exists public.omnichannel_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  provider text check (provider in ('whatsapp','instagram','facebook','google','tiktok')),
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.omnichannel_audit_events enable row level security;
create index if not exists omnichannel_audit_events_org_created_idx on public.omnichannel_audit_events (organization_id, created_at desc);
create index if not exists omnichannel_audit_events_conversation_idx on public.omnichannel_audit_events (conversation_id, created_at desc) where conversation_id is not null;
drop policy if exists "members_read_omnichannel_audit_events" on public.omnichannel_audit_events;
create policy "members_read_omnichannel_audit_events" on public.omnichannel_audit_events for select using (public.is_org_member(organization_id));
drop policy if exists "service_role_manage_omnichannel_audit_events" on public.omnichannel_audit_events;
create policy "service_role_manage_omnichannel_audit_events" on public.omnichannel_audit_events for all using (auth.role()='service_role') with check (auth.role()='service_role');

create table if not exists public.conversation_ai_qualifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  provider text not null check (provider in ('whatsapp','instagram','facebook','google','tiktok')),
  score integer not null check (score between 0 and 100),
  intent text not null check (intent in ('buying','pricing','availability','support','research','other')),
  temperature text not null check (temperature in ('hot','warm','cold')),
  summary text not null,
  next_best_action text not null,
  recommended_follow_up_at timestamptz,
  model text,
  prompt_version text not null default '2026-08-07.1',
  input_hash text not null,
  status text not null default 'suggested' check (status in ('suggested','accepted','dismissed')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.conversation_ai_qualifications enable row level security;
create index if not exists conversation_ai_qualifications_conv_idx on public.conversation_ai_qualifications (conversation_id, created_at desc);
create index if not exists conversation_ai_qualifications_org_score_idx on public.conversation_ai_qualifications (organization_id, score desc, created_at desc);
drop policy if exists "members_read_conversation_ai_qualifications" on public.conversation_ai_qualifications;
create policy "members_read_conversation_ai_qualifications" on public.conversation_ai_qualifications for select using (public.is_org_member(organization_id));
drop policy if exists "service_role_manage_conversation_ai_qualifications" on public.conversation_ai_qualifications;
create policy "service_role_manage_conversation_ai_qualifications" on public.conversation_ai_qualifications for all using (auth.role()='service_role') with check (auth.role()='service_role');

create table if not exists public.sales_follow_up_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  qualification_id uuid references public.conversation_ai_qualifications(id) on delete set null,
  status text not null default 'active' check (status in ('active','paused','completed','cancelled')),
  strategy text not null,
  requires_human_approval boolean not null default true check (requires_human_approval = true),
  next_action_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.sales_follow_up_plans enable row level security;
create index if not exists sales_follow_up_plans_org_next_idx on public.sales_follow_up_plans (organization_id, status, next_action_at);
drop policy if exists "members_read_sales_follow_up_plans" on public.sales_follow_up_plans;
create policy "members_read_sales_follow_up_plans" on public.sales_follow_up_plans for select using (public.is_org_member(organization_id));
drop policy if exists "service_role_manage_sales_follow_up_plans" on public.sales_follow_up_plans;
create policy "service_role_manage_sales_follow_up_plans" on public.sales_follow_up_plans for all using (auth.role()='service_role') with check (auth.role()='service_role');

create table if not exists public.sales_follow_up_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan_id uuid not null references public.sales_follow_up_plans(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  action_type text not null check (action_type in ('reply_draft','call','task','reminder')),
  status text not null default 'approval_required' check (status in ('approval_required','approved','completed','cancelled','failed')),
  scheduled_for timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.sales_follow_up_actions enable row level security;
create index if not exists sales_follow_up_actions_due_idx on public.sales_follow_up_actions (organization_id, status, scheduled_for);
drop policy if exists "members_read_sales_follow_up_actions" on public.sales_follow_up_actions;
create policy "members_read_sales_follow_up_actions" on public.sales_follow_up_actions for select using (public.is_org_member(organization_id));
drop policy if exists "service_role_manage_sales_follow_up_actions" on public.sales_follow_up_actions;
create policy "service_role_manage_sales_follow_up_actions" on public.sales_follow_up_actions for all using (auth.role()='service_role') with check (auth.role()='service_role');

-- Extend webhook recovery to all Meta messaging providers. Unknown providers remain fail-closed.
create or replace function public.claim_webhook_event_for_reprocess(
  p_event_id uuid,
  p_organization_id uuid,
  p_max_attempts integer default 5
)
returns table (id uuid, organization_id uuid, provider text, payload jsonb, retry_count integer)
language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  if p_max_attempts < 1 or p_max_attempts > 20 then raise exception 'invalid retry limit'; end if;
  update public.webhook_events w
  set status='processing', processing_started_at=now(), last_attempt_at=now(), retry_count=w.retry_count+1,
      next_retry_at=null, error_message=null
  where w.id=p_event_id and w.organization_id=p_organization_id
    and w.provider in ('whatsapp','instagram','facebook')
    and w.status in ('failed','received') and w.dead_lettered_at is null and w.retry_count < p_max_attempts;
  return query select w.id,w.organization_id,w.provider,w.payload,w.retry_count from public.webhook_events w
    where w.id=p_event_id and w.organization_id=p_organization_id and w.status='processing';
end; $$;
revoke all on function public.claim_webhook_event_for_reprocess(uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.claim_webhook_event_for_reprocess(uuid,uuid,integer) to service_role;

create or replace function public.deployment_readiness()
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_missing_functions text[] := array[]::text[]; v_missing_tables text[] := array[]::text[];
  v_latest_version text; v_required_version constant text := '0041'; v_function text; v_table text;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  foreach v_function in array array[
    'health_check','join_demo_workspace','check_demo_rate_limit','is_demo_organization',
    'can_review_ai_approvals','check_workspace_entitlement','record_ai_usage','create_user_notification',
    'get_operational_alerts','resolve_operational_alert','get_ai_quality_dashboard','persist_whatsapp_inbound_message',
    'normalize_crm_phone','get_whatsapp_identity_candidates','resolve_whatsapp_identity_manual','claim_webhook_event_for_reprocess'
  ] loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=v_function)
    then v_missing_functions := array_append(v_missing_functions,v_function); end if;
  end loop;
  foreach v_table in array array[
    'ai_runs','ai_approval_requests','ai_approval_events','workspace_entitlements','ai_usage_monthly','notifications',
    'organization_invitations','import_jobs','billing_events','account_lifecycle_requests','deployment_migrations',
    'operational_alert_resolutions','ai_run_feedback','ai_evaluation_runs','channel_connections','channel_accounts',
    'channel_contacts','conversations','messages','webhook_events','conversation_identity_resolution_audit',
    'whatsapp_audit_events','omnichannel_audit_events','conversation_ai_qualifications','sales_follow_up_plans','sales_follow_up_actions'
  ] loop
    if to_regclass(format('public.%I',v_table)) is null then v_missing_tables := array_append(v_missing_tables,v_table); end if;
  end loop;
  select max(version) into v_latest_version from deployment_migrations;
  return jsonb_build_object('ready',coalesce(v_latest_version,'')>=v_required_version and cardinality(v_missing_functions)=0 and cardinality(v_missing_tables)=0,
    'latestMigration',v_latest_version,'requiredMigration',v_required_version,'missingFunctions',to_jsonb(v_missing_functions),'missingTables',to_jsonb(v_missing_tables));
end; $$;
revoke all on function public.deployment_readiness() from public, anon, authenticated;
grant execute on function public.deployment_readiness() to service_role;

insert into public.deployment_migrations(version,name,checksum)
values ('0041','0041_omnichannel_growth_v2.sql','a41f62c07fe5441f9d86af3a0041c0de')
on conflict (version) do update set name=excluded.name, executed_at=now();