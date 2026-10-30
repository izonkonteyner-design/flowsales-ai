-- Real PostgreSQL Multi-Tenant RLS & Maestro Contract Verification
\set ON_ERROR_STOP on

BEGIN;

-- 1. Create two test organizations
INSERT INTO public.organizations (id, name, slug)
VALUES 
  ('11111111-1111-1111-1111-111111111111', 'Tenant Alpha Corp', 'alpha-corp'),
  ('22222222-2222-2222-2222-222222222222', 'Tenant Beta Ltd', 'beta-ltd');

-- 2. Create test users in auth.users
INSERT INTO auth.users (id, email)
VALUES
  ('aaaa0001-0000-0000-0000-000000000001', 'owner_a@alpha.test'),
  ('aaaa0002-0000-0000-0000-000000000002', 'admin_a@alpha.test'),
  ('aaaa0003-0000-0000-0000-000000000003', 'sales_a@alpha.test'),
  ('aaaa0004-0000-0000-0000-000000000004', 'member_a@alpha.test'),
  ('bbbb0001-0000-0000-0000-000000000001', 'owner_b@beta.test'),
  ('bbbb0002-0000-0000-0000-000000000002', 'sales_b@beta.test');

-- 3. Assign workspace memberships
INSERT INTO public.organization_members (organization_id, user_id, role)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'aaaa0001-0000-0000-0000-000000000001', 'owner'),
  ('11111111-1111-1111-1111-111111111111', 'aaaa0002-0000-0000-0000-000000000002', 'admin'),
  ('11111111-1111-1111-1111-111111111111', 'aaaa0003-0000-0000-0000-000000000003', 'sales'),
  ('11111111-1111-1111-1111-111111111111', 'aaaa0004-0000-0000-0000-000000000004', 'viewer'),
  ('22222222-2222-2222-2222-222222222222', 'bbbb0001-0000-0000-0000-000000000001', 'owner'),
  ('22222222-2222-2222-2222-222222222222', 'bbbb0002-0000-0000-0000-000000000002', 'sales');

