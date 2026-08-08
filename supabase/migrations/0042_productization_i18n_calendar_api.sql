-- FlowSales AI productization: Turkish locale persistence, calendar, API credentials and audit explorer.

alter table public.profiles alter column language set default 'tr';

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (char_length(trim(title)) >= 2),
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  event_type text not null default 'meeting' check (event_type in ('call','demo','meeting','delivery','follow_up','other')),
  lead_id uuid references public.leads(id) on delete set null,
  assigned_to uuid references auth.users(id) on delete set null,
  location text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists calendar_events_org_starts_idx on public.calendar_events (organization_id, starts_at);
create index if not exists calendar_events_assigned_idx on public.calendar_events (assigned_to, starts_at);

alter table public.calendar_events enable row level security;

drop policy if exists calendar_events_member_select on public.calendar_events;
create policy calendar_events_member_select on public.calendar_events for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists calendar_events_member_insert on public.calendar_events;
create policy calendar_events_member_insert on public.calendar_events for insert to authenticated
with check (public.has_org_permission(organization_id, 'edit_crm') and created_by = auth.uid());

drop policy if exists calendar_events_member_update on public.calendar_events;
create policy calendar_events_member_update on public.calendar_events for update to authenticated
using (public.has_org_permission(organization_id, 'edit_crm'))
with check (public.has_org_permission(organization_id, 'edit_crm'));

drop policy if exists calendar_events_member_delete on public.calendar_events;
create policy calendar_events_member_delete on public.calendar_events for delete to authenticated
using (public.has_org_permission(organization_id, 'edit_crm'));

drop trigger if exists set_calendar_events_updated_at on public.calendar_events;
create trigger set_calendar_events_updated_at before update on public.calendar_events
for each row execute function public.set_updated_at();

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  key_prefix text not null,
  key_hash text not null unique,
  scopes text[] not null default array['crm:read']::text[],
  created_by uuid references auth.users(id) on delete set null,
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists api_keys_org_created_idx on public.api_keys (organization_id, created_at desc);
alter table public.api_keys enable row level security;

drop policy if exists api_keys_admin_select on public.api_keys;
create policy api_keys_admin_select on public.api_keys for select to authenticated
using (public.has_org_permission(organization_id, 'manage_workspace'));

drop policy if exists api_keys_admin_insert on public.api_keys;
create policy api_keys_admin_insert on public.api_keys for insert to authenticated
with check (public.has_org_permission(organization_id, 'manage_workspace') and created_by = auth.uid());

drop policy if exists api_keys_admin_update on public.api_keys;
create policy api_keys_admin_update on public.api_keys for update to authenticated
using (public.has_org_permission(organization_id, 'manage_workspace'))
with check (public.has_org_permission(organization_id, 'manage_workspace'));

create table if not exists public.app_audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists app_audit_logs_org_created_idx on public.app_audit_logs (organization_id, created_at desc);
create index if not exists app_audit_logs_org_action_idx on public.app_audit_logs (organization_id, action, created_at desc);
alter table public.app_audit_logs enable row level security;

drop policy if exists app_audit_logs_member_select on public.app_audit_logs;
create policy app_audit_logs_member_select on public.app_audit_logs for select to authenticated
using (public.is_org_member(organization_id));

-- Inserts are intentionally service-role only. Application mutations write audit events server-side.
