-- 0020_ai_multi_agents.sql
-- Idempotent migration: extend ai_agents.type constraint and seed 5 agent types.

-- 1. Relax the ai_agents.type CHECK constraint to support 5 agent types.
ALTER TABLE public.ai_agents
  DROP CONSTRAINT IF EXISTS ai_agents_type_check;

ALTER TABLE public.ai_agents
  ADD CONSTRAINT ai_agents_type_check CHECK (
    type IN ('sales', 'support', 'operations', 'reporting', 'social')
  );

-- 2. Seed demo agents, knowledge, playbooks, conversations, messages, actions, handoffs.
-- All seed inserts are wrapped in an exception-safe DO block so a failure (e.g. because
-- the demo workspace does not exist) does not block the migration.
DO $$
BEGIN
  -- Seed 5 demo agents (one per type) for the demo workspace if not present.
  INSERT INTO public.ai_agents (id, organization_id, type, name, status, description, system_prompt)
  SELECT a.id, o.id, a.type, a.name, a.status, a.description, a.system_prompt
  FROM public.organizations o
  CROSS JOIN (VALUES
    ('a1a1a1a1-0000-0000-0000-000000000000'::uuid, 'sales', 'Global Sales Assistant', 'active',
     'Primary AI agent for handling inbound inquiries',
     'You are a helpful sales assistant. Never invent prices. Ask for missing information.'),
    ('a1a1a1a1-0000-0000-0000-000000000002'::uuid, 'support', 'FlowDesk Support Specialist', 'active',
     'Primary AI agent for customer support: FAQ answers, ticket classification, human handoff.',
     'You are a helpful customer support agent. Answer FAQ from the knowledge base. Classify requests by category and severity. Escalate to human if angry, billing, or security-related.'),
    ('a1a1a1a1-0000-0000-0000-000000000003'::uuid, 'operations', 'FlowOps Operations Assistant', 'active',
     'AI agent for order tracking, stock alerts, and shipment status reporting.',
     'You are an operations assistant. Track orders, flag low stock items, and report shipment status. Never invent order IDs or stock counts — use the knowledge base only.'),
    ('a1a1a1a1-0000-0000-0000-000000000004'::uuid, 'reporting', 'FlowInsights Reporting Analyst', 'active',
     'Prepares daily sales reports, performance analyses, and manager digests.',
     'You are a reporting analyst. Produce daily sales reports and performance summaries. Use the knowledge base for historical context. Never invent numbers — propose report generation actions.'),
    ('a1a1a1a1-0000-0000-0000-000000000005'::uuid, 'social', 'FlowSocial Content Strategist', 'active',
     'Generates content ideas, posting schedules, and ad copy for social channels.',
     'You are a social media content strategist. Propose content ideas, posting schedules, and ad copy matched to the brand voice from the knowledge base.')
  ) AS a(id, type, name, status, description, system_prompt)
  WHERE o.slug = 'flowsales-demo'
  ON CONFLICT (id) DO UPDATE SET system_prompt = EXCLUDED.system_prompt;

  -- Seed Knowledge items for non-sales agents (idempotent).
  INSERT INTO public.ai_knowledge_items (id, organization_id, agent_id, title, content, category)
  SELECT k.id, o.id, k.agent_id, k.title, k.content, k.category
  FROM public.organizations o
  CROSS JOIN (VALUES
    ('k1k1k1k1-0000-0000-0000-000000000010'::uuid, 'a1a1a1a1-0000-0000-0000-000000000002'::uuid, 'Refund FAQ', 'Refunds are processed within 5 business days for eligible purchases.', 'faq'),
    ('k1k1k1k1-0000-0000-0000-000000000011'::uuid, 'a1a1a1a1-0000-0000-0000-000000000002'::uuid, 'Ticket Categories', 'Categories: billing, technical, account, security, general.', 'classification'),
    ('k1k1k1k1-0000-0000-0000-000000000020'::uuid, 'a1a1a1a1-0000-0000-0000-000000000003'::uuid, 'Order Lead Times', 'Standard orders ship in 2 business days; expedite ships same day before 14:00.', 'logistics'),
    ('k1k1k1k1-0000-0000-0000-000000000021'::uuid, 'a1a1a1a1-0000-0000-0000-000000000003'::uuid, 'Stock Alert Threshold', 'Items with available stock below 5 units should trigger a low stock alert.', 'inventory'),
    ('k1k1k1k1-0000-0000-0000-000000000030'::uuid, 'a1a1a1a1-0000-0000-0000-000000000004'::uuid, 'Reporting Period', 'Daily sales reports cover 00:00–23:59 in the workspace timezone.', 'reporting'),
    ('k1k1k1k1-0000-0000-0000-000000000040'::uuid, 'a1a1a1a1-0000-0000-0000-000000000005'::uuid, 'Brand Voice', 'Tone: friendly, professional, optimistic. Avoid jargon. Hashtags: #FlowSales #SimplifySales.', 'branding')
  ) AS k(id, agent_id, title, content, category)
  WHERE o.slug = 'flowsales-demo'
  ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content;

  -- Seed Playbooks for new agents.
  INSERT INTO public.ai_playbooks (id, organization_id, agent_id, name, description, trigger_type, instructions, allowed_actions)
  SELECT p.id, o.id, p.agent_id, p.name, p.description, p.trigger_type, p.instructions, p.allowed_actions::jsonb
  FROM public.organizations o
  CROSS JOIN (VALUES
    ('p2p2p2p2-0000-0000-0000-000000000001'::uuid, 'a1a1a1a1-0000-0000-0000-000000000002'::uuid, 'FAQ Answering', 'Answer frequent customer questions from the knowledge base.', 'manual', 'Search knowledge base before answering. If unsure, escalate.', '["search_knowledge"]'),
    ('p2p2p2p2-0000-0000-0000-000000000002'::uuid, 'a1a1a1a1-0000-0000-0000-000000000002'::uuid, 'Support Ticket Classification', 'Classify and route inbound support requests.', 'manual', 'Classify by category and severity. Escalate angry or security requests to human.', '["classify_support_request", "request_human_handoff"]'),
    ('p2p2p2p2-0000-0000-0000-000000000010'::uuid, 'a1a1a1a1-0000-0000-0000-000000000003'::uuid, 'Order Tracking', 'Look up shipment status for a given order.', 'manual', 'Use the order ID provided. Do not guess status.', '["track_order", "search_knowledge"]'),
    ('p2p2p2p2-0000-0000-0000-000000000011'::uuid, 'a1a1a1a1-0000-0000-0000-000000000003'::uuid, 'Low Stock Alert', 'Flag products whose stock is at or below the threshold.', 'manual', 'Only generate alerts for items that are explicitly low in the knowledge base.', '["alert_low_stock"]'),
    ('p2p2p2p2-0000-0000-0000-000000000020'::uuid, 'a1a1a1a1-0000-0000-0000-000000000004'::uuid, 'Daily Sales Digest', 'Generate an end-of-day sales summary for the manager.', 'manual', 'Produce a concise digest of total revenue, top product, and pipeline value. Propose a report action.', '["generate_daily_report"]'),
    ('p2p2p2p2-0000-0000-0000-000000000030'::uuid, 'a1a1a1a1-0000-0000-0000-000000000005'::uuid, 'Content Idea Brainstorm', 'Propose social content ideas aligned to brand voice.', 'manual', 'Suggest 3 ideas with rationale and hashtags.', '["suggest_content", "plan_post_schedule"]'),
    ('p2p2p2p2-0000-0000-0000-000000000031'::uuid, 'a1a1a1a1-0000-0000-0000-000000000005'::uuid, 'Ad Copy Drafting', 'Draft short ad copy variants for paid campaigns.', 'manual', 'Produce 3 short variants with a CTA. Never invent prices.', '["draft_ad_copy", "suggest_content"]')
  ) AS p(id, agent_id, name, description, trigger_type, instructions, allowed_actions)
  WHERE o.slug = 'flowsales-demo'
  ON CONFLICT (id) DO UPDATE SET instructions = EXCLUDED.instructions;

  -- Seed demo conversations for the new agent types.
  INSERT INTO public.ai_conversations (id, organization_id, agent_id, status, visitor_name, visitor_email, subject, intent)
  SELECT c.id, o.id, c.agent_id, c.status, c.visitor_name, c.visitor_email, c.subject, c.intent
  FROM public.organizations o
  CROSS JOIN (VALUES
    ('c2c2c2c2-0000-0000-0000-000000000001'::uuid, 'a1a1a1a1-0000-0000-0000-000000000002'::uuid, 'open', 'Mehmet Yılmaz', 'mehmet@example.com', 'Refund not received', 'support'),
    ('c2c2c2c2-0000-0000-0000-000000000010'::uuid, 'a1a1a1a1-0000-0000-0000-000000000003'::uuid, 'open', 'Ops Dashboard', NULL::text, 'Shipment delay inquiry', 'operations'),
    ('c2c2c2c2-0000-0000-0000-000000000020'::uuid, 'a1a1a1a1-0000-0000-0000-000000000004'::uuid, 'resolved', 'Manager', NULL::text, 'Daily report request', 'reporting'),
    ('c2c2c2c2-0000-0000-0000-000000000030'::uuid, 'a1a1a1a1-0000-0000-0000-000000000005'::uuid, 'open', 'Marketing Lead', NULL::text, 'Need 3 LinkedIn posts', 'social')
  ) AS c(id, agent_id, status, visitor_name, visitor_email, subject, intent)
  WHERE o.slug = 'flowsales-demo'
  ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;

  -- Seed demo messages for the new conversations.
  INSERT INTO public.ai_messages (id, organization_id, conversation_id, role, content)
  SELECT m.id, o.id, m.conversation_id, m.role, m.content
  FROM public.organizations o
  CROSS JOIN (VALUES
    ('n1n1n1n1-0000-0000-0000-000000000001'::uuid, 'c2c2c2c2-0000-0000-0000-000000000001'::uuid, 'user', 'My refund has not arrived yet.'),
    ('n1n1n1n1-0000-0000-0000-000000000002'::uuid, 'c2c2c2c2-0000-0000-0000-000000000001'::uuid, 'assistant', 'I am sorry to hear that. Refunds are processed within 5 business days. May I have your order ID?'),
    ('n1n1n1n1-0000-0000-0000-000000000010'::uuid, 'c2c2c2c2-0000-0000-0000-000000000010'::uuid, 'user', 'Where is order #1042?'),
    ('n1n1n1n1-0000-0000-0000-000000000020'::uuid, 'c2c2c2c2-0000-0000-0000-000000000020'::uuid, 'user', 'Send me the daily sales digest.'),
    ('n1n1n1n1-0000-0000-0000-000000000021'::uuid, 'c2c2c2c2-0000-0000-0000-000000000020'::uuid, 'assistant', 'Today revenue was 12,400 TRY with 3 top products. I proposed a report action for approval.'),
    ('n1n1n1n1-0000-0000-0000-000000000030'::uuid, 'c2c2c2c2-0000-0000-0000-000000000030'::uuid, 'user', 'Draft 3 LinkedIn posts about AI in sales.')
  ) AS m(id, conversation_id, role, content)
  WHERE o.slug = 'flowsales-demo'
  ON CONFLICT (id) DO NOTHING;

  -- Seed demo action runs for non-sales agents.
  INSERT INTO public.ai_action_runs (id, organization_id, agent_id, conversation_id, action_type, status, input_payload)
  SELECT a.id, o.id, a.agent_id, a.conversation_id, a.action_type, a.status, a.input_payload::jsonb
  FROM public.organizations o
  CROSS JOIN (VALUES
    ('a2a2a2a2-0000-0000-0000-000000000001'::uuid, 'a1a1a1a1-0000-0000-0000-000000000002'::uuid, 'c2c2c2c2-0000-0000-0000-000000000001'::uuid, 'classify_support_request', 'approved', '{"category": "billing", "severity": "medium"}'),
    ('a2a2a2a2-0000-0000-0000-000000000010'::uuid, 'a1a1a1a1-0000-0000-0000-000000000004'::uuid, 'c2c2c2c2-0000-0000-0000-000000000020'::uuid, 'generate_daily_report', 'proposed', '{}'),
    ('a2a2a2a2-0000-0000-0000-000000000030'::uuid, 'a1a1a1a1-0000-0000-0000-000000000005'::uuid, 'c2c2c2c2-0000-0000-0000-000000000030'::uuid, 'suggest_content', 'proposed', '{"platform": "linkedin", "count": 3}')
  ) AS a(id, agent_id, conversation_id, action_type, status, input_payload)
  WHERE o.slug = 'flowsales-demo'
  ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '0020 seed data skipped (non-fatal): %', SQLERRM;
END $$;
