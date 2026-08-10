-- 0047_voice_sales_v1.sql
-- Persistent omnichannel voice-sales foundation. No audio recording is required or stored by default.

create table if not exists public.business_locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  location_type text not null default 'showroom' check (location_type in ('showroom','office','factory','other')),
  address text not null,
  district text,
  city text not null,
  country text not null default 'Türkiye',
  postal_code text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  maps_url text,
  phone text,
  working_hours text,
  appointment_required boolean not null default false,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists business_locations_org_active_idx on public.business_locations(organization_id,active,city);
alter table public.business_locations enable row level security;
drop policy if exists "members_read_business_locations" on public.business_locations;
create policy "members_read_business_locations" on public.business_locations for select using (public.is_org_member(organization_id));
drop policy if exists "admins_manage_business_locations" on public.business_locations;
create policy "admins_manage_business_locations" on public.business_locations for all using (public.has_org_role(organization_id,array['owner','admin'])) with check (public.has_org_role(organization_id,array['owner','admin']));

create table if not exists public.sales_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel text not null check (channel in ('phone','whatsapp','instagram','messenger','web_chat')),
  channel_session_id text not null,
  lead_id uuid references public.leads(id) on delete set null,
  customer_id uuid references public.contacts(id) on delete set null,
  current_intent text,
  qualification jsonb not null default '{}'::jsonb,
  referenced_product_ids uuid[] not null default '{}',
  current_lead_score integer check (current_lead_score between 0 and 100),
  next_best_action text,
  handoff_state text not null default 'none' check (handoff_state in ('none','recommended','requested','transferring','transferred','completed')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(organization_id,channel,channel_session_id)
);
create index if not exists sales_sessions_org_started_idx on public.sales_sessions(organization_id,started_at desc);
alter table public.sales_sessions enable row level security;
create policy "members_read_sales_sessions" on public.sales_sessions for select using (public.is_org_member(organization_id));
create policy "service_manage_sales_sessions" on public.sales_sessions for all using (auth.role()='service_role') with check (auth.role()='service_role');

create table if not exists public.voice_provider_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null,
  phone_number text not null,
  external_connection_id text,
  transfer_destination text,
  status text not null default 'disconnected' check (status in ('connected','disconnected','error')),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider,phone_number)
);
alter table public.voice_provider_connections enable row level security;
create policy "admins_read_voice_connections" on public.voice_provider_connections for select using (public.has_org_role(organization_id,array['owner','admin']));
create policy "service_manage_voice_connections" on public.voice_provider_connections for all using (auth.role()='service_role') with check (auth.role()='service_role');

create table if not exists public.voice_calls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sales_session_id uuid not null references public.sales_sessions(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  customer_id uuid references public.contacts(id) on delete set null,
  provider text not null,
  provider_call_id text not null,
  direction text not null check (direction in ('inbound','outbound')),
  from_number text not null,
  to_number text not null,
  state text not null check (state in ('ringing','answered','speaking','transferring','completed','failed')),
  assigned_user_id uuid references auth.users(id) on delete set null,
  qualification jsonb not null default '{}'::jsonb,
  summary text,
  lead_score integer check (lead_score between 0 and 100),
  temperature text check (temperature is null or temperature in ('hot','warm','cold')),
  next_best_action text,
  next_best_action_type text,
  human_handoff_requested boolean not null default false,
  handoff_reason text,
  started_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,provider,provider_call_id)
);
create index if not exists voice_calls_org_started_idx on public.voice_calls(organization_id,started_at desc);
create index if not exists voice_calls_lead_idx on public.voice_calls(lead_id,started_at desc) where lead_id is not null;
alter table public.voice_calls enable row level security;
create policy "members_read_voice_calls" on public.voice_calls for select using (public.is_org_member(organization_id));
create policy "service_manage_voice_calls" on public.voice_calls for all using (auth.role()='service_role') with check (auth.role()='service_role');

