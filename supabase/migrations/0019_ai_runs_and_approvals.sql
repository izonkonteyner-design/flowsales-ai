-- 0019_ai_runs_and_approvals.sql
-- FlowSales AI: AI Sales Agent run records and approval workflow.
--
-- Strategy: extend the existing `ai_usage_events` table in-place so the
-- current usage-tracking RPCs (reserve_quote_ai_usage / finalize_quote_ai_usage)
-- keep working unchanged. New nullable columns are added so legacy rows stay
-- valid. Then create a new `ai_approvals` table that stores user-approved /
-- rejected AI-proposed mutations with idempotent execution state.

-- ============================================================================
-- 1. Extend ai_usage_events -> general AI run record
-- ============================================================================

-- Allow any feature string (was: only 'quote_draft'). Legacy rows keep 'quote_draft'.
alter table public.ai_usage_events
  drop constraint if exists ai_usage_events_feature_check;

alter table public.ai_usage_events
  add constraint ai_usage_events_feature_check
  check (feature in ('quote_draft', 'sales_agent', 'manager_brief'));

-- Per-run target entity (lead/customer/quote). Both nullable for legacy rows.
alter table public.ai_usage_events
  add column if not exists target_lead_id    uuid references public.leads(id)    on delete set null,
  add column if not exists target_customer_id uuid references public.contacts(id) on delete set null,
  add column if not exists target_quote_id   uuid references public.quotes(id)   on delete set null;

-- Lifecycle timestamps (kept nullable so legacy pending/succeeded/failed rows remain valid).
alter table public.ai_usage_events
  add column if not exists started_at   timestamptz,
  add column if not exists completed_at timestamptz;

-- Structured output + validation state. `output` is JSONB (validated by app).
-- `validation_status` distinguishes provider errors from schema-validation errors.
alter table public.ai_usage_events
  add column if not exists output            jsonb,
  add column if not exists validation_status text
    check (validation_status in ('valid', 'invalid', 'error')),
  add column if not exists error_category    text,
  add column if not exists error_message     text;

-- Provider/model provenance (provider already constrained to 'gemini').
-- `prompt_version` and `context_version` let us invalidate stale cached outputs.
alter table public.ai_usage_events
  add column if not exists prompt_version  text,
  add column if not exists context_version text;

-- Safe cost metadata only. No raw prompt text, secrets, headers, or PII.
-- `token_total` is an opaque integer; we never log per-token content.
alter table public.ai_usage_events
  add column if not exists token_total    integer,
  add column if not exists cost_estimate  numeric(12,6);

create index if not exists ai_usage_events_target_lead_idx
  on public.ai_usage_events (organization_id, target_lead_id, created_at desc)
  where target_lead_id is not null;

create index if not exists ai_usage_events_target_customer_idx
  on public.ai_usage_events (organization_id, target_customer_id, created_at desc)
  where target_customer_id is not null;

create index if not exists ai_usage_events_target_quote_idx
  on public.ai_usage_events (organization_id, target_quote_id, created_at desc)
  where target_quote_id is not null;

-- Existing RLS policy "members can read organization AI usage" already covers the
-- new columns; no policy changes are required.

-- ============================================================================
-- 2. ai_approvals: AI-proposed mutations requiring human approval
-- ============================================================================

