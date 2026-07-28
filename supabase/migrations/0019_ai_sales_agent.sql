-- 0019_ai_sales_agent.sql
-- Idempotent Migration for AI Sales Agent MVP

-- 1. Create Tables
CREATE TABLE IF NOT EXISTS public.ai_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'sales' CHECK (type IN ('sales')),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused')),
  description text,
  model text NOT NULL DEFAULT 'gemini-3.1-flash-lite',
  system_prompt text NOT NULL,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'waiting_customer', 'waiting_human', 'resolved', 'closed')),
  channel text NOT NULL DEFAULT 'app' CHECK (channel IN ('app')),
  visitor_name text,
  visitor_email text,
  visitor_phone text,
  subject text,
  summary text,
  sentiment text,
  intent text,
  human_handoff_required boolean NOT NULL DEFAULT false,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content text NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_knowledge_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  category text NOT NULL,
  source_type text NOT NULL DEFAULT 'manual',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_playbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  trigger_type text NOT NULL DEFAULT 'manual',
  instructions text NOT NULL,
  allowed_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_action_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'pending_approval', 'approved', 'executing', 'completed', 'failed', 'rejected')),
  input_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_payload jsonb,
  error_code text,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.ai_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  reason text NOT NULL,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.ai_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  due_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  message_draft text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS ai_agents_org_idx ON public.ai_agents(organization_id);
CREATE INDEX IF NOT EXISTS ai_conversations_org_idx ON public.ai_conversations(organization_id);
CREATE INDEX IF NOT EXISTS ai_conversations_agent_idx ON public.ai_conversations(agent_id);
CREATE INDEX IF NOT EXISTS ai_messages_conv_idx ON public.ai_messages(conversation_id);
CREATE INDEX IF NOT EXISTS ai_knowledge_items_org_idx ON public.ai_knowledge_items(organization_id);
CREATE INDEX IF NOT EXISTS ai_playbooks_org_idx ON public.ai_playbooks(organization_id);
CREATE INDEX IF NOT EXISTS ai_action_runs_conv_idx ON public.ai_action_runs(conversation_id);
CREATE INDEX IF NOT EXISTS ai_handoffs_conv_idx ON public.ai_handoffs(conversation_id);
CREATE INDEX IF NOT EXISTS ai_followups_conv_idx ON public.ai_followups(conversation_id);

-- 3. Triggers for updated_at
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_ai_agents_updated_at') THEN
    CREATE TRIGGER set_ai_agents_updated_at BEFORE UPDATE ON public.ai_agents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_ai_conversations_updated_at') THEN
    CREATE TRIGGER set_ai_conversations_updated_at BEFORE UPDATE ON public.ai_conversations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_ai_knowledge_items_updated_at') THEN
    CREATE TRIGGER set_ai_knowledge_items_updated_at BEFORE UPDATE ON public.ai_knowledge_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_ai_playbooks_updated_at') THEN
    CREATE TRIGGER set_ai_playbooks_updated_at BEFORE UPDATE ON public.ai_playbooks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- 4. Enable RLS
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_knowledge_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_playbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_action_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_handoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_followups ENABLE ROW LEVEL SECURITY;

-- 5. Create RLS Policies
-- ai_agents
DROP POLICY IF EXISTS "members can read ai_agents" ON public.ai_agents;
CREATE POLICY "members can read ai_agents" ON public.ai_agents FOR SELECT USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "sales and admins can manage ai_agents" ON public.ai_agents;
CREATE POLICY "sales and admins can manage ai_agents" ON public.ai_agents FOR ALL 
USING (public.has_org_role(organization_id, array['owner', 'admin', 'sales'])) 
WITH CHECK (public.has_org_role(organization_id, array['owner', 'admin', 'sales']));

-- ai_conversations
DROP POLICY IF EXISTS "members can read ai_conversations" ON public.ai_conversations;
CREATE POLICY "members can read ai_conversations" ON public.ai_conversations FOR SELECT USING (public.is_org_member(organization_id));

-- Viewers (including demo users) CAN create conversations to test the chat UI safely.
DROP POLICY IF EXISTS "members can create ai_conversations" ON public.ai_conversations;
CREATE POLICY "members can create ai_conversations" ON public.ai_conversations FOR INSERT 
WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "members can update ai_conversations" ON public.ai_conversations;
CREATE POLICY "members can update ai_conversations" ON public.ai_conversations FOR UPDATE 
USING (public.is_org_member(organization_id)) 
WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "sales and admins can delete ai_conversations" ON public.ai_conversations;
CREATE POLICY "sales and admins can delete ai_conversations" ON public.ai_conversations FOR DELETE 
USING (public.has_org_role(organization_id, array['owner', 'admin', 'sales']));


