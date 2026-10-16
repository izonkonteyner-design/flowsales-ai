-- 0025_social_media_core.sql
-- FlowSales AI: Social media publishing core (single-platform MVP: Instagram).
--
-- Strategy:
--  * Provider/adapter architecture. Tables are platform-agnostic; the app picks
--    a concrete provider (Instagram first) at runtime.
--  * Extend the existing `organizations`/`auth.users` tables only via FKs; no
--    parallel tenant subsystem is created.
--  * OAuth tokens are stored so the publishing worker can act on behalf of an
--    account. Token encryption at rest is added in migration 0026.
--  * RLS restricts every row to its organization.

-- ============================================================================
-- 1. social_media_accounts: connected social profiles per organization
-- ============================================================================

create table if not exists public.social_media_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  platform text not null
    check (platform in (
      'instagram', 'facebook', 'tiktok', 'youtube', 'google_business',
      'linkedin', 'pinterest', 'threads', 'x', 'bluesky', 'mastodon'
    )),
  platform_account_id text not null,
  username text,
  profile_picture_url text,
  access_token text not null,
  refresh_token text,
  token_expires_at timestamptz,
  scopes text[] default '{}'::text[],
  status text not null default 'connected'
    check (status in ('connected', 'disconnected', 'expired', 'error')),
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, platform, platform_account_id)
);

create index if not exists social_media_accounts_org_idx
  on public.social_media_accounts (organization_id, created_at desc);

create index if not exists social_media_accounts_platform_idx
  on public.social_media_accounts (organization_id, platform)
  where status = 'connected';

-- ============================================================================
-- 2. social_media_posts: drafts, scheduled and published posts (the publish queue)
-- ============================================================================

create table if not exists public.social_media_posts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid references public.social_media_accounts(id) on delete set null,
  platform text not null,
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'processing', 'published', 'failed', 'archived')),
  content text not null,
  media_urls text[] default '{}'::text[],
  scheduled_at timestamptz,
  published_at timestamptz,
  platform_post_id text,
  platform_post_url text,
  error_message text,
  retry_count integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists social_media_posts_org_idx
  on public.social_media_posts (organization_id, created_at desc);

create index if not exists social_media_posts_account_idx
  on public.social_media_posts (account_id, created_at desc);

create index if not exists social_media_posts_queue_idx
  on public.social_media_posts (status, scheduled_at)
  where status in ('scheduled', 'failed');

-- ============================================================================
-- 3. social_media_media: media library (images/video references)
-- ============================================================================

create table if not exists public.social_media_media (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  file_name text not null,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  url text not null,
  storage_path text not null,
  width integer,
  height integer,
  duration_seconds integer,
  created_at timestamptz not null default now()
);

create index if not exists social_media_media_org_idx
  on public.social_media_media (organization_id, created_at desc);

-- ============================================================================
-- 4. RLS
-- ============================================================================

alter table public.social_media_accounts enable row level security;
alter table public.social_media_posts enable row level security;
alter table public.social_media_media enable row level security;

create policy "members can read social media accounts"
  on public.social_media_accounts for select
  using (public.is_org_member(organization_id));

create policy "sales and admins can manage social media accounts"
  on public.social_media_accounts for all
  using (public.has_org_role(organization_id, array['owner', 'admin', 'sales']))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'sales']));

create policy "members can read social media posts"
  on public.social_media_posts for select
  using (public.is_org_member(organization_id));

create policy "sales and admins can manage social media posts"
  on public.social_media_posts for all
  using (public.has_org_role(organization_id, array['owner', 'admin', 'sales']))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'sales']));

create policy "members can read social media media"
  on public.social_media_media for select
  using (public.is_org_member(organization_id));

create policy "sales and admins can manage social media media"
  on public.social_media_media for all
  using (public.has_org_role(organization_id, array['owner', 'admin', 'sales']))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'sales']));

-- ============================================================================
-- 5. Updated at triggers
-- ============================================================================

create trigger set_social_media_accounts_updated_at
  before update on public.social_media_accounts
  for each row execute function public.set_updated_at();

create trigger set_social_media_posts_updated_at
  before update on public.social_media_posts
  for each row execute function public.set_updated_at();

-- Rollback notes:
--   drop trigger if exists set_social_media_accounts_updated_at on public.social_media_accounts;
--   drop trigger if exists set_social_media_posts_updated_at on public.social_media_posts;
--   drop table if exists public.social_media_media;
--   drop table if exists public.social_media_posts;
--   drop table if exists public.social_media_accounts;

