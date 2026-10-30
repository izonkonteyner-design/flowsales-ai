-- 0066_orchestration_maestro_foundation.sql
-- FlowSales AI: Autonomous Multi-Agent Orchestration & Maestro Foundation
-- Adds agent registry, orchestration plans, persistent DAG tasks, task dependencies,
-- multi-agent handoffs, tenant-scoped operational business memory, connector registry,
-- and event/scheduled workflows with strict Row-Level Security.

-- ============================================================================
-- 0. Forward-only schema safety: deployment_migrations & omnichannel indexes
-- ============================================================================

alter table public.deployment_migrations
  add column if not exists checksum text,
  add column if not exists executed_at timestamptz default now();

do $$
begin
  if to_regclass('public.conversation_participants') is not null then
    execute 'create unique index if not exists conversation_participants_unique on public.conversation_participants (conversation_id, participant_type, (coalesce(user_id::text, '''')), (coalesce(channel_contact_id::text, '''')))';
  end if;

  if to_regclass('public.message_delivery_events') is not null then
    execute 'create unique index if not exists message_delivery_events_message_event_unique on public.message_delivery_events (message_id, event_type, (coalesce(external_event_id, id::text)))';
  end if;
end $$;

-- ============================================================================
-- 1. agent_definitions: specialized agent registry per organization
-- ============================================================================

create table if not exists public.agent_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null,
  name text not null,
  description text,
  department text not null check (department in ('executive', 'sales', 'marketing', 'support', 'operations', 'quality', 'research')),
  system_instructions text not null,
  supported_skills text[] not null default '{}'::text[],
  permitted_tools text[] not null default '{}'::text[],
  provider text not null default 'gemini',
  model text not null default 'gemini-3.5-flash-lite',
  execution_limits jsonb not null default '{"max_iterations": 10, "max_tokens": 8000, "timeout_seconds": 60}'::jsonb,
  permission_profile jsonb not null default '{"can_read_crm": true, "can_draft_actions": true, "requires_approval_for_external": true, "external_spend_limit_usd": 0}'::jsonb,
  status text not null default 'active' check (status in ('active', 'disabled', 'draft')),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, key)
);

create index if not exists agent_definitions_org_idx
  on public.agent_definitions (organization_id, status);

create index if not exists agent_definitions_dept_idx
  on public.agent_definitions (organization_id, department);

-- ============================================================================
-- 2. orchestration_plans: Maestro high-level plans & goals
-- ============================================================================

create table if not exists public.orchestration_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  objective text not null,
  clarifications jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'planned', 'executing', 'completed', 'failed', 'cancelled')),
  plan_summary text,
  budget_limits jsonb not null default '{"max_subtasks": 15, "max_tokens": 60000, "max_usd": 1.0}'::jsonb,
  metrics jsonb not null default '{"total_tokens": 0, "estimated_cost_usd": 0, "duration_ms": 0}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);

create index if not exists orchestration_plans_org_idx
  on public.orchestration_plans (organization_id, created_at desc);

create index if not exists orchestration_plans_status_idx
  on public.orchestration_plans (organization_id, status);

-- ============================================================================
-- 3. orchestration_tasks: durable tasks with execution state & lock
-- ============================================================================

create table if not exists public.orchestration_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan_id uuid not null references public.orchestration_plans(id) on delete cascade,
  parent_task_id uuid references public.orchestration_tasks(id) on delete set null,
  agent_id uuid references public.agent_definitions(id) on delete set null,
  assigned_agent_key text not null,
  title text not null,
  description text,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'pending' check (status in (
    'draft', 'pending', 'queued', 'running', 'waiting_for_dependency',
    'waiting_for_approval', 'retrying', 'completed', 'failed', 'cancelled'
  )),
  input_payload jsonb not null default '{}'::jsonb,
  output_payload jsonb,
  error_info jsonb,
  retry_count integer not null default 0 check (retry_count >= 0),
  max_retries integer not null default 3 check (max_retries >= 0),
  concurrency_lock_id text,
  approval_request_id uuid references public.ai_approval_requests(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, plan_id) references public.orchestration_plans(organization_id, id) on delete cascade
);

