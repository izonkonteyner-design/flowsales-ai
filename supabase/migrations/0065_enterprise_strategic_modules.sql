-- Migration: 0065_enterprise_strategic_modules.sql
-- Description: Core schema additions for 7 Strategic Differentiation Modules:
-- 1. AI Revenue Autopilot & Attribution (ad_attributions)
-- 2. Omnichannel Customer Memory (customer_memories)
-- 3. Industry AI Packs (industry_pack_configurations)
-- 4. Explainable AI Action Center (ai_action_proposals)
-- 5. Local-First / Bring Your Own AI (workspace_ai_settings)

-- 1. Omnichannel Customer Memory Table
CREATE TABLE IF NOT EXISTS public.customer_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  memory_type TEXT NOT NULL CHECK (memory_type IN ('verified_fact', 'customer_statement', 'ai_summary', 'preference', 'objection')),
  content TEXT NOT NULL,
  confidence NUMERIC(4,3) NOT NULL DEFAULT 1.000 CHECK (confidence >= 0 AND confidence <= 1.0),
  source_channel TEXT NOT NULL CHECK (source_channel IN ('whatsapp', 'instagram', 'facebook', 'voice', 'email', 'crm_note', 'quote', 'web_chat', 'manual')),
  source_ref_id TEXT,
  source_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.customer_memories ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_customer_memories_org_customer
  ON public.customer_memories (organization_id, customer_id, memory_type);

CREATE INDEX IF NOT EXISTS idx_customer_memories_org_lead
  ON public.customer_memories (organization_id, lead_id, memory_type);

DROP POLICY IF EXISTS "org_members_read_customer_memories" ON public.customer_memories;
CREATE POLICY "org_members_read_customer_memories"
  ON public.customer_memories FOR SELECT
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "org_writers_manage_customer_memories" ON public.customer_memories;
CREATE POLICY "org_writers_manage_customer_memories"
  ON public.customer_memories FOR ALL
  USING (public.is_org_writer(organization_id))
  WITH CHECK (public.is_org_writer(organization_id));

-- 2. Ad-to-Revenue Attribution Table
CREATE TABLE IF NOT EXISTS public.ad_attributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.ad_campaigns(id) ON DELETE SET NULL,
  platform TEXT NOT NULL CHECK (platform IN ('google_ads', 'meta_ads', 'organic', 'direct', 'referral', 'other')),
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  click_id TEXT, -- gclid or fbclid
  landing_page TEXT,
  ad_spend_cents BIGINT NOT NULL DEFAULT 0,
  attributed_revenue_cents BIGINT NOT NULL DEFAULT 0,
  quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
  attribution_model TEXT NOT NULL DEFAULT 'last_touch' CHECK (attribution_model IN ('first_touch', 'last_touch', 'linear')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, lead_id)
);

ALTER TABLE public.ad_attributions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_ad_attributions_org_platform
  ON public.ad_attributions (organization_id, platform, created_at DESC);

DROP POLICY IF EXISTS "org_members_read_ad_attributions" ON public.ad_attributions;
CREATE POLICY "org_members_read_ad_attributions"
  ON public.ad_attributions FOR SELECT
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "org_writers_manage_ad_attributions" ON public.ad_attributions;
CREATE POLICY "org_writers_manage_ad_attributions"
  ON public.ad_attributions FOR ALL
  USING (public.is_org_writer(organization_id))
  WITH CHECK (public.is_org_writer(organization_id));

-- 3. Industry AI Pack Configurations Table
CREATE TABLE IF NOT EXISTS public.industry_pack_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pack_key TEXT NOT NULL CHECK (pack_key IN ('container_modular', 'real_estate', 'automotive', 'general_services')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  pack_version TEXT NOT NULL DEFAULT '1.0.0',
  custom_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  pipeline_stages JSONB NOT NULL DEFAULT '[]'::jsonb,
  catalog_templates JSONB NOT NULL DEFAULT '[]'::jsonb,
  quote_template_preset JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_system_instructions TEXT,
  activated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, pack_key)
);

