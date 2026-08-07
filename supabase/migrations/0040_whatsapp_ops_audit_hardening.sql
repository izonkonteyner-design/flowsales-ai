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

create policy "members_read_whatsapp_audit_events"
  on public.whatsapp_audit_events for select
  using (public.is_org_member(organization_id));

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

insert into public.deployment_migrations (version, name)
values ('0040', '0040_whatsapp_ops_audit_hardening.sql')
on conflict (version) do update set name = excluded.name;