-- ai_messages
DROP POLICY IF EXISTS "members can read ai_messages" ON public.ai_messages;
CREATE POLICY "members can read ai_messages" ON public.ai_messages FOR SELECT USING (public.is_org_member(organization_id));

-- Viewers can send messages for the chat simulation
DROP POLICY IF EXISTS "members can create ai_messages" ON public.ai_messages;
CREATE POLICY "members can create ai_messages" ON public.ai_messages FOR INSERT 
WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "sales and admins can manage ai_messages" ON public.ai_messages;
CREATE POLICY "sales and admins can manage ai_messages" ON public.ai_messages FOR UPDATE
USING (public.has_org_role(organization_id, array['owner', 'admin', 'sales']))
WITH CHECK (public.has_org_role(organization_id, array['owner', 'admin', 'sales']));

DROP POLICY IF EXISTS "sales and admins can delete ai_messages" ON public.ai_messages;
CREATE POLICY "sales and admins can delete ai_messages" ON public.ai_messages FOR DELETE 
USING (public.has_org_role(organization_id, array['owner', 'admin', 'sales']));

-- ai_knowledge_items
DROP POLICY IF EXISTS "members can read ai_knowledge_items" ON public.ai_knowledge_items;
CREATE POLICY "members can read ai_knowledge_items" ON public.ai_knowledge_items FOR SELECT USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "sales and admins can manage ai_knowledge_items" ON public.ai_knowledge_items;
CREATE POLICY "sales and admins can manage ai_knowledge_items" ON public.ai_knowledge_items FOR ALL 
USING (public.has_org_role(organization_id, array['owner', 'admin', 'sales'])) 
WITH CHECK (public.has_org_role(organization_id, array['owner', 'admin', 'sales']));

-- ai_playbooks
DROP POLICY IF EXISTS "members can read ai_playbooks" ON public.ai_playbooks;
CREATE POLICY "members can read ai_playbooks" ON public.ai_playbooks FOR SELECT USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "sales and admins can manage ai_playbooks" ON public.ai_playbooks;
CREATE POLICY "sales and admins can manage ai_playbooks" ON public.ai_playbooks FOR ALL 
USING (public.has_org_role(organization_id, array['owner', 'admin', 'sales'])) 
WITH CHECK (public.has_org_role(organization_id, array['owner', 'admin', 'sales']));

-- ai_action_runs
DROP POLICY IF EXISTS "members can read ai_action_runs" ON public.ai_action_runs;
CREATE POLICY "members can read ai_action_runs" ON public.ai_action_runs FOR SELECT USING (public.is_org_member(organization_id));

-- Viewers can INSERT action runs (because chat triggers them), but they CANNOT UPDATE them (approve/mutate CRM).
DROP POLICY IF EXISTS "members can create ai_action_runs" ON public.ai_action_runs;
CREATE POLICY "members can create ai_action_runs" ON public.ai_action_runs FOR INSERT 
WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "sales and admins can update ai_action_runs" ON public.ai_action_runs;
CREATE POLICY "sales and admins can update ai_action_runs" ON public.ai_action_runs FOR UPDATE 
USING (public.has_org_role(organization_id, array['owner', 'admin', 'sales'])) 
WITH CHECK (public.has_org_role(organization_id, array['owner', 'admin', 'sales']));

DROP POLICY IF EXISTS "sales and admins can delete ai_action_runs" ON public.ai_action_runs;
CREATE POLICY "sales and admins can delete ai_action_runs" ON public.ai_action_runs FOR DELETE 
USING (public.has_org_role(organization_id, array['owner', 'admin', 'sales']));

-- ai_handoffs
DROP POLICY IF EXISTS "members can read ai_handoffs" ON public.ai_handoffs;
CREATE POLICY "members can read ai_handoffs" ON public.ai_handoffs FOR SELECT USING (public.is_org_member(organization_id));