create index if not exists orchestration_tasks_plan_idx
  on public.orchestration_tasks (plan_id, status);

create index if not exists orchestration_tasks_agent_idx
  on public.orchestration_tasks (organization_id, assigned_agent_key, status);

create index if not exists orchestration_tasks_queue_idx
  on public.orchestration_tasks (status, priority, created_at)
  where status in ('pending', 'queued', 'retrying');

-- ============================================================================
-- 4. orchestration_task_dependencies: directed DAG dependencies
-- ============================================================================

create table if not exists public.orchestration_task_dependencies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid not null references public.orchestration_tasks(id) on delete cascade,
  depends_on_task_id uuid not null references public.orchestration_tasks(id) on delete cascade,
  dependency_type text not null default 'finish_to_start' check (dependency_type in ('finish_to_start', 'data_pass')),
  created_at timestamptz not null default now(),
  unique (task_id, depends_on_task_id),
  foreign key (organization_id, task_id) references public.orchestration_tasks(organization_id, id) on delete cascade,
  foreign key (organization_id, depends_on_task_id) references public.orchestration_tasks(organization_id, id) on delete cascade
);

create index if not exists orchestration_task_dep_lookup_idx
  on public.orchestration_task_dependencies (depends_on_task_id, task_id);

-- ============================================================================
-- 5. orchestration_handoffs: multi-agent delegation & contextual handoff
-- ============================================================================

create table if not exists public.orchestration_handoffs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan_id uuid not null references public.orchestration_plans(id) on delete cascade,
  source_task_id uuid references public.orchestration_tasks(id) on delete set null,
  destination_task_id uuid references public.orchestration_tasks(id) on delete set null,
  source_agent_key text not null,
  destination_agent_key text not null,
  handoff_purpose text not null,
  shared_context jsonb not null default '{}'::jsonb,
  expected_output_format text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'completed', 'rejected')),
  created_at timestamptz not null default now(),
  foreign key (organization_id, plan_id) references public.orchestration_plans(organization_id, id) on delete cascade,
  foreign key (organization_id, source_task_id) references public.orchestration_tasks(organization_id, id) on delete set null,
  foreign key (organization_id, destination_task_id) references public.orchestration_tasks(organization_id, id) on delete set null
);

create index if not exists orchestration_handoffs_plan_idx
  on public.orchestration_handoffs (plan_id, status);

-- ============================================================================
-- 6. business_memories: tenant-isolated operational knowledge & business rules
-- ============================================================================

create table if not exists public.business_memories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category text not null check (category in (
    'business_profile', 'business_policy', 'customer_insight',
    'project_context', 'operational_fact', 'learned_rule'
  )),
  title text not null,
  content text not null,
  source_attribution text not null,
  confidence numeric(4,3) not null default 1.0 check (confidence >= 0 and confidence <= 1),
  is_verified boolean not null default true,
  verified_by uuid references auth.users(id) on delete set null,
  tags text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_memories_org_cat_idx
  on public.business_memories (organization_id, category);

-- ============================================================================
-- 7. connector_definitions: integrations & authorized external tools
-- ============================================================================

create table if not exists public.connector_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider_key text not null check (provider_key in (
    'whatsapp', 'meta', 'instagram', 'facebook', 'telnyx', 'twilio',
    'smtp_email', 'stripe', 'lemonsqueezy', 'crm_internal', 'webhook_custom'
  )),
  display_name text not null,
  status text not null default 'active' check (status in ('active', 'degraded', 'offline', 'error')),
  auth_config jsonb not null default '{}'::jsonb,
  rate_limits jsonb not null default '{"rpm": 60, "tpm": 100000}'::jsonb,
  health_status jsonb not null default '{"healthy": true, "last_checked": null}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider_key)
);

create index if not exists connector_definitions_org_idx
  on public.connector_definitions (organization_id, status);

-- ============================================================================
-- 8. connector_execution_logs: audit trail of connector tool runs
-- ============================================================================