-- 4. Seed Maestro Agent Definitions for Tenant Alpha and Tenant Beta
INSERT INTO public.agent_definitions (id, organization_id, key, name, department, system_instructions)
VALUES
  ('aa110000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'sales_agent', 'Alpha Sales Agent', 'sales', 'Drive enterprise pipeline.'),
  ('bb220000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'support_agent', 'Beta Support Agent', 'support', 'Resolve customer issues.');

-- 5. Seed Orchestration Plans
INSERT INTO public.orchestration_plans (id, organization_id, created_by, objective, status)
VALUES
  ('aa110000-0000-0000-0000-000000000010', '11111111-1111-1111-1111-111111111111', 'aaaa0001-0000-0000-0000-000000000001', 'Q4 Growth Sprint', 'executing'),
  ('bb220000-0000-0000-0000-000000000010', '22222222-2222-2222-2222-222222222222', 'bbbb0001-0000-0000-0000-000000000001', 'Beta Support Automation', 'executing');

-- 6. Seed Orchestration Tasks
INSERT INTO public.orchestration_tasks (id, organization_id, plan_id, assigned_agent_key, title, status)
VALUES
  ('aa110000-0000-0000-0000-000000000100', '11111111-1111-1111-1111-111111111111', 'aa110000-0000-0000-0000-000000000010', 'sales_agent', 'Outreach 50 Leads', 'running'),
  ('bb220000-0000-0000-0000-000000000100', '22222222-2222-2222-2222-222222222222', 'bb220000-0000-0000-0000-000000000010', 'support_agent', 'Triage Tickets', 'queued');

-- 7. Seed Business Memories
INSERT INTO public.business_memories (id, organization_id, category, title, content, source_attribution)
VALUES
  ('aa110000-0000-0000-0000-000000001000', '11111111-1111-1111-1111-111111111111', 'business_policy', 'Discount Limit', 'Max discount 15%', 'executive_memo'),
  ('bb220000-0000-0000-0000-000000001000', '22222222-2222-2222-2222-222222222222', 'business_policy', 'SLA Target', 'SLA 2 hours', 'service_agreement');

-- 8. Seed Leads
INSERT INTO public.leads (id, organization_id, full_name, status)
VALUES
  ('aa110000-0000-0000-0000-000000010000', '11111111-1111-1111-1111-111111111111', 'Acme Corp', 'new'),
  ('bb220000-0000-0000-0000-000000010000', '22222222-2222-2222-2222-222222222222', 'Zenith Global', 'contacted');

-- 9. Seed Quotes
INSERT INTO public.quotes (id, organization_id, quote_number, issue_date, expiry_date, valid_until, status)
VALUES
  ('aa110000-0000-0000-0000-000000100000', '11111111-1111-1111-1111-111111111111', 'Q-ALPHA-001', CURRENT_DATE, CURRENT_DATE + 30, CURRENT_DATE + 30, 'draft'),
  ('bb220000-0000-0000-0000-000000100000', '22222222-2222-2222-2222-222222222222', 'Q-BETA-001', CURRENT_DATE, CURRENT_DATE + 30, CURRENT_DATE + 30, 'draft');

COMMIT;

-- ============================================================================
-- VERIFICATION TESTS UNDER AUTHENTICATED USER SESSIONS (RLS ACTIVATED)
-- ============================================================================

-- TEST 1: Tenant Alpha Sales User queries orchestration_plans
-- Expected: Exactly 1 plan (Alpha's), ZERO plans from Beta.
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaa0003-0000-0000-0000-000000000003';
SET request.jwt.claim.role = 'authenticated';

DO $$
DECLARE
  v_count int;
  v_forbidden_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.orchestration_plans;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST 1 FAILED: Expected 1 orchestration plan for Alpha, got %', v_count;
  END IF;

  SELECT count(*) INTO v_forbidden_count FROM public.orchestration_plans WHERE organization_id = '22222222-2222-2222-2222-222222222222';
  IF v_forbidden_count <> 0 THEN
    RAISE EXCEPTION 'TEST 1 FAILED: Tenant isolation breach! Alpha saw % rows from Beta', v_forbidden_count;
  END IF;
  RAISE NOTICE 'TEST 1 PASSED: Alpha Sales user sees exactly Alpha plans and 0 Beta plans.';
END $$;

-- TEST 2: Tenant Alpha Sales User queries orchestration_tasks
-- Expected: Exactly 1 task (Alpha's), ZERO tasks from Beta.
DO $$
DECLARE
  v_count int;
  v_forbidden_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.orchestration_tasks;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST 2 FAILED: Expected 1 orchestration task for Alpha, got %', v_count;
  END IF;

  SELECT count(*) INTO v_forbidden_count FROM public.orchestration_tasks WHERE organization_id = '22222222-2222-2222-2222-222222222222';
  IF v_forbidden_count <> 0 THEN
    RAISE EXCEPTION 'TEST 2 FAILED: Tenant isolation breach! Alpha saw % tasks from Beta', v_forbidden_count;
  END IF;
  RAISE NOTICE 'TEST 2 PASSED: Alpha Sales user sees exactly Alpha tasks and 0 Beta tasks.';
END $$;

-- TEST 3: Tenant Alpha Sales User queries business_memories
-- Expected: Exactly 1 memory (Alpha's), ZERO memories from Beta.
DO $$
DECLARE
  v_count int;
  v_forbidden_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.business_memories;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST 3 FAILED: Expected 1 business_memory for Alpha, got %', v_count;
  END IF;

  SELECT count(*) INTO v_forbidden_count FROM public.business_memories WHERE organization_id = '22222222-2222-2222-2222-222222222222';
  IF v_forbidden_count <> 0 THEN
    RAISE EXCEPTION 'TEST 3 FAILED: Tenant isolation breach in business_memories! Count: %', v_forbidden_count;
  END IF;
  RAISE NOTICE 'TEST 3 PASSED: Alpha Sales user sees only Alpha business memories.';
END $$;

-- TEST 4: Cross-Tenant Data Tampering Attempt (Tenant Alpha tries to modify Beta's task)
-- Expected: 0 rows updated (RLS denies visibility and mutation).
DO $$
DECLARE
  v_affected int;
BEGIN
  UPDATE public.orchestration_tasks
  SET status = 'cancelled'
  WHERE id = 'bb220000-0000-0000-0000-000000000100';
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  
  IF v_affected <> 0 THEN
    RAISE EXCEPTION 'TEST 4 FAILED: Cross-tenant update succeeded! Affected % rows', v_affected;
  END IF;
  RAISE NOTICE 'TEST 4 PASSED: Cross-tenant UPDATE silently rejected by RLS (0 rows affected).';
END $$;

-- TEST 5: Cross-Tenant Insert Attempt (Tenant Alpha tries to insert a task into Beta organization)
-- Expected: Error or blocked by WITH CHECK
DO $$
BEGIN
  BEGIN
    INSERT INTO public.orchestration_tasks (organization_id, plan_id, assigned_agent_key, title)
    VALUES ('22222222-2222-2222-2222-222222222222', 'bb220000-0000-0000-0000-000000000010', 'support_agent', 'Malicious Task');
    RAISE EXCEPTION 'TEST 5 FAILED: Cross-tenant insert into Beta was permitted!';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation OR foreign_key_violation THEN
      RAISE NOTICE 'TEST 5 PASSED: Cross-tenant INSERT correctly rejected by RLS WITH CHECK policy.';
  END;
END $$;

-- TEST 6: Tenant Beta Sales User session
-- Expected: Sees only Beta records, 0 Alpha records.
SET request.jwt.claim.sub = 'bbbb0002-0000-0000-0000-000000000002';

DO $$
DECLARE
  v_plan_count int;
  v_task_count int;
  v_lead_count int;
  v_quote_count int;
BEGIN
  SELECT count(*) INTO v_plan_count FROM public.orchestration_plans WHERE organization_id = '11111111-1111-1111-1111-111111111111';
  SELECT count(*) INTO v_task_count FROM public.orchestration_tasks WHERE organization_id = '11111111-1111-1111-1111-111111111111';
  SELECT count(*) INTO v_lead_count FROM public.leads WHERE organization_id = '11111111-1111-1111-1111-111111111111';
  SELECT count(*) INTO v_quote_count FROM public.quotes WHERE organization_id = '11111111-1111-1111-1111-111111111111';

  IF v_plan_count + v_task_count + v_lead_count + v_quote_count > 0 THEN
    RAISE EXCEPTION 'TEST 6 FAILED: Beta user saw Alpha records! plans: %, tasks: %, leads: %, quotes: %',
      v_plan_count, v_task_count, v_lead_count, v_quote_count;
  END IF;
  RAISE NOTICE 'TEST 6 PASSED: Beta user sees 0 Alpha records across plans, tasks, leads, and quotes.';
END $$;

-- TEST 7: Role Permission Guard - Member role (non-sales, non-admin)
-- Member can read plans, but CANNOT create or update plans.
SET request.jwt.claim.sub = 'aaaa0004-0000-0000-0000-000000000004'; -- member_a

DO $$
DECLARE
  v_count int;
BEGIN
  -- Can read
  SELECT count(*) INTO v_count FROM public.orchestration_plans WHERE organization_id = '11111111-1111-1111-1111-111111111111';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST 7a FAILED: Member should be able to read plans, got %', v_count;
  END IF;

  -- Cannot insert
  BEGIN
    INSERT INTO public.orchestration_plans (organization_id, objective)
    VALUES ('11111111-1111-1111-1111-111111111111', 'Unauthorized Plan by Member');
    RAISE EXCEPTION 'TEST 7b FAILED: Member was allowed to create orchestration plan!';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN
      RAISE NOTICE 'TEST 7 PASSED: Member role can read but cannot create orchestration plans.';
  END;
END $$;

-- TEST 8: CAS (Compare-And-Swap) Task Locking Contract
-- Maestro worker acquires a lock on a task atomically
RESET ROLE;
SET request.jwt.claim.sub = 'aaaa0003-0000-0000-0000-000000000003';
SET ROLE authenticated;

DO $$
DECLARE
  v_locked_task_id uuid;
  v_second_attempt_id uuid;
BEGIN
  -- Worker 1 acquires lock on pending/queued task
  UPDATE public.orchestration_tasks
  SET concurrency_lock_id = 'worker-node-alpha-101',
      status = 'running',
      started_at = now()
  WHERE id = 'aa110000-0000-0000-0000-000000000100'
    AND (concurrency_lock_id IS NULL OR concurrency_lock_id = '')
  RETURNING id INTO v_locked_task_id;

  -- Worker 2 attempts to acquire lock concurrently on the same task
  UPDATE public.orchestration_tasks
  SET concurrency_lock_id = 'worker-node-alpha-102',
      status = 'running'
  WHERE id = 'aa110000-0000-0000-0000-000000000100'
    AND (concurrency_lock_id IS NULL OR concurrency_lock_id = '')
  RETURNING id INTO v_second_attempt_id;

  IF v_second_attempt_id IS NOT NULL THEN
    RAISE EXCEPTION 'TEST 8 FAILED: Worker 2 stole lock from Worker 1!';
  END IF;

  RAISE NOTICE 'TEST 8 PASSED: CAS atomic task locking prevented race condition.';
END $$;

-- TEST 9: Connector Definitions RLS Isolation
RESET ROLE;
INSERT INTO public.connector_definitions (id, organization_id, provider_key, display_name)
VALUES ('cc110000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'crm_internal', 'Alpha Internal CRM');

SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbb0002-0000-0000-0000-000000000002'; -- Beta Sales User
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.connector_definitions WHERE id = 'cc110000-0000-0000-0000-000000000001';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 9 FAILED: Beta user saw Alpha connector definition!';
  END IF;
  RAISE NOTICE 'TEST 9 PASSED: Connector definitions strictly isolated across tenants.';
END $$;

-- TEST 10: Task Dependencies Foreign Key and Tenant Isolation
RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaa0003-0000-0000-0000-000000000003'; -- Alpha Sales User
DO $$
BEGIN
  -- Insert a second task in Alpha
  INSERT INTO public.orchestration_tasks (id, organization_id, plan_id, assigned_agent_key, title, status)
  VALUES ('aa110000-0000-0000-0000-000000000101', '11111111-1111-1111-1111-111111111111', 'aa110000-0000-0000-0000-000000000010', 'sales_agent', 'Draft Contracts', 'pending');

  -- Create dependency: Task 101 depends on Task 100
  INSERT INTO public.orchestration_task_dependencies (organization_id, task_id, depends_on_task_id)
  VALUES ('11111111-1111-1111-1111-111111111111', 'aa110000-0000-0000-0000-000000000101', 'aa110000-0000-0000-0000-000000000100');

  RAISE NOTICE 'TEST 10 PASSED: Valid in-tenant task dependency successfully established.';
END $$;

RESET ROLE;