-- Viewers can trigger handoffs from chat
DROP POLICY IF EXISTS "members can create ai_handoffs" ON public.ai_handoffs;
CREATE POLICY "members can create ai_handoffs" ON public.ai_handoffs FOR INSERT 
WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "sales and admins can update ai_handoffs" ON public.ai_handoffs;
CREATE POLICY "sales and admins can update ai_handoffs" ON public.ai_handoffs FOR UPDATE 
USING (public.has_org_role(organization_id, array['owner', 'admin', 'sales'])) 
WITH CHECK (public.has_org_role(organization_id, array['owner', 'admin', 'sales']));

DROP POLICY IF EXISTS "sales and admins can delete ai_handoffs" ON public.ai_handoffs;
CREATE POLICY "sales and admins can delete ai_handoffs" ON public.ai_handoffs FOR DELETE 
USING (public.has_org_role(organization_id, array['owner', 'admin', 'sales']));

-- ai_followups
DROP POLICY IF EXISTS "members can read ai_followups" ON public.ai_followups;
CREATE POLICY "members can read ai_followups" ON public.ai_followups FOR SELECT USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "sales and admins can manage ai_followups" ON public.ai_followups;
CREATE POLICY "sales and admins can manage ai_followups" ON public.ai_followups FOR ALL 
USING (public.has_org_role(organization_id, array['owner', 'admin', 'sales'])) 
WITH CHECK (public.has_org_role(organization_id, array['owner', 'admin', 'sales']));