create table if not exists public.connector_execution_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connector_id uuid references public.connector_definitions(id) on delete set null,
  task_id uuid references public.orchestration_tasks(id) on delete set null,
  operation text not null,
  status text not null check (status in ('success', 'failed', 'retried', 'rate_limited')),
  request_meta jsonb not null default '{}'::jsonb,
  response_meta jsonb not null default '{}'::jsonb,
  error_message text,
  duration_ms integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists connector_logs_org_task_idx
  on public.connector_execution_logs (organization_id, task_id);

-- ============================================================================
-- 9. orchestration_workflows: event-triggered and recurring operations
-- ============================================================================

create table if not exists public.orchestration_workflows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  description text,
  trigger_type text not null check (trigger_type in (
    'scheduled', 'event_crm_lead_created', 'event_message_received',
    'event_quote_requested', 'manual'
  )),
  trigger_config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  objective_template text not null,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orchestration_workflows_org_idx
  on public.orchestration_workflows (organization_id, is_active, trigger_type);

-- ============================================================================
-- 10. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

alter table public.agent_definitions enable row level security;
alter table public.orchestration_plans enable row level security;
alter table public.orchestration_tasks enable row level security;
alter table public.orchestration_task_dependencies enable row level security;
alter table public.orchestration_handoffs enable row level security;
alter table public.business_memories enable row level security;
alter table public.connector_definitions enable row level security;
alter table public.connector_execution_logs enable row level security;
alter table public.orchestration_workflows enable row level security;

-- agent_definitions
drop policy if exists "members can read agent definitions" on public.agent_definitions;
create policy "members can read agent definitions"
  on public.agent_definitions for select
  using (public.is_org_member(organization_id));

drop policy if exists "sales and admins can manage agent definitions" on public.agent_definitions;
create policy "sales and admins can manage agent definitions"
  on public.agent_definitions for all
  using (public.has_org_role(organization_id, array['owner', 'admin', 'sales']))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'sales']));

-- orchestration_plans
drop policy if exists "members can read orchestration plans" on public.orchestration_plans;
create policy "members can read orchestration plans"
  on public.orchestration_plans for select
  using (public.is_org_member(organization_id));

drop policy if exists "sales and admins can manage orchestration plans" on public.orchestration_plans;
create policy "sales and admins can manage orchestration plans"
  on public.orchestration_plans for all
  using (public.has_org_role(organization_id, array['owner', 'admin', 'sales']))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'sales']));

-- orchestration_tasks
drop policy if exists "members can read orchestration tasks" on public.orchestration_tasks;
create policy "members can read orchestration tasks"
  on public.orchestration_tasks for select
  using (public.is_org_member(organization_id));

drop policy if exists "sales and admins can manage orchestration tasks" on public.orchestration_tasks;
create policy "sales and admins can manage orchestration tasks"
  on public.orchestration_tasks for all
  using (public.has_org_role(organization_id, array['owner', 'admin', 'sales']))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'sales']));

-- orchestration_task_dependencies
drop policy if exists "members can read orchestration task dependencies" on public.orchestration_task_dependencies;
create policy "members can read orchestration task dependencies"
  on public.orchestration_task_dependencies for select
  using (public.is_org_member(organization_id));

drop policy if exists "sales and admins can manage orchestration task dependencies" on public.orchestration_task_dependencies;
create policy "sales and admins can manage orchestration task dependencies"
  on public.orchestration_task_dependencies for all
  using (public.has_org_role(organization_id, array['owner', 'admin', 'sales']))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'sales']));

-- orchestration_handoffs
drop policy if exists "members can read orchestration handoffs" on public.orchestration_handoffs;
create policy "members can read orchestration handoffs"
  on public.orchestration_handoffs for select
  using (public.is_org_member(organization_id));

drop policy if exists "sales and admins can manage orchestration handoffs" on public.orchestration_handoffs;
create policy "sales and admins can manage orchestration handoffs"
  on public.orchestration_handoffs for all
  using (public.has_org_role(organization_id, array['owner', 'admin', 'sales']))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'sales']));

