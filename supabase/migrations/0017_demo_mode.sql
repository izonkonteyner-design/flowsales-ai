-- Add Demo Mode Database Migration
-- This creates a read-only global demo workspace and an idempotent function to join it.

INSERT INTO public.organizations (id, name, slug, currency, onboarding_completed_at, industry)
VALUES ('d3e00000-0000-0000-0000-000000000000', 'FlowSales Demo', 'flowsales-demo', 'USD', now(), 'Software')
ON CONFLICT (id) DO NOTHING;

-- Demo Products
INSERT INTO public.products (id, organization_id, name, category, base_price, currency, tax_rate, unit, active)
VALUES 
  ('d3e00001-0000-0000-0000-000000000000', 'd3e00000-0000-0000-0000-000000000000', 'Enterprise CRM License', 'Software', 499, 'USD', 20, 'month', true),
  ('d3e00002-0000-0000-0000-000000000000', 'd3e00000-0000-0000-0000-000000000000', 'AI Sales Add-on', 'Software', 99, 'USD', 20, 'month', true),
  ('d3e00003-0000-0000-0000-000000000000', 'd3e00000-0000-0000-0000-000000000000', 'Premium Support SLA', 'Service', 299, 'USD', 20, 'month', true)
ON CONFLICT (id) DO NOTHING;

-- Demo Leads
INSERT INTO public.leads (id, organization_id, full_name, company, email, source, status, estimated_value, currency)
VALUES
  ('d3e00004-0000-0000-0000-000000000000', 'd3e00000-0000-0000-0000-000000000000', 'Alice Johnson', 'Acme Corp', 'alice@acme.com', 'Website', 'new', 10000, 'USD'),
  ('d3e00005-0000-0000-0000-000000000000', 'd3e00000-0000-0000-0000-000000000000', 'Bob Smith', 'Globex', 'bob@globex.com', 'Referral', 'qualified', 25000, 'USD'),
  ('d3e00006-0000-0000-0000-000000000000', 'd3e00000-0000-0000-0000-000000000000', 'Carol White', 'Initech', 'carol@initech.com', 'Cold Call', 'quote_sent', 5000, 'USD')
ON CONFLICT (id) DO NOTHING;

-- Demo Customers
INSERT INTO public.customers (id, organization_id, name, company, email, phone, city, segment, lifetime_value, source_lead_id)
VALUES
  ('d3e00007-0000-0000-0000-000000000000', 'd3e00000-0000-0000-0000-000000000000', 'David Black', 'Massive Dynamic', 'david@massive.com', '555-0100', 'New York', 'Enterprise', 120000, null)
ON CONFLICT (id) DO NOTHING;

-- Security Definer function to allow any authenticated user to join the demo workspace as a viewer
CREATE OR REPLACE FUNCTION public.join_demo_workspace()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.organization_members (organization_id, user_id, role, created_at)
  VALUES ('d3e00000-0000-0000-0000-000000000000', v_user_id, 'viewer', now())
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
  IF p_identifier IS NULL OR length(p_identifier) = 0 THEN
    RAISE EXCEPTION 'Invalid identifier';
  END IF;

  IF length(p_identifier) > 64 AND p_identifier != 'fallback-demo-bucket' THEN
    RAISE EXCEPTION 'Invalid identifier length';
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