-- 6. Demo Seed Data
-- Idempotent inserts wrapped in exception-safe DO block to avoid blocking migration
-- if the demo workspace does not exist or seed data already conflicts.
DO $$
BEGIN
  INSERT INTO public.ai_agents (id, organization_id, type, name, status, description, system_prompt)
  SELECT 'a1a1a1a1-0000-0000-0000-000000000000', o.id, 'sales', 'Global Sales Assistant', 'active',
         'Primary AI agent for handling inbound inquiries',
         'You are a helpful sales assistant. Never invent prices. Ask for missing information.'
  FROM public.organizations o
  WHERE o.slug = 'flowsales-demo'
  ON CONFLICT (id) DO UPDATE SET system_prompt = EXCLUDED.system_prompt;

  INSERT INTO public.ai_knowledge_items (id, organization_id, agent_id, title, content, category)
  SELECT 'k1k1k1k1-0000-0000-0000-000000000001', o.id, 'a1a1a1a1-0000-0000-0000-000000000000', 'Company Overview', 'FlowSales is a modern CRM platform built for AI-first teams.', 'company'
  FROM public.organizations o WHERE o.slug = 'flowsales-demo'
  ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content;

  INSERT INTO public.ai_knowledge_items (id, organization_id, agent_id, title, content, category)
  SELECT 'k1k1k1k1-0000-0000-0000-000000000002', o.id, 'a1a1a1a1-0000-0000-0000-000000000000', 'Support Policy', 'We offer 24/7 support for all Enterprise customers.', 'sales_policy'
  FROM public.organizations o WHERE o.slug = 'flowsales-demo'
  ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content;

  INSERT INTO public.ai_knowledge_items (id, organization_id, agent_id, title, content, category)
  SELECT 'k1k1k1k1-0000-0000-0000-000000000003', o.id, 'a1a1a1a1-0000-0000-0000-000000000000', 'Pricing Guide', 'Base pricing is per user. Volume discounts available over 50 seats.', 'pricing'
  FROM public.organizations o WHERE o.slug = 'flowsales-demo'
  ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content;

  INSERT INTO public.ai_knowledge_items (id, organization_id, agent_id, title, content, category)
  SELECT 'k1k1k1k1-0000-0000-0000-000000000004', o.id, 'a1a1a1a1-0000-0000-0000-000000000000', 'Refund Policy', '30-day money back guarantee for all annual plans.', 'faq'
  FROM public.organizations o WHERE o.slug = 'flowsales-demo'
  ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content;

  INSERT INTO public.ai_knowledge_items (id, organization_id, agent_id, title, content, category)
  SELECT 'k1k1k1k1-0000-0000-0000-000000000005', o.id, 'a1a1a1a1-0000-0000-0000-000000000000', 'Integration Limits', 'Standard API limit is 1000 requests per minute.', 'faq'
  FROM public.organizations o WHERE o.slug = 'flowsales-demo'
  ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content;

  INSERT INTO public.ai_playbooks (id, organization_id, agent_id, name, description, trigger_type, instructions, allowed_actions)
  SELECT 'p1p1p1p1-0000-0000-0000-000000000001', o.id, 'a1a1a1a1-0000-0000-0000-000000000000', 'New Customer Greeting', 'Greet new visitors', 'manual', 'Ask how you can help and collect their name.', '[]'::jsonb
  FROM public.organizations o WHERE o.slug = 'flowsales-demo'
  ON CONFLICT (id) DO UPDATE SET instructions = EXCLUDED.instructions;

  INSERT INTO public.ai_playbooks (id, organization_id, agent_id, name, description, trigger_type, instructions, allowed_actions)
  SELECT 'p1p1p1p1-0000-0000-0000-000000000002', o.id, 'a1a1a1a1-0000-0000-0000-000000000000', 'Product Recommendation', 'Recommend CRM products', 'manual', 'Search for products matching the user needs.', '["search_products"]'::jsonb
  FROM public.organizations o WHERE o.slug = 'flowsales-demo'
  ON CONFLICT (id) DO UPDATE SET instructions = EXCLUDED.instructions;

  INSERT INTO public.ai_playbooks (id, organization_id, agent_id, name, description, trigger_type, instructions, allowed_actions)
  SELECT 'p1p1p1p1-0000-0000-0000-000000000003', o.id, 'a1a1a1a1-0000-0000-0000-000000000000', 'Price Request', 'Handle pricing questions', 'manual', 'Do not invent prices. Quote exactly from product search.', '["search_products", "create_quote_draft"]'::jsonb
  FROM public.organizations o WHERE o.slug = 'flowsales-demo'
  ON CONFLICT (id) DO UPDATE SET instructions = EXCLUDED.instructions;

  INSERT INTO public.ai_playbooks (id, organization_id, agent_id, name, description, trigger_type, instructions, allowed_actions)
  SELECT 'p1p1p1p1-0000-0000-0000-000000000004', o.id, 'a1a1a1a1-0000-0000-0000-000000000000', 'Human Handoff', 'Transfer to a human agent', 'manual', 'If the user is angry or asks for a human, trigger handoff.', '["request_human_handoff"]'::jsonb
  FROM public.organizations o WHERE o.slug = 'flowsales-demo'
  ON CONFLICT (id) DO UPDATE SET instructions = EXCLUDED.instructions;

  INSERT INTO public.ai_playbooks (id, organization_id, agent_id, name, description, trigger_type, instructions, allowed_actions)
  SELECT 'p1p1p1p1-0000-0000-0000-000000000005', o.id, 'a1a1a1a1-0000-0000-0000-000000000000', 'Follow-up Collection', 'Collect lead info', 'manual', 'Ensure you have email and name before creating a lead draft.', '["create_lead_draft", "create_followup"]'::jsonb
  FROM public.organizations o WHERE o.slug = 'flowsales-demo'
  ON CONFLICT (id) DO UPDATE SET instructions = EXCLUDED.instructions;

  INSERT INTO public.ai_conversations (id, organization_id, agent_id, lead_id, status, visitor_name, visitor_email)
  SELECT 'c1c1c1c1-0000-0000-0000-000000000001', o.id, 'a1a1a1a1-0000-0000-0000-000000000000', NULL, 'resolved', 'Alice Johnson', 'alice@acme.com'
  FROM public.organizations o WHERE o.slug = 'flowsales-demo'
  ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;

  INSERT INTO public.ai_conversations (id, organization_id, agent_id, lead_id, status, visitor_name, visitor_email)
  SELECT 'c1c1c1c1-0000-0000-0000-000000000002', o.id, 'a1a1a1a1-0000-0000-0000-000000000000', NULL, 'open', 'Unknown Visitor', NULL
  FROM public.organizations o WHERE o.slug = 'flowsales-demo'
  ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;

  INSERT INTO public.ai_conversations (id, organization_id, agent_id, lead_id, status, visitor_name, visitor_email)
  SELECT 'c1c1c1c1-0000-0000-0000-000000000003', o.id, 'a1a1a1a1-0000-0000-0000-000000000000', NULL, 'waiting_human', 'Angry User', 'angry@user.com'
  FROM public.organizations o WHERE o.slug = 'flowsales-demo'
  ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;

  INSERT INTO public.ai_messages (id, organization_id, conversation_id, role, content)
  SELECT 'm1m1m1m1-0000-0000-0000-000000000001', o.id, 'c1c1c1c1-0000-0000-0000-000000000001', 'user', 'Hi, I want a quote for 10 Enterprise licenses.'
  FROM public.organizations o WHERE o.slug = 'flowsales-demo'
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.ai_messages (id, organization_id, conversation_id, role, content)
  SELECT 'm1m1m1m1-0000-0000-0000-000000000002', o.id, 'c1c1c1c1-0000-0000-0000-000000000001', 'assistant', 'Sure! Let me draft that quote for you.'
  FROM public.organizations o WHERE o.slug = 'flowsales-demo'
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.ai_messages (id, organization_id, conversation_id, role, content)
  SELECT 'm1m1m1m1-0000-0000-0000-000000000003', o.id, 'c1c1c1c1-0000-0000-0000-000000000002', 'user', 'Hello'
  FROM public.organizations o WHERE o.slug = 'flowsales-demo'
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.ai_messages (id, organization_id, conversation_id, role, content)
  SELECT 'm1m1m1m1-0000-0000-0000-000000000004', o.id, 'c1c1c1c1-0000-0000-0000-000000000003', 'user', 'This is broken! Talk to a human now!'
  FROM public.organizations o WHERE o.slug = 'flowsales-demo'
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.ai_messages (id, organization_id, conversation_id, role, content)
  SELECT 'm1m1m1m1-0000-0000-0000-000000000005', o.id, 'c1c1c1c1-0000-0000-0000-000000000003', 'assistant', 'I apologize for the frustration. I will transfer you to a human agent.'
  FROM public.organizations o WHERE o.slug = 'flowsales-demo'
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.ai_action_runs (id, organization_id, agent_id, conversation_id, action_type, status, input_payload)
  SELECT 'r1r1r1r1-0000-0000-0000-000000000001', o.id, 'a1a1a1a1-0000-0000-0000-000000000000', 'c1c1c1c1-0000-0000-0000-000000000001', 'create_quote_draft', 'proposed', '{"product_name": "Enterprise CRM License", "quantity": 10}'::jsonb
  FROM public.organizations o WHERE o.slug = 'flowsales-demo'
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.ai_action_runs (id, organization_id, agent_id, conversation_id, action_type, status, input_payload)
  SELECT 'r1r1r1r1-0000-0000-0000-000000000002', o.id, 'a1a1a1a1-0000-0000-0000-000000000000', 'c1c1c1c1-0000-0000-0000-000000000003', 'request_human_handoff', 'completed', '{"reason": "User is frustrated and explicitly requested a human."}'::jsonb
  FROM public.organizations o WHERE o.slug = 'flowsales-demo'
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.ai_handoffs (id, organization_id, conversation_id, reason, priority, status)
  SELECT 'h1h1h1h1-0000-0000-0000-000000000001', o.id, 'c1c1c1c1-0000-0000-0000-000000000003', 'User is frustrated and explicitly requested a human.', 'high', 'open'
  FROM public.organizations o WHERE o.slug = 'flowsales-demo'
  ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Demo seed data skipped (non-fatal): %', SQLERRM;
