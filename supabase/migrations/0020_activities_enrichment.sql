-- 0020_activities_enrichment.sql
-- FlowSales AI: extend the existing `activities` table into the unified,
-- reusable activity timeline.
--
-- Strategy: keep the existing `lead_id`, `quote_id`, `type`, `title`, `detail`
-- columns and all existing RLS policies / indexes intact. Add nullable,
-- generalized columns so a single activity row can describe any entity
-- (lead/customer/quote/ai_run/approval) and any actor (user/ai/system),
-- carrying structured metadata when needed.
--
-- The legacy query patterns in leads.ts (`from("activities").eq("lead_id", id)`)
-- continue to work. Detail pages for customers/quotes that currently have no
-- timeline can now query the same table by their respective entity_id.

-- 1. Generic entity reference (alongside existing lead_id/quote_id).
--    `entity_type` constrains what entity_id points at; `entity_id` carries the
--    concrete uuid (lead/customer/quote/ai_run/approval). For lead/quote-linked
--    rows, the dedicated `lead_id`/`quote_id` FK columns SHOULD still be set so
--    cascading deletes work; entity_id is the denormalized join key.
alter table public.activities
  add column if not exists entity_type text
    check (entity_type in ('lead', 'customer', 'quote', 'ai_run', 'approval', 'system')),
  add column if not exists entity_id  uuid;

-- 2. Actor typing: who created the activity (user / AI agent / system).
--    `actor_id` carries auth.users(id) for human/AI-initiated rows, null for system.
alter table public.activities
  add column if not exists actor_type text
    check (actor_type in ('user', 'ai', 'system')),
  add column if not exists actor_id  uuid references auth.users(id) on delete set null;

-- 3. Structured metadata: e.g. {from:'new', to:'contacted'} for status changes,
--    {quoteId, actionType} for approval links, {aiRunId} for AI runs.
--    Sensitive values must never be placed here raw; app code is responsible for
--    sanitization. RLS still scopes visibility to org members only.
alter table public.activities
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- 4. Activity classification (set of well-known types). We do NOT change the
--    existing `type` column (free text used by leads.ts) to avoid breaking
--    legacy rows. We add an optional `activity_type` column carrying the
--    canonical type when the app writes through the new timeline API.
alter table public.activities
  add column if not exists activity_type text
    check (activity_type in (
      'created', 'updated', 'stage_changed', 'status_changed', 'note_added',
      'contact_attempted', 'next_action_created',
      'quote_created', 'quote_status_changed',
      'ai_analysis_completed', 'ai_analysis_failed',
      'approval_requested', 'approval_approved', 'approval_rejected',
      'approval_executed', 'approval_failed',
      'system'
    ));

-- Backfill: derive entity_type/actor_type for existing legacy rows so the
-- unified timeline shows them correctly. `lead_id`/`quote_id` and `created_by`
-- are the only signals we have on historical rows.
update public.activities
  set entity_type = 'lead',
      entity_id   = lead_id,
      activity_type = case type
        when 'lead_created'    then 'created'
        when 'lead_updated'    then 'updated'
        when 'status_changed'  then 'status_changed'
        when 'note_added'       then 'note_added'
        when 'follow_up_scheduled' then 'next_action_created'
        else null
      end
where lead_id is not null
  and entity_type is null;

update public.activities
  set entity_type = 'quote',
      entity_id  = quote_id
where quote_id is not null
  and entity_type is null;

update public.activities
  set actor_type = 'user',
      actor_id  = created_by
where created_by is not null
  and actor_type is null;

update public.activities
  set actor_type = 'system'
where created_by is null
  and actor_type is null;

-- Indexes for the new timeline query patterns.
create index if not exists activities_org_entity_idx
  on public.activities (organization_id, entity_type, entity_id, created_at desc)
  where entity_type is not null and entity_id is not null;

create index if not exists activities_org_actor_idx
  on public.activities (organization_id, actor_type, created_at desc)
  where actor_type is not null;

create index if not exists activities_org_activity_type_idx
  on public.activities (organization_id, activity_type, created_at desc)
  where activity_type is not null;

--ampoline: ensure the JSONB column can be queried efficiently later.
create index if not exists activities_metadata_gin_idx
  on public.activities using gin (metadata)
  where metadata is not null and metadata <> '{}'::jsonb;

-- Existing RLS policies (`members can read` / `sales and admins can manage`)
-- already cover the new columns. No policy change is required.

-- ============================================================================
-- Rollback notes
-- ============================================================================
-- To revert this migration cleanly:
--   alter table public.activities
--     drop column if exists entity_type,
--     drop column if exists entity_id,
--     drop column if exists actor_type,
--     drop column if exists actor_id,
--     drop column if exists metadata,
--     drop column if exists activity_type;
--   drop index if exists public.activities_org_entity_idx;
--   drop index if exists public.activities_org_actor_idx;
--   drop index if exists public.activities_org_activity_type_idx;
--   drop index if exists public.activities_metadata_gin_idx;
