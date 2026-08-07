-- Migration 0037: WhatsApp Templates Catalog & Status Management

create table if not exists public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid references public.channel_connections(id) on delete set null,
  meta_template_id text not null,
  name text not null,
  language text not null default 'tr',
  category text not null default 'UTILITY',
  status text not null check (status in ('APPROVED', 'PENDING', 'REJECTED', 'PAUSED', 'DISABLED')),
  components jsonb not null default '[]'::jsonb,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_whatsapp_templates_org_name_lang unique (organization_id, name, language)
);

alter table public.whatsapp_templates enable row level security;

-- Service role access
drop policy if exists "Service role full access on whatsapp_templates" on public.whatsapp_templates;
create policy "Service role full access on whatsapp_templates" on public.whatsapp_templates
  for all to service_role using (true) with check (true);

-- Workspace member read policy
drop policy if exists "Workspace members read whatsapp_templates" on public.whatsapp_templates;
create policy "Workspace members read whatsapp_templates" on public.whatsapp_templates
  for select to authenticated
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid()
    )
  );

insert into public.deployment_migrations (version, name, checksum)
values ('0037', '0037_whatsapp_templates.sql', 'a1b2c3d4e5f67890123456789abcdef01')
on conflict (version) do update set name = excluded.name, executed_at = now();
