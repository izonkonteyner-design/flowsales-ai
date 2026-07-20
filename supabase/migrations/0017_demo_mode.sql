-- Add Demo Mode Database Migration
-- This creates a read-only global demo workspace and an idempotent function to join it.

INSERT INTO organizations (id, name, slug, currency, onboarding_completed_at, industry)
VALUES ('d3m00000-0000-0000-0000-000000000000', 'FlowSales Demo', 'flowsales-demo', 'USD', now(), 'Software')
ON CONFLICT (id) DO NOTHING;

-- Demo Products
INSERT INTO products (id, organization_id, name, category, base_price, currency, tax_rate, unit, active)
VALUES 
  ('d3m00001-0000-0000-0000-000000000000', 'd3m00000-0000-0000-0000-000000000000', 'Enterprise CRM License', 'Software', 499, 'USD', 20, 'month', true),
  ('d3m00002-0000-0000-0000-000000000000', 'd3m00000-0000-0000-0000-000000000000', 'AI Sales Add-on', 'Software', 99, 'USD', 20, 'month', true),
  ('d3m00003-0000-0000-0000-000000000000', 'd3m00000-0000-0000-0000-000000000000', 'Premium Support SLA', 'Service', 299, 'USD', 20, 'month', true)
ON CONFLICT (id) DO NOTHING;

-- Demo Leads
INSERT INTO leads (id, organization_id, full_name, company, email, source, status, estimated_value, currency)
VALUES
  ('d3m00004-0000-0000-0000-000000000000', 'd3m00000-0000-0000-0000-000000000000', 'Alice Johnson', 'Acme Corp', 'alice@acme.com', 'Website', 'new', 10000, 'USD'),
  ('d3m00005-0000-0000-0000-000000000000', 'd3m00000-0000-0000-0000-000000000000', 'Bob Smith', 'Globex', 'bob@globex.com', 'Referral', 'qualified', 25000, 'USD'),
  ('d3m00006-0000-0000-0000-000000000000', 'd3m00000-0000-0000-0000-000000000000', 'Carol White', 'Initech', 'carol@initech.com', 'Cold Call', 'quote_sent', 5000, 'USD')
ON CONFLICT (id) DO NOTHING;

-- Demo Customers
INSERT INTO customers (id, organization_id, name, company, email, phone, city, segment, lifetime_value, source_lead_id)
VALUES
  ('d3m00007-0000-0000-0000-000000000000', 'd3m00000-0000-0000-0000-000000000000', 'David Black', 'Massive Dynamic', 'david@massive.com', '555-0100', 'New York', 'Enterprise', 120000, null)
ON CONFLICT (id) DO NOTHING;

-- Security Definer function to allow any authenticated user to join the demo workspace as a viewer
CREATE OR REPLACE FUNCTION join_demo_workspace()
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

  INSERT INTO organization_members (organization_id, user_id, role, created_at)
  VALUES ('d3m00000-0000-0000-0000-000000000000', v_user_id, 'viewer', now())
  ON CONFLICT (organization_id, user_id) 
  DO UPDATE SET role = 'viewer', created_at = now();
END;
$$;