create table if not exists public.ai_approvals (
  id              uuid primary key default gen_random_uuid(),

  organization_id uuid not null references public.organizations(id) on delete cascade,
  ai_run_id       uuid not null references public.ai_usage_events(id) on delete cascade,

  requested_by    uuid not null references auth.users(id) on delete restrict,
  reviewed_by     uuid references auth.users(id) on delete set null,

  -- What the AI proposed to do. `payload` is JSONB and MUST be validated by an
  -- action-specific Zod schema on the server before any mutation is executed.
  action_type     text not null check (action_type in (
    'update_lead_stage',
    'update_lead_status',
    'create_next_action',
    'create_quote',
    'create_customer',
    'send_follow_up'
  )),
  payload         jsonb not null default '{}'::jsonb,

  -- Lifecycle: pending -> approved -> executed (or -> rejected / failed / expired).
  status          text not null default 'pending'
                  check (status in ('pending', 'approved', 'rejected', 'executed', 'failed', 'expired')),

  -- Free-form review note from the human approver (sanitized; truncated by app).
  review_note     text,

  -- Idempotency: once executed/failed/expired, this row is terminal.
  -- `execution_idempotency_key` is a server-generated unique token written at
  -- execution time to guarantee at-most-once execution across retries.
  idempotency_key text unique,

  requested_at    timestamptz not null default now(),
  reviewed_at     timestamptz,
  executed_at     timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists ai_approvals_organization_status_idx
  on public.ai_approvals (organization_id, status, requested_at desc);

create index if not exists ai_approvals_organization_run_idx
  on public.ai_approvals (organization_id, ai_run_id, requested_at desc);

create index if not exists ai_approvals_requested_by_idx
  on public.ai_approvals (organization_id, requested_by, requested_at desc);

create index if not exists ai_approvals_idempotency_key_idx
  on public.ai_approvals (idempotency_key)
  where idempotency_key is not null;

drop trigger if exists set_ai_approvals_updated_at on public.ai_approvals;
create trigger set_ai_approvals_updated_at
  before update on public.ai_approvals
  for each row execute function public.set_updated_at();

alter table public.ai_approvals enable row level security;

-- Members of the org can read approvals in their workspace.
create policy "members can read organization approvals"
  on public.ai_approvals for select
  using (public.is_org_member(organization_id));

-- Only owner/admin/sales can create approval requests (they are tied to an AI run
-- they themselves triggered; the requesting user is enforced server-side).
create policy "sales and admins can create approvals"
  on public.ai_approvals for insert
  with check (
    public.has_org_role(organization_id, array['owner', 'admin', 'sales'])
    and requested_by = auth.uid()
  );

-- Only owner/admin/sales can review (approve/reject). Demo read-only viewers cannot.
-- Execution status changes also flow through update; the execution layer re-verifies
-- the reviewer via RPC + service role, not this policy alone.
create policy "sales and admins can update approvals"
  on public.ai_approvals for update
  using (public.has_org_role(organization_id, array['owner', 'admin', 'sales']))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'sales']));

-- No delete policy: approvals are an immutable audit trail. Deletion only via
-- cascade from the parent org/ai_run row.

-- ============================================================================
-- 3. RPC: claim approval for execution (idempotent, role-checked)
-- ============================================================================
-- Atomically transitions a pending approval to "approved" state and writes a
-- server-generated idempotency key, OR returns the existing key if the same
-- approval was already claimed. Guarantees at-most-once execution under retry.
-- Returns: { idempotency_key text, already_approved boolean }.

