-- Migration 0063: Ads Management, Approvals Safety, and AI Creative Production Pipeline
-- Forward-only migration adding secure multi-tenant tables for Google Ads, Meta Ads, and Creative Production.

-- 1. Ad Campaigns Table
CREATE TABLE IF NOT EXISTS public.ad_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('google_ads', 'meta_ads')),
  campaign_name TEXT NOT NULL,
  objective TEXT NOT NULL CHECK (objective IN ('lead_generation', 'traffic', 'conversions', 'brand_awareness', 'sales')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review_pending', 'approved', 'live', 'paused', 'rejected', 'completed')),
  daily_budget_cents BIGINT NOT NULL DEFAULT 10000,
  currency TEXT NOT NULL DEFAULT 'TRY',
  targeting JSONB NOT NULL DEFAULT '{}'::jsonb,
  ad_group_name TEXT,
  keywords TEXT[] DEFAULT '{}',
  headlines TEXT[] DEFAULT '{}',
  descriptions TEXT[] DEFAULT '{}',
  final_url TEXT,
  approval_request_id UUID REFERENCES public.ai_approval_requests(id) ON DELETE SET NULL,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Creative Production Briefs Table
CREATE TABLE IF NOT EXISTS public.creative_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  concept TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('feed_image', 'story_reel', 'carousel', 'video_storyboard', 'landscape_ad')),
  dimensions TEXT NOT NULL DEFAULT '1080x1080',
  visual_prompt TEXT NOT NULL,
  shot_list JSONB NOT NULL DEFAULT '[]'::jsonb,
  voiceover_script TEXT,
  overlay_texts TEXT[] DEFAULT '{}',
  thumbnail_concept TEXT,
  mapped_campaign_id UUID REFERENCES public.ad_campaigns(id) ON DELETE SET NULL,
  mapped_social_post_id UUID REFERENCES public.social_posts(id) ON DELETE SET NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Enable Row-Level Security
ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creative_briefs ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies: Organization Tenant Isolation via organization_members
DROP POLICY IF EXISTS "org_members_read_ad_campaigns" ON public.ad_campaigns;
CREATE POLICY "org_members_read_ad_campaigns"
  ON public.ad_campaigns FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = ad_campaigns.organization_id
        AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "org_owners_admins_manage_ad_campaigns" ON public.ad_campaigns;
CREATE POLICY "org_owners_admins_manage_ad_campaigns"
  ON public.ad_campaigns FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = ad_campaigns.organization_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "org_members_read_creative_briefs" ON public.creative_briefs;
CREATE POLICY "org_members_read_creative_briefs"
  ON public.creative_briefs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = creative_briefs.organization_id
        AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "org_owners_admins_manage_creative_briefs" ON public.creative_briefs;
CREATE POLICY "org_owners_admins_manage_creative_briefs"
  ON public.creative_briefs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = creative_briefs.organization_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

-- 5. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_org_status
  ON public.ad_campaigns(organization_id, status);

CREATE INDEX IF NOT EXISTS idx_creative_briefs_org_format
  ON public.creative_briefs(organization_id, format);

-- 6. Register Migration
INSERT INTO public.deployment_migrations (version, name)
VALUES ('0063', 'ads_and_creative_pipeline')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
