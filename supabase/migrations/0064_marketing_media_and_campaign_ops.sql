-- Migration: 0064_marketing_media_and_campaign_ops.sql
-- Description: Media assets library, multimodal analysis results, and campaign ops tracking

create or replace function public.is_org_writer(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = target_org
      and om.user_id = auth.uid()
      and om.role in ('owner', 'admin', 'member')
  );
$$;

revoke all on function public.is_org_writer(uuid) from public;
grant execute on function public.is_org_writer(uuid) to authenticated;

create table if not exists public.marketing_media_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  storage_path text not null,
  public_url text not null,
  file_name text not null,
  file_type text not null,
  file_size_bytes bigint not null,
  media_type text not null check (media_type in ('image', 'video')),
  width integer,
  height integer,
  duration_seconds numeric(8,2),
  analysis_status text not null default 'pending' check (analysis_status in ('pending', 'completed', 'fallback', 'failed')),
  analysis_result jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.marketing_media_assets enable row level security;

create index if not exists idx_marketing_media_assets_org_created
  on public.marketing_media_assets (organization_id, created_at desc);

create index if not exists idx_marketing_media_assets_org_type
  on public.marketing_media_assets (organization_id, media_type);

-- RLS Policies
drop policy if exists "org_members_read_marketing_media" on public.marketing_media_assets;
create policy "org_members_read_marketing_media"
  on public.marketing_media_assets
  for select
  using (public.is_org_member(organization_id));

drop policy if exists "org_writers_insert_marketing_media" on public.marketing_media_assets;
create policy "org_writers_insert_marketing_media"
  on public.marketing_media_assets
  for insert
  with check (public.is_org_writer(organization_id));

drop policy if exists "org_writers_update_marketing_media" on public.marketing_media_assets;
create policy "org_writers_update_marketing_media"
  on public.marketing_media_assets
  for update
  using (public.is_org_writer(organization_id))
  with check (public.is_org_writer(organization_id));

drop policy if exists "org_writers_delete_marketing_media" on public.marketing_media_assets;
create policy "org_writers_delete_marketing_media"
  on public.marketing_media_assets
  for delete
  using (public.is_org_writer(organization_id));

-- Record migration in deployment_migrations
insert into public.deployment_migrations (version, name, applied_at)
values ('0064', 'marketing_media_and_campaign_ops', now())
on conflict (version) do update
set name = excluded.name,
    applied_at = excluded.applied_at;
