-- Migration 0070: close a latent CHECK-constraint asymmetry between social_posts and
-- social_publishing_queue. Migration 0061 allowed 'all' as a platform value on
-- social_posts.platform but not on social_publishing_queue.platform, even though
-- application code already treats 'all' as a valid summary value for social_posts.
-- Nothing currently inserts 'all' into the queue table, but any future code deriving
-- a queue row's platform from the post's summary field would hit this constraint.

ALTER TABLE public.social_publishing_queue
  DROP CONSTRAINT IF EXISTS social_publishing_queue_platform_check;

ALTER TABLE public.social_publishing_queue
  ADD CONSTRAINT social_publishing_queue_platform_check
  CHECK (platform IN ('instagram', 'facebook', 'tiktok', 'youtube', 'both', 'all'));