-- business_memories
drop policy if exists "members can read business memories" on public.business_memories;
create policy "members can read business memories"
  on public.business_memories for select
  using (public.is_org_member(organization_id));

drop policy if exists "sales and admins can manage business memories" on public.business_memories;
create policy "sales and admins can manage business memories"
  on public.business_memories for all
  using (public.has_org_role(organization_id, array['owner', 'admin', 'sales']))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'sales']));

-- connector_definitions
drop policy if exists "members can read connector definitions" on public.connector_definitions;
create policy "members can read connector definitions"
  on public.connector_definitions for select
  using (public.is_org_member(organization_id));

drop policy if exists "sales and admins can manage connector definitions" on public.connector_definitions;
create policy "sales and admins can manage connector definitions"
  on public.connector_definitions for all
  using (public.has_org_role(organization_id, array['owner', 'admin', 'sales']))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'sales']));

-- connector_execution_logs
drop policy if exists "members can read connector execution logs" on public.connector_execution_logs;
create policy "members can read connector execution logs"
  on public.connector_execution_logs for select
  using (public.is_org_member(organization_id));

drop policy if exists "sales and admins can manage connector execution logs" on public.connector_execution_logs;
create policy "sales and admins can manage connector execution logs"
  on public.connector_execution_logs for all
  using (public.has_org_role(organization_id, array['owner', 'admin', 'sales']))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'sales']));

-- orchestration_workflows
drop policy if exists "members can read orchestration workflows" on public.orchestration_workflows;
create policy "members can read orchestration workflows"
  on public.orchestration_workflows for select
  using (public.is_org_member(organization_id));

drop policy if exists "sales and admins can manage orchestration workflows" on public.orchestration_workflows;
create policy "sales and admins can manage orchestration workflows"
  on public.orchestration_workflows for all
  using (public.has_org_role(organization_id, array['owner', 'admin', 'sales']))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'sales']));

-- Grants
grant all on table public.agent_definitions to authenticated, service_role;
grant all on table public.orchestration_plans to authenticated, service_role;
grant all on table public.orchestration_tasks to authenticated, service_role;
grant all on table public.orchestration_task_dependencies to authenticated, service_role;
grant all on table public.orchestration_handoffs to authenticated, service_role;
grant all on table public.business_memories to authenticated, service_role;
grant all on table public.connector_definitions to authenticated, service_role;
grant all on table public.connector_execution_logs to authenticated, service_role;
grant all on table public.orchestration_workflows to authenticated, service_role;

-- ============================================================================
-- 11. updated_at triggers
-- ============================================================================

drop trigger if exists set_agent_definitions_updated_at on public.agent_definitions;
create trigger set_agent_definitions_updated_at
  before update on public.agent_definitions
  for each row execute function public.set_updated_at();

drop trigger if exists set_orchestration_plans_updated_at on public.orchestration_plans;
create trigger set_orchestration_plans_updated_at
  before update on public.orchestration_plans
  for each row execute function public.set_updated_at();

drop trigger if exists set_orchestration_tasks_updated_at on public.orchestration_tasks;
create trigger set_orchestration_tasks_updated_at
  before update on public.orchestration_tasks
  for each row execute function public.set_updated_at();

drop trigger if exists set_business_memories_updated_at on public.business_memories;
create trigger set_business_memories_updated_at
  before update on public.business_memories
  for each row execute function public.set_updated_at();

drop trigger if exists set_connector_definitions_updated_at on public.connector_definitions;
create trigger set_connector_definitions_updated_at
  before update on public.connector_definitions
  for each row execute function public.set_updated_at();

drop trigger if exists set_orchestration_workflows_updated_at on public.orchestration_workflows;
create trigger set_orchestration_workflows_updated_at
  before update on public.orchestration_workflows
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 12. Register deployment migration
-- ============================================================================

insert into public.deployment_migrations(version, name)
values ('0066', 'orchestration_maestro_foundation')
on conflict(version) do update set name = excluded.name;
