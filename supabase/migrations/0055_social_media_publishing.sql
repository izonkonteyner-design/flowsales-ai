-- Migration 0055: Social Media Management, Publishing & Scheduling Queue

CREATE TABLE IF NOT EXISTS public.social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT,
  caption TEXT,
  content TEXT,
  media_urls TEXT[] DEFAULT '{}'::TEXT[],
  hashtags TEXT[] DEFAULT '{}'::TEXT[],
  platforms TEXT[] DEFAULT '{}'::TEXT[],
  platform TEXT NOT NULL DEFAULT 'both' CHECK (platform IN ('instagram', 'facebook', 'both')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'publishing', 'published', 'failed', 'cancelled')),
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  error_message TEXT,
  meta_post_id TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.social_publishing_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'facebook', 'both')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  scheduled_for TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  last_error TEXT,
  published_external_id TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_social_posts_workspace_status ON public.social_posts(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_social_posts_org_status ON public.social_posts(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_social_posts_scheduled_at ON public.social_posts(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_social_queue_pending ON public.social_publishing_queue(status, scheduled_for) WHERE status = 'pending';

ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_publishing_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage social posts for their workspaces"
  ON public.social_posts
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = COALESCE(public.social_posts.organization_id, public.social_posts.workspace_id)
        AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage social publishing queue for their workspaces"
  ON public.social_publishing_queue
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = public.social_publishing_queue.organization_id
        AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access to social_posts"
  ON public.social_posts FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access to social_publishing_queue"
  ON public.social_publishing_queue FOR ALL USING (auth.role() = 'service_role');

INSERT INTO public.deployment_migrations (version, name)
VALUES ('0055', 'social_media_publishing')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
