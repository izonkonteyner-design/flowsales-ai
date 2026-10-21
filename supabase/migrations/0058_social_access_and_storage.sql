-- Prepared for review only. No production migration is executed by this task.
-- No anonymous access to publication tokens or private media.
alter table public.social_media_accounts add column if not exists created_at timestamptz not null default now();
create unique index if not exists social_accounts_tenant_key on public.social_media_accounts(id, organization_id);
alter table public.social_media_posts drop constraint if exists social_media_posts_account_id_fkey;
alter table public.social_media_posts add constraint social_post_account_tenant_fk
  foreign key(account_id, organization_id) references public.social_media_accounts(id, organization_id);

revoke all on public.social_media_accounts from anon;
revoke select on public.social_media_accounts from authenticated;
grant select(id, organization_id, platform, platform_account_id, username, profile_picture_url, status, scopes, token_expires_at, connected_at, created_at, updated_at) on public.social_media_accounts to authenticated;
-- Token-bearing reads/writes are exclusively server-side after role checks.
revoke insert, update, delete on public.social_media_accounts from authenticated;

drop policy if exists "sales and admins can manage social media posts" on public.social_media_posts;
drop policy if exists "sales and admins can manage social media media" on public.social_media_media;
create policy social_posts_write on public.social_media_posts for all to authenticated
using (not public.is_demo_organization(organization_id) and public.has_org_role(organization_id, array['owner','admin','manager','sales','sales_rep']))
with check (not public.is_demo_organization(organization_id) and public.has_org_role(organization_id, array['owner','admin','manager','sales','sales_rep']));
create policy social_media_write on public.social_media_media for all to authenticated
using (not public.is_demo_organization(organization_id) and public.has_org_role(organization_id, array['owner','admin','manager','sales','sales_rep']))
with check (not public.is_demo_organization(organization_id) and public.has_org_role(organization_id, array['owner','admin','manager','sales','sales_rep']));

create table public.social_oauth_states (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null, expires_at timestamptz not null
);
alter table public.social_oauth_states enable row level security;
create policy social_oauth_owner on public.social_oauth_states for all to authenticated
using (auth.uid() = user_id and public.has_org_role(organization_id, array['owner','admin']) and not public.is_demo_organization(organization_id))
with check (auth.uid() = user_id and public.has_org_role(organization_id, array['owner','admin']) and not public.is_demo_organization(organization_id));
revoke all on public.social_oauth_states from anon, authenticated;
grant select, insert, delete on public.social_oauth_states to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('social-media-assets', 'social-media-assets', false, 10485760, array['image/png','image/jpeg','image/webp','video/mp4'])
on conflict(id) do nothing;
create policy social_assets_read on storage.objects for select to authenticated
using (bucket_id = 'social-media-assets' and public.is_org_member(((storage.foldername(name))[1])::uuid));
create policy social_assets_insert on storage.objects for insert to authenticated
with check (bucket_id = 'social-media-assets' and not public.is_demo_organization(((storage.foldername(name))[1])::uuid) and public.has_org_role(((storage.foldername(name))[1])::uuid, array['owner','admin','manager','sales','sales_rep']));
create policy social_assets_delete on storage.objects for delete to authenticated
using (bucket_id = 'social-media-assets' and not public.is_demo_organization(((storage.foldername(name))[1])::uuid) and public.has_org_role(((storage.foldername(name))[1])::uuid, array['owner','admin','manager','sales','sales_rep']));

-- Refresh credentials receive the same protection as access credentials.
alter table public.social_media_accounts add column if not exists encrypted_refresh_token text;
alter table public.social_media_accounts add column if not exists refresh_encryption_iv text;
-- Publication transitions are server-only, after tenant, plan and role checks.
revoke all on public.social_media_posts from anon;
revoke insert, update, delete on public.social_media_posts from authenticated;
grant select on public.social_media_posts to authenticated;

insert into public.deployment_migrations(version, name)
values ('0058', 'social_access_and_storage')
on conflict(version) do update set name = excluded.name;
