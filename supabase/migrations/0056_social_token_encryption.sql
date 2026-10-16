-- 0026_social_token_encryption.sql
-- FlowSales AI: Encrypt OAuth access tokens at rest.
--
-- Strategy:
--  * Add encrypted_access_token, encryption_iv, and token_encryption_key_version
--    columns to social_media_accounts. The existing access_token column is kept
--    (not dropped) so existing rows are never silently destroyed or corrupted.
--  * New connections write tokens only to the encrypted column. Reads prefer the
--    encrypted column and fall back to access_token for backwards compatibility.
--  * Requires SOCIAL_TOKEN_ENCRYPTION_KEY env var; without it, token writes fail
--    closed (NOT_CONFIGURED) rather than storing plaintext.

-- 1. New encrypted token columns
alter table public.social_media_accounts
  add column if not exists encrypted_access_token text,
add column if not exists encryption_iv text,
add column if not exists token_encryption_key_version integer not null default 1;

-- 2. Index for lookups by key version (helps future rotation)
create index if not exists social_media_accounts_key_version_idx
  on public.social_media_accounts (token_encryption_key_version);

-- 3. Backfill note (manual, opt-in):
--    Existing plaintext tokens in access_token can be encrypted by the app on
--    next use (connect/publish reads encrypted first, falls back to plaintext).
--    Do NOT run a silent bulk migration here: that would require the encryption
--    key at migration time and risks partial failures. Existing records require an explicit, separately reviewed
--    encryption backfill; reads do not silently migrate credentials.

-- Rollback notes:
--   alter table public.social_media_accounts
--     drop column if exists encrypted_access_token,
--     drop column if exists encryption_iv,
--     drop column if exists token_encryption_key_version;
--   drop index if exists public.social_media_accounts_key_version_idx;

insert into public.deployment_migrations(version, name)
values ('0056', 'social_token_encryption')
on conflict(version) do update set name = excluded.name;