create table if not exists public.voice_transcript_segments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  call_id uuid not null references public.voice_calls(id) on delete cascade,
  sales_session_id uuid not null references public.sales_sessions(id) on delete cascade,
  sequence integer not null,
  speaker text not null check (speaker in ('customer','assistant','system')),
  text text not null,
  is_final boolean not null default true,
  interrupted boolean not null default false,
  start_ms integer,
  end_ms integer,
  created_at timestamptz not null default now(),
  unique(call_id,sequence)
);
create index if not exists voice_transcript_call_idx on public.voice_transcript_segments(call_id,sequence);
alter table public.voice_transcript_segments enable row level security;
create policy "members_read_voice_transcript" on public.voice_transcript_segments for select using (public.is_org_member(organization_id));
create policy "service_manage_voice_transcript" on public.voice_transcript_segments for all using (auth.role()='service_role') with check (auth.role()='service_role');

create table if not exists public.voice_call_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  call_id uuid references public.voice_calls(id) on delete cascade,
  provider text not null,
  provider_event_id text,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  event_at timestamptz not null default now(),
  unique(provider,provider_event_id)
);
alter table public.voice_call_events enable row level security;
create policy "members_read_voice_events" on public.voice_call_events for select using (public.is_org_member(organization_id));
create policy "service_manage_voice_events" on public.voice_call_events for all using (auth.role()='service_role') with check (auth.role()='service_role');

create table if not exists public.voice_handoffs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  call_id uuid not null references public.voice_calls(id) on delete cascade,
  sales_session_id uuid not null references public.sales_sessions(id) on delete cascade,
  status text not null default 'requested' check (status in ('requested','transferring','transferred','completed','failed')),
  reason text not null,
  destination text,
  briefing jsonb not null default '{}'::jsonb,
  requested_at timestamptz not null default now(),
  transferred_at timestamptz,
  completed_at timestamptz
);
alter table public.voice_handoffs enable row level security;
create policy "members_read_voice_handoffs" on public.voice_handoffs for select using (public.is_org_member(organization_id));
create policy "service_manage_voice_handoffs" on public.voice_handoffs for all using (auth.role()='service_role') with check (auth.role()='service_role');

create table if not exists public.voice_after_call_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  call_id uuid not null references public.voice_calls(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  action_type text not null check (action_type in ('whatsapp_showroom','whatsapp_product')),
  customer_consented_at timestamptz not null,
  status text not null default 'approval_required' check (status in ('approval_required','approved','sent','cancelled','failed')),
  payload jsonb not null default '{}'::jsonb,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.voice_after_call_actions enable row level security;
create policy "members_read_voice_after_call_actions" on public.voice_after_call_actions for select using (public.is_org_member(organization_id));
create policy "service_manage_voice_after_call_actions" on public.voice_after_call_actions for all using (auth.role()='service_role') with check (auth.role()='service_role');

create or replace function public.resolve_voice_phone_identity(p_organization_id uuid,p_phone text)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_phone text; v_leads uuid[]; v_contacts uuid[];
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  v_phone := public.normalize_crm_phone(p_phone);
  select coalesce(array_agg(id),'{}'::uuid[]) into v_leads from public.leads where organization_id=p_organization_id and public.normalize_crm_phone(phone)=v_phone;
  select coalesce(array_agg(id),'{}'::uuid[]) into v_contacts from public.contacts where organization_id=p_organization_id and public.normalize_crm_phone(phone)=v_phone;
  return jsonb_build_object('normalizedPhone',v_phone,'leadIds',to_jsonb(v_leads),'customerIds',to_jsonb(v_contacts),
    'status',case when cardinality(v_leads)+cardinality(v_contacts)=0 then 'UNMATCHED' when cardinality(v_leads)+cardinality(v_contacts)=1 then 'MATCHED' else 'AMBIGUOUS' end);
end; $$;
revoke all on function public.resolve_voice_phone_identity(uuid,text) from public,anon,authenticated;
grant execute on function public.resolve_voice_phone_identity(uuid,text) to service_role;

insert into public.deployment_migrations(version,name,checksum)
values ('0047','0047_voice_sales_v1.sql','voice-sales-v1-2026-08-10')
on conflict(version) do update set name=excluded.name,checksum=excluded.checksum,executed_at=now();