create or replace function public.claim_ai_approval_execution(
  p_approval_id uuid,
  p_reviewer_id uuid,
  p_review_note text default null
)
returns table (
  idempotency_key text,
  already_approved boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id     uuid;
  v_status     text;
  v_existing   text;
  v_new_key    text;
  v_note       text := nullif(trim(coalesce(p_review_note, '')), '');
begin
  if p_reviewer_id is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  -- Lock the row for the duration of the transaction.
  select organization_id, status, idempotency_key
    into v_org_id,      v_status, v_existing
  from public.ai_approvals
  where id = p_approval_id
  for update;

  if not found then
    raise exception 'Approval not found.' using errcode = 'P0002';
  end if;

  -- Re-check role server-side (defense in depth; UI/RPC client cannot escalate).
  if not public.has_org_role(v_org_id, array['owner', 'admin', 'sales']) then
    raise exception 'Workspace approval permission required.' using errcode = '42501';
  end if;

  -- Only the pending state can be approved. Already-approved -> return existing key.
  if v_status = 'approved' then
    return next (v_existing, true);
    return;
  end if;

  if v_status <> 'pending' then
    raise exception 'Approval is not pending.' using errcode = '55006';
  end if;

  v_new_key := encode(gen_random_bytes(24), 'hex');

  update public.ai_approvals
    set status          = 'approved',
        reviewed_by     = p_reviewer_id,
        review_note     = coalesce(v_note, review_note),
        reviewed_at     = now(),
        idempotency_key = v_new_key,
        updated_at      = now()
  where id = p_approval_id;

  return next (v_new_key, false);
  return;
end;
$$;

revoke all on function public.claim_ai_approval_execution(uuid, uuid, text) from public;
grant execute on function public.claim_ai_approval_execution(uuid, uuid, text) to authenticated;

-- ============================================================================
-- 4. RPC: mark approval execution outcome (executed / failed)
-- ============================================================================
-- Called by the execution layer AFTER the downstream mutation succeeds or fails.
-- Idempotent: a row already in a terminal execution state returns the existing
-- outcome without error so that browser/network retries are safe.

create or replace function public.finalize_ai_approval_execution(
  p_approval_id      uuid,
  p_outcome          text,           -- 'executed' | 'failed'
  p_execution_error  text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if p_outcome not in ('executed', 'failed') then
    raise exception 'Invalid approval outcome.' using errcode = '22023';
  end if;

  select status into v_status
  from public.ai_approvals
  where id = p_approval_id
  for update;

  if not found then
    raise exception 'Approval not found.' using errcode = 'P0002';
  end if;

  -- Already terminal -> no-op (idempotent).
  if v_status in ('executed', 'failed') then
    return;
  end if;

  -- Only an approved row can be finalized. Pending/rejected/expired cannot.
  if v_status <> 'approved' then
    raise exception 'Approval must be approved before execution.' using errcode = '55006';
  end if;

  update public.ai_approvals
    set status        = p_outcome,
        executed_at   = case when p_outcome = 'executed' then now() else executed_at end,
        review_note   = coalesce(nullif(trim(coalesce(p_execution_error, '')), ''), review_note),
        updated_at    = now()
  where id = p_approval_id;
end;
$$;

revoke all on function public.finalize_ai_approval_execution(uuid, text, text) from public;
grant execute on function public.finalize_ai_approval_execution(uuid, text, text) to authenticated;

-- ============================================================================
-- 5. RPC: reject approval (idempotent)
-- ============================================================================

create or replace function public.reject_ai_approval(
  p_approval_id  uuid,
  p_reviewer_id  uuid,
  p_review_note  text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_status text;
  v_note   text := nullif(trim(coalesce(p_review_note, '')), '');
begin
  if p_reviewer_id is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  select organization_id, status
    into v_org_id,      v_status
  from public.ai_approvals
  where id = p_approval_id
  for update;

  if not found then
    raise exception 'Approval not found.' using errcode = 'P0002';
  end if;

  if not public.has_org_role(v_org_id, array['owner', 'admin', 'sales']) then
    raise exception 'Workspace approval permission required.' using errcode = '42501';
  end if;

  -- Idempotent: already rejected -> no-op.
  if v_status = 'rejected' then
    return;
  end if;

  -- Only pending (and already-approved, before execution) can be rejected.
  if v_status not in ('pending', 'approved') then
    raise exception 'Approval cannot be rejected.' using errcode = '55006';
  end if;

  update public.ai_approvals
    set status      = 'rejected',
        reviewed_by = p_reviewer_id,
        review_note = coalesce(v_note, review_note),
        reviewed_at = now(),
        updated_at  = now()
  where id = p_approval_id;
end;
$$;

revoke all on function public.reject_ai_approval(uuid, uuid, text) from public;
grant execute on function public.reject_ai_approval(uuid, uuid, text) to authenticated;

-- ============================================================================
-- Rollback notes
-- ============================================================================
-- To revert this migration cleanly:
--   drop function public.reject_ai_approval(uuid, uuid, text);
--   drop function public.finalize_ai_approval_execution(uuid, text, text);
--   drop function public.claim_ai_approval_execution(uuid, uuid, text);
--   drop table if exists public.ai_approvals;
--   alter table public.ai_usage_events
--     drop column if exists target_lead_id,
--     drop column if exists target_customer_id,
--     drop column if exists target_quote_id,
--     drop column if exists started_at,
--     drop column if exists completed_at,
--     drop column if exists output,
--     drop column if exists validation_status,
--     drop column if exists error_category,
--     drop column if exists error_message,
--     drop column if exists prompt_version,
--     drop column if exists context_version,
--     drop column if exists token_total,
--     drop column if exists cost_estimate;
--   alter table public.ai_usage_events
--     drop constraint if exists ai_usage_events_feature_check,
--     add constraint ai_usage_events_feature_check check (feature = 'quote_draft');
