-- Migration 0055: Social Media Publishing & Post Scheduling

CREATE TABLE IF NOT EXISTS public.social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'facebook', 'both')),
  content TEXT NOT NULL,
  media_urls TEXT[] DEFAULT '{}'::TEXT[],
  hashtags TEXT[] DEFAULT '{}'::TEXT[],
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'publishing', 'published', 'failed', 'cancelled')),
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  error_message TEXT,
  meta_post_id TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_posts_workspace_status ON public.social_posts(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_social_posts_scheduled_at ON public.social_posts(scheduled_at) WHERE status = 'scheduled';

ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage social posts for their workspaces"
  ON public.social_posts
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = public.social_posts.workspace_id
        AND wm.user_id = auth.uid()
    )
  );