END $$;

-- 7. AI Rate Limiting
CREATE TABLE IF NOT EXISTS public.ai_rate_limits (
  identifier text PRIMARY KEY,
  action_type text NOT NULL,
  request_count int DEFAULT 1,
  first_request_at timestamptz DEFAULT now(),
  last_request_at timestamptz DEFAULT now()
);

ALTER TABLE public.ai_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.check_ai_rate_limit(p_identifier text, p_action_type text, p_limit int, p_window interval)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  IF p_identifier IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.ai_rate_limits (identifier, action_type, request_count, first_request_at, last_request_at)
  VALUES (p_identifier, p_action_type, 1, now(), now())
  ON CONFLICT (identifier) DO UPDATE
  SET 
    request_count = CASE 
      WHEN public.ai_rate_limits.first_request_at < now() - p_window THEN 1 
      ELSE public.ai_rate_limits.request_count + 1 
    END,
    first_request_at = CASE 
      WHEN public.ai_rate_limits.first_request_at < now() - p_window THEN now() 
      ELSE public.ai_rate_limits.first_request_at 
    END,
    last_request_at = now()
  RETURNING request_count INTO v_count;

  IF v_count > p_limit THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.check_ai_rate_limit(text, text, int, interval) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_ai_rate_limit(text, text, int, interval) TO service_role;

