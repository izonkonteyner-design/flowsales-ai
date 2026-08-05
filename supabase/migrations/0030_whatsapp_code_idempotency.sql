-- Migration: 0030_whatsapp_code_idempotency.sql
-- Short-lived, single-use authorization code idempotency tracking for WhatsApp Embedded Signup and OAuth flows.

create table if not exists public.oauth_authorization_codes (
  id                uuid        primary key default gen_random_uuid(),
  organization_id   uuid        not null references public.organizations(id) on delete cascade,
  user_id           uuid        not null references auth.users(id) on delete cascade,
  provider          text        not null,
  code_hash         text        not null,
  expires_at        timestamptz not null,
  consumed_at       timestamptz default null,
  created_at        timestamptz not null default now(),
  constraint oauth_authorization_codes_unique_hash unique (provider, code_hash)
);

create index if not exists idx_oauth_auth_codes_lookup
  on public.oauth_authorization_codes (provider, code_hash);

create index if not exists idx_oauth_auth_codes_org
  on public.oauth_authorization_codes (organization_id);

alter table public.oauth_authorization_codes enable row level security;

-- Only service_role can manage oauth_authorization_codes
create policy "service_role_manage_oauth_authorization_codes"
  on public.oauth_authorization_codes for all
  using (auth.role() = 'service_role');

-- Register migration 0030 in deployment manifest
insert into public.deployment_migrations (version, name, checksum)
values (
  '0030',
  '0030_whatsapp_code_idempotency.sql',
  '9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c'
)
on conflict (version) do update
set name = excluded.name, executed_at = now();