ALTER TABLE public.industry_pack_configurations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_members_read_industry_packs" ON public.industry_pack_configurations;
CREATE POLICY "org_members_read_industry_packs"
  ON public.industry_pack_configurations FOR SELECT
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "admins_manage_industry_packs" ON public.industry_pack_configurations;
CREATE POLICY "admins_manage_industry_packs"
  ON public.industry_pack_configurations FOR ALL
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin']))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin']));

-- 4. Explainable AI Action Proposals Table
CREATE TABLE IF NOT EXISTS public.ai_action_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_module TEXT NOT NULL CHECK (source_module IN ('revenue_autopilot', 'quote_copilot', 'customer_memory', 'ad_intelligence', 'crm_growth', 'system')),
  action_type TEXT NOT NULL CHECK (action_type IN ('send_follow_up', 'create_quote_draft', 'apply_discount', 'update_lead_stage', 'schedule_task', 'ad_optimization', 'alert')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  target_entity_type TEXT NOT NULL CHECK (target_entity_type IN ('lead', 'customer', 'quote', 'campaign', 'task')),
  target_entity_id TEXT NOT NULL,
  target_entity_title TEXT,
  evidence TEXT[] NOT NULL DEFAULT '{}',
  reasons TEXT[] NOT NULL DEFAULT '{}',
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('urgent', 'high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('draft', 'pending_review', 'approved', 'rejected', 'executed', 'failed', 'dismissed')),
  action_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  action_hash TEXT NOT NULL,
  approval_request_id UUID REFERENCES public.ai_approval_requests(id) ON DELETE SET NULL,
  required_role TEXT NOT NULL DEFAULT 'sales' CHECK (required_role IN ('owner', 'admin', 'sales', 'member')),
  decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  decision_note TEXT,
  executed_at TIMESTAMPTZ,
  execution_result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ai_action_proposals ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_ai_action_proposals_org_status
  ON public.ai_action_proposals (organization_id, status, priority, created_at DESC);

DROP POLICY IF EXISTS "org_members_read_ai_action_proposals" ON public.ai_action_proposals;
CREATE POLICY "org_members_read_ai_action_proposals"
  ON public.ai_action_proposals FOR SELECT
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "org_writers_manage_ai_action_proposals" ON public.ai_action_proposals;
CREATE POLICY "org_writers_manage_ai_action_proposals"
  ON public.ai_action_proposals FOR ALL
  USING (public.is_org_writer(organization_id))
  WITH CHECK (public.is_org_writer(organization_id));

-- 5. Workspace AI & BYOAI Settings Table
CREATE TABLE IF NOT EXISTS public.workspace_ai_settings (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  active_provider TEXT NOT NULL DEFAULT 'gemini' CHECK (active_provider IN ('gemini', 'ollama', 'custom_local')),
  gemini_model TEXT NOT NULL DEFAULT 'gemini-3.5-flash-lite',
  ollama_base_url TEXT DEFAULT 'http://localhost:11434',
  ollama_model TEXT DEFAULT 'llama3:latest',
  custom_local_endpoint TEXT,
  custom_local_model TEXT,
  spending_ceiling_cents BIGINT NOT NULL DEFAULT 0 CHECK (spending_ceiling_cents >= 0),
  allow_paid_api BOOLEAN NOT NULL DEFAULT false,
  vision_capable BOOLEAN NOT NULL DEFAULT true,
  health_status TEXT NOT NULL DEFAULT 'healthy' CHECK (health_status IN ('healthy', 'degraded', 'offline', 'unconfigured')),
  last_health_check_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.workspace_ai_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_members_read_workspace_ai_settings" ON public.workspace_ai_settings;
CREATE POLICY "org_members_read_workspace_ai_settings"
  ON public.workspace_ai_settings FOR SELECT
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "admins_manage_workspace_ai_settings" ON public.workspace_ai_settings;
CREATE POLICY "admins_manage_workspace_ai_settings"
  ON public.workspace_ai_settings FOR ALL
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin']))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin']));

-- Record migration in deployment_migrations
INSERT INTO public.deployment_migrations (version, name, applied_at)
VALUES ('0065', 'enterprise_strategic_modules', NOW())
ON CONFLICT (version) DO UPDATE
SET name = excluded.name,
    applied_at = excluded.applied_at;
