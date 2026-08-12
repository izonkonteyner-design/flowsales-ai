-- FlowSales AI email workspace: secure Gmail/Microsoft connections, CRM-linked threads and messages.

create table if not exists public.email_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('gmail', 'microsoft')),
  status text not null default 'connected' check (status in ('connected', 'expired', 'error', 'revoked')),
  email_address text not null,
  display_name text,
  scopes text[] not null default '{}',
  access_token_cipher text not null,
  refresh_token_cipher text,
  expires_at timestamptz,
  last_synced_at timestamptz,
  error_message text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider, email_address)
);

create table if not exists public.email_oauth_states (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('gmail', 'microsoft')),
  state_hash text not null unique,
  return_path text not null default '/settings/integrations/email',
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.email_threads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid not null references public.email_connections(id) on delete cascade,
  provider text not null check (provider in ('gmail', 'microsoft')),
  external_thread_id text not null,
  subject text not null default '(Konu yok)',
  participant_email text not null,
  participant_name text,
  lead_id uuid references public.leads(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  last_message_at timestamptz,
  unread_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, external_thread_id)
);

create table if not exists public.email_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  thread_id uuid not null references public.email_threads(id) on delete cascade,
  connection_id uuid not null references public.email_connections(id) on delete cascade,
  external_message_id text not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  from_email text not null,
  to_emails text[] not null default '{}',
  cc_emails text[] not null default '{}',
  subject text not null default '(Konu yok)',
  body_text text,
  body_html text,
  is_read boolean not null default true,
  sent_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (connection_id, external_message_id)
);

alter table public.email_connections enable row level security;
alter table public.email_oauth_states enable row level security;
alter table public.email_threads enable row level security;
alter table public.email_messages enable row level security;

-- Connection rows contain encrypted credentials; they are server-only just like integration_tokens.
create policy "service_manage_email_connections" on public.email_connections for all using (auth.role() = 'service_role');
create policy "service_manage_email_oauth_states" on public.email_oauth_states for all using (auth.role() = 'service_role');
create policy "members_read_email_threads" on public.email_threads for select using (
  exists (select 1 from public.organization_members m where m.organization_id = email_threads.organization_id and m.user_id = auth.uid())
);
create policy "members_manage_email_threads" on public.email_threads for all using (
  exists (select 1 from public.organization_members m where m.organization_id = email_threads.organization_id and m.user_id = auth.uid() and m.role in ('owner','admin','manager','sales','sales_rep'))
);
create policy "service_manage_email_threads" on public.email_threads for all using (auth.role() = 'service_role');
create policy "members_read_email_messages" on public.email_messages for select using (
  exists (select 1 from public.organization_members m where m.organization_id = email_messages.organization_id and m.user_id = auth.uid())
);
create policy "members_manage_email_messages" on public.email_messages for all using (
  exists (select 1 from public.organization_members m where m.organization_id = email_messages.organization_id and m.user_id = auth.uid() and m.role in ('owner','admin','manager','sales','sales_rep'))
);
create policy "service_manage_email_messages" on public.email_messages for all using (auth.role() = 'service_role');

create index if not exists email_threads_org_last_idx on public.email_threads (organization_id, last_message_at desc);
create index if not exists email_messages_thread_sent_idx on public.email_messages (thread_id, sent_at);
create index if not exists email_threads_participant_idx on public.email_threads (organization_id, lower(participant_email));

insert into public.deployment_migrations (version, name)
values ('0053', 'email_workspace')
on conflict (version) do update set name = excluded.name;
