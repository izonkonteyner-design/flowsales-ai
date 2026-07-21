-- Add Demo Mode Database Migration
-- This creates a read-only global demo workspace and an idempotent function to join it.

DO $$ 
DECLARE
  v_demo_org_id uuid;
BEGIN
  -- Try to get existing org by slug
  SELECT id INTO v_demo_org_id FROM public.organizations WHERE slug = 'flowsales-demo';
  
  IF v_demo_org_id IS NULL THEN
    v_demo_org_id := 'd3e00000-0000-0000-0000-000000000000';
    INSERT INTO public.organizations (id, name, slug, currency, onboarding_completed_at, industry)
    VALUES (v_demo_org_id, 'FlowSales Demo', 'flowsales-demo', 'USD', now(), 'Software')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- Demo Products
  INSERT INTO public.products (
    id, organization_id, name, category, description, short_description, 
    base_price, unit_price, currency, tax_rate, unit, active, 
    stock_quantity, minimum_order_quantity, lead_time_days, warranty_months,
    featured, tags, features, gallery_urls
  )
  VALUES 
    (
      'd3e00001-0000-0000-0000-000000000000', v_demo_org_id, 'Enterprise CRM License', 'Software', 
      'Full-featured CRM license for enterprise organizations.', 'Enterprise CRM',
      499, 499, 'USD', 20, 'month', true,
      0, 1, 0, 12, false, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb
    ),
    (
      'd3e00002-0000-0000-0000-000000000000', v_demo_org_id, 'AI Sales Add-on', 'Software', 
      'Generative AI assistant for drafting sales quotes.', 'AI Assistant',
      99, 99, 'USD', 20, 'month', true,
      0, 1, 0, 12, false, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb
    ),
    (
      'd3e00003-0000-0000-0000-000000000000', v_demo_org_id, 'Premium Support SLA', 'Service', 
      '24/7 technical support with 1-hour response time.', 'Premium Support',
      299, 299, 'USD', 20, 'month', true,
      0, 1, 0, 12, false, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb
    )
  ON CONFLICT (id) DO UPDATE 
  SET 
    organization_id = EXCLUDED.organization_id,
    description = EXCLUDED.description,
    short_description = EXCLUDED.short_description,
    unit_price = EXCLUDED.unit_price,
    stock_quantity = EXCLUDED.stock_quantity;

  -- Demo Leads
  INSERT INTO public.leads (
    id, organization_id, full_name, company, email, source, status, estimated_value, currency
  )
  VALUES
    ('d3e00004-0000-0000-0000-000000000000', v_demo_org_id, 'Alice Johnson', 'Acme Corp', 'alice@acme.com', 'Website', 'new', 10000, 'USD'),
    ('d3e00005-0000-0000-0000-000000000000', v_demo_org_id, 'Bob Smith', 'Globex', 'bob@globex.com', 'Referral', 'qualified', 25000, 'USD'),
    ('d3e00006-0000-0000-0000-000000000000', v_demo_org_id, 'Carol White', 'Initech', 'carol@initech.com', 'Cold Call', 'quote_sent', 5000, 'USD')
  ON CONFLICT (id) DO UPDATE 
  SET 
    organization_id = EXCLUDED.organization_id;

  -- Demo Customers (Contacts)
  INSERT INTO public.contacts (
    id, organization_id, full_name, company, email, phone, city
  )
  VALUES
    ('d3e00007-0000-0000-0000-000000000000', v_demo_org_id, 'David Black', 'Massive Dynamic', 'david@massive.com', '555-0100', 'New York')
  ON CONFLICT (id) DO UPDATE 
  SET 
    organization_id = EXCLUDED.organization_id;

END $$;

-- Security Definer function to allow any authenticated user to join the demo workspace as a viewer
CREATE OR REPLACE FUNCTION public.join_demo_workspace()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_demo_org_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id INTO v_demo_org_id FROM public.organizations WHERE slug = 'flowsales-demo';
  IF v_demo_org_id IS NULL THEN
    RAISE EXCEPTION 'Demo workspace not found';
  END IF;

  INSERT INTO public.organization_members (organization_id, user_id, role, created_at)
  VALUES (v_demo_org_id, v_user_id, 'viewer', now())
  ON CONFLICT (organization_id, user_id) 
  DO UPDATE SET role = 'viewer', created_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.join_demo_workspace() FROM public;
GRANT EXECUTE ON FUNCTION public.join_demo_workspace() TO authenticated;

-- Rate limiting for demo starts
CREATE TABLE IF NOT EXISTS public.demo_rate_limits (
  identifier text PRIMARY KEY,
  request_count int DEFAULT 1,
  first_request_at timestamptz DEFAULT now(),
  last_request_at timestamptz DEFAULT now()
);

-- Enable RLS to block direct client access
ALTER TABLE public.demo_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.check_demo_rate_limit(p_identifier text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source_count int;
  v_global_count int;
  v_time_window interval := interval '15 minutes';
  v_max_source_requests int := 5;
  v_max_global_requests int := 100;
  v_global_identifier text := 'global-demo-limit';
BEGIN
  IF p_identifier IS NULL OR p_identifier !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid identifier';
  END IF;

  -- 1. Check and update Global Limit
  -- We don't DELETE to avoid expensive global locks. We just reset the row if it's expired.
  INSERT INTO public.demo_rate_limits (identifier, request_count, first_request_at, last_request_at)
  VALUES (v_global_identifier, 1, now(), now())
  ON CONFLICT (identifier) DO UPDATE
  SET 
    request_count = CASE 
      WHEN public.demo_rate_limits.first_request_at < now() - v_time_window THEN 1 
      ELSE public.demo_rate_limits.request_count + 1 
    END,
    first_request_at = CASE 
      WHEN public.demo_rate_limits.first_request_at < now() - v_time_window THEN now() 
      ELSE public.demo_rate_limits.first_request_at 
    END,
    last_request_at = now()
  RETURNING request_count INTO v_global_count;

  IF v_global_count > v_max_global_requests THEN
    RETURN false;
  END IF;

  -- 2. Check and update Per-Source Limit
  INSERT INTO public.demo_rate_limits (identifier, request_count, first_request_at, last_request_at)
  VALUES (p_identifier, 1, now(), now())
  ON CONFLICT (identifier) DO UPDATE
  SET 
    request_count = CASE 
      WHEN public.demo_rate_limits.first_request_at < now() - v_time_window THEN 1 
      ELSE public.demo_rate_limits.request_count + 1 
    END,
    first_request_at = CASE 
      WHEN public.demo_rate_limits.first_request_at < now() - v_time_window THEN now() 
      ELSE public.demo_rate_limits.first_request_at 
    END,
    last_request_at = now()
  RETURNING request_count INTO v_source_count;

  IF v_source_count > v_max_source_requests THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.check_demo_rate_limit(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_demo_rate_limit(text) TO service_role;
