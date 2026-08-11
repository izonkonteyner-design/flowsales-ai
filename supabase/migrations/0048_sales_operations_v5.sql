-- 0048_sales_operations_v5.sql
-- Callback, disposition, intent, scoring, sequences, quote risk and manager intelligence.

create table if not exists public.sales_callback_queue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  voice_call_id uuid references public.voice_calls(id) on delete set null,
  assigned_user_id uuid references auth.users(id) on delete set null,
  scheduled_for timestamptz not null,
  status text not null default 'pending' check (status in ('pending','completed','cancelled','missed')),
  reason text,
  outcome text,
  created_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sales_callback_queue_org_due_idx on public.sales_callback_queue(organization_id,status,scheduled_for);
alter table public.sales_callback_queue enable row level security;
create policy "members_read_sales_callback_queue" on public.sales_callback_queue for select using (public.is_org_member(organization_id));
create policy "sales_manage_sales_callback_queue" on public.sales_callback_queue for all using (public.has_org_role(organization_id,array['owner','admin','sales'])) with check (public.has_org_role(organization_id,array['owner','admin','sales']));

create table if not exists public.sales_call_dispositions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  call_id uuid not null references public.voice_calls(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  disposition text not null check (disposition in ('sales_opportunity','follow_up','quote_requested','unreachable','not_interested','wrong_number','support','other')),
  call_reason text check (call_reason is null or call_reason in ('price','product','showroom','delivery','quote','support','other')),
  objections jsonb not null default '[]'::jsonb,
  buying_signals jsonb not null default '[]'::jsonb,
  confidence numeric(5,4),
  source text not null default 'human' check (source in ('human','ai')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(organization_id,call_id)
);
alter table public.sales_call_dispositions enable row level security;
create policy "members_read_sales_call_dispositions" on public.sales_call_dispositions for select using (public.is_org_member(organization_id));
create policy "sales_manage_sales_call_dispositions" on public.sales_call_dispositions for all using (public.has_org_role(organization_id,array['owner','admin','sales'])) with check (public.has_org_role(organization_id,array['owner','admin','sales']));

create table if not exists public.sales_objection_library (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  objection_key text not null,
  label text not null,
  recommended_response text,
  times_detected integer not null default 0,
  won_after_objection integer not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique(organization_id,objection_key)
);
alter table public.sales_objection_library enable row level security;
create policy "members_read_sales_objection_library" on public.sales_objection_library for select using (public.is_org_member(organization_id));
create policy "admins_manage_sales_objection_library" on public.sales_objection_library for all using (public.has_org_role(organization_id,array['owner','admin'])) with check (public.has_org_role(organization_id,array['owner','admin']));

create table if not exists public.lead_intent_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  score integer not null check (score between 0 and 100),
  temperature text not null check (temperature in ('hot','warm','cold')),
  reason text not null,
  factors jsonb not null default '{}'::jsonb,
  source text not null default 'system',
  created_at timestamptz not null default now()
);
create index if not exists lead_intent_history_lead_idx on public.lead_intent_history(organization_id,lead_id,created_at desc);
alter table public.lead_intent_history enable row level security;
create policy "members_read_lead_intent_history" on public.lead_intent_history for select using (public.is_org_member(organization_id));
create policy "service_manage_lead_intent_history" on public.lead_intent_history for all using (auth.role()='service_role') with check (auth.role()='service_role');

create table if not exists public.sales_sequence_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.sales_sequence_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_id uuid not null references public.sales_sequence_templates(id) on delete cascade,
  step_order integer not null check (step_order > 0),
  delay_hours integer not null default 24 check (delay_hours >= 0),
  action_type text not null check (action_type in ('task','call','reply_draft','reminder')),
  instruction text not null,
  requires_human_approval boolean not null default true,
  unique(template_id,step_order)
);
create table if not exists public.sales_sequence_enrollments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_id uuid not null references public.sales_sequence_templates(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  status text not null default 'active' check (status in ('active','paused','completed','cancelled')),
  current_step integer not null default 1,
  next_run_at timestamptz,
  enrolled_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sales_sequence_enrollments_due_idx on public.sales_sequence_enrollments(organization_id,status,next_run_at);

alter table public.sales_sequence_templates enable row level security;
alter table public.sales_sequence_steps enable row level security;
alter table public.sales_sequence_enrollments enable row level security;
create policy "members_read_sales_sequence_templates" on public.sales_sequence_templates for select using (public.is_org_member(organization_id));
create policy "sales_manage_sales_sequence_templates" on public.sales_sequence_templates for all using (public.has_org_role(organization_id,array['owner','admin','sales'])) with check (public.has_org_role(organization_id,array['owner','admin','sales']));
create policy "members_read_sales_sequence_steps" on public.sales_sequence_steps for select using (public.is_org_member(organization_id));
create policy "sales_manage_sales_sequence_steps" on public.sales_sequence_steps for all using (public.has_org_role(organization_id,array['owner','admin','sales'])) with check (public.has_org_role(organization_id,array['owner','admin','sales']));
create policy "members_read_sales_sequence_enrollments" on public.sales_sequence_enrollments for select using (public.is_org_member(organization_id));
create policy "sales_manage_sales_sequence_enrollments" on public.sales_sequence_enrollments for all using (public.has_org_role(organization_id,array['owner','admin','sales'])) with check (public.has_org_role(organization_id,array['owner','admin','sales']));

create table if not exists public.quote_follow_up_state (
  quote_id uuid primary key references public.quotes(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  last_customer_activity_at timestamptz,
  next_follow_up_at timestamptz,
  follow_up_count integer not null default 0,
  risk_score integer not null default 0 check (risk_score between 0 and 100),
  risk_reasons jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.quote_follow_up_state enable row level security;
create policy "members_read_quote_follow_up_state" on public.quote_follow_up_state for select using (public.is_org_member(organization_id));
create policy "sales_manage_quote_follow_up_state" on public.quote_follow_up_state for all using (public.has_org_role(organization_id,array['owner','admin','sales'])) with check (public.has_org_role(organization_id,array['owner','admin','sales']));

create table if not exists public.sales_automation_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  source_type text not null,
  source_id uuid,
  action_type text not null check (action_type in ('task','call','reply_draft','reminder')),
  title text not null,
  payload jsonb not null default '{}'::jsonb,
  scheduled_for timestamptz,
  status text not null default 'approval_required' check (status in ('approval_required','approved','completed','cancelled')),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists sales_automation_drafts_org_status_idx on public.sales_automation_drafts(organization_id,status,scheduled_for);
alter table public.sales_automation_drafts enable row level security;
create policy "members_read_sales_automation_drafts" on public.sales_automation_drafts for select using (public.is_org_member(organization_id));
create policy "sales_manage_sales_automation_drafts" on public.sales_automation_drafts for all using (public.has_org_role(organization_id,array['owner','admin','sales'])) with check (public.has_org_role(organization_id,array['owner','admin','sales']));

insert into public.deployment_migrations(version,name,checksum)
values ('0048','0048_sales_operations_v5.sql','sales-operations-v5-2026-08-11')
on conflict(version) do update set name=excluded.name,checksum=excluded.checksum,executed_at=now();