-- 0027_social_publish_queue.sql
-- FlowSales AI: Scheduled publish queue fields for the cron publisher.
--
-- Strategy:
--  * Add claimed_at and next_retry_at to social_media_posts so the cron worker
--    can claim due posts atomically and implement retry/backoff without
--    double-publishing.
--  * claimed_at: set when a worker picks up a post. Null when not claimed.
--  * next_retry_at: earliest time a failed post may be retried (exponential
--    backoff). Null when not applicable.

-- 1. Publish queue columns
alter table public.social_media_posts
  add column if not exists claimed_at timestamptz,
add column if not exists next_retry_at timestamptz;

-- 2. Index for the cron claim query: posts due for publishing or retry
create index if not exists social_media_posts_publish_queue_idx
  on public.social_media_posts (status, next_retry_at, scheduled_at)
  where status in ('scheduled', 'failed');

-- Rollback notes:
--   alter table public.social_media_posts
--     drop column if exists claimed_at,
--     drop column if exists next_retry_at;
--   drop index if exists public.social_media_posts_publish_queue_idx;

insert into public.deployment_migrations(version, name)
values ('0057', 'social_publish_queue')
on conflict(version) do update set name = excluded.name;
