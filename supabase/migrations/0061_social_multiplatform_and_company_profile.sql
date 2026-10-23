-- Migration 0061: Social Multiplatform (TikTok, YouTube), Content Types, and Company Profile Warranty
-- Forward-only migration expanding social publishing capabilities and company profile settings.

-- 1. Organizations: Add default warranty terms and AI language preference
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS default_warranty_terms TEXT,
  ADD COLUMN IF NOT EXISTS ai_language TEXT DEFAULT 'auto';

-- 2. Social Posts: Update platform CHECK constraint to include TikTok and YouTube
ALTER TABLE public.social_posts
  DROP CONSTRAINT IF EXISTS social_posts_platform_check;

ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_platform_check
  CHECK (platform IN ('instagram', 'facebook', 'tiktok', 'youtube', 'both', 'all'));

-- 3. Social Publishing Queue: Update platform CHECK constraint
ALTER TABLE public.social_publishing_queue
  DROP CONSTRAINT IF EXISTS social_publishing_queue_platform_check;

ALTER TABLE public.social_publishing_queue
  ADD CONSTRAINT social_publishing_queue_platform_check
  CHECK (platform IN ('instagram', 'facebook', 'tiktok', 'youtube', 'both'));

-- 4. Social Posts: Add content type, platform customizations, media items, and disclosure
ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS content_type TEXT NOT NULL DEFAULT 'post',
  ADD COLUMN IF NOT EXISTS platform_customizations JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS media_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_generated_disclosure BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'social_posts_content_type_check'
      AND conrelid = 'public.social_posts'::regclass
  ) THEN
    ALTER TABLE public.social_posts
      ADD CONSTRAINT social_posts_content_type_check
      CHECK (content_type IN ('post', 'reel_short', 'story', 'video', 'text'));
  END IF;
END $$;

-- 5. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_social_posts_org_content_type
  ON public.social_posts(organization_id, content_type);

CREATE INDEX IF NOT EXISTS idx_social_queue_platform_status
  ON public.social_publishing_queue(platform, status, scheduled_for);

-- 6. Record Migration
INSERT INTO public.deployment_migrations (version, name)
VALUES ('0061', 'social_multiplatform_and_company_profile')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
