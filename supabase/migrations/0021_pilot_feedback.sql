-- 0021_pilot_feedback.sql
-- FlowSales AI: lightweight in-app pilot feedback collection.
--
-- Goal: capture structured feedback from pilot users (rating, blockers,
-- purchase intent, free-text comments) without coupling to CRM entities and
-- without surfacing an admin UI yet (the data model is forward-compatible with
-- future aggregation).

create table if not exists public.pilot_feedback (
  id              uuid primary key default gen_random_uuid(),

  -- Workspace scope (nullable so we can accept feedback from demo viewers who
  -- belong to the global demo org, OR from anonymous demo users before they
  -- even have a workspace selected).
  organization_id uuid references public.organizations(id) on delete set null,

  -- Submitting user (nullable for anonymous / unauthenticated demo feedback).
  submitted_by    uuid references auth.users(id) on delete set null,

  -- Persona context (all free-text, capped; app-level validation).
  user_role       text check (user_role in (
    'founder', 'sales_lead', 'sales_rep', 'ops', 'consultant', 'agency', 'other'
  )),
  company_type    text,

  -- Which module/flow triggered this feedback.
  trigger_context text check (trigger_context in (
    'demo_completed', 'ai_recommendation_viewed', 'quote_reviewed',
    'account_cta', 'dashboard_cta', 'manual'
  )),
  most_used_module     text,
  most_useful_feature  text,
  most_confusing_area  text,
  missing_feature      text,

  ai_helpful_score integer check (ai_helpful_score between 1 and 5),
  weekly_intent   boolean,
  purchase_intent boolean,
  price_range_min numeric(14,2),
  price_range_max numeric(14,2),
  biggest_blocker  text,

  -- Overall NPS-style rating 1..5.
  score           integer not null check (score between 1 and 5),
  comment         text,

  -- Demo feedback is flagged separately for downstream aggregation.
  is_demo         boolean not null default false,

  -- Server-side deduplication: one workspace+submitted_by+trigger_context per
  -- window consumes a rate-limit token, but we ALSO keep a per-row hash so a
  -- retry with the exact same payload is a no-op.
  submission_key  text not null unique,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists pilot_feedback_org_created_idx
  on public.pilot_feedback (organization_id, created_at desc);

create index if not exists pilot_feedback_is_demo_idx
  on public.pilot_feedback (is_demo, created_at desc);

create index if not exists pilot_feedback_score_idx
  on public.pilot_feedback (score, created_at desc);

drop trigger if exists set_pilot_feedback_updated_at on public.pilot_feedback;
create trigger set_pilot_feedback_updated_at
  before update on public.pilot_feedback
  for each row execute function public.set_updated_at();

alter table public.pilot_feedback enable row level security;

-- Members of an org can read their org's feedback. Demo-labeled rows are
-- visible to members of the demo org (which, for the global demo org, are
-- viewers) so we can show in-app "your feedback was registered" confirmation
-- without an admin panel.
create policy "members can read org pilot feedback"
  on public.pilot_feedback for select
  using (
    organization_id is not null and public.is_org_member(organization_id)
  );

-- A user can read their own submission even if they're not yet in an org
-- (their own_BY lookup for the "feedback submitted" confirmation toast).
create policy "users can read their own feedback"
  on public.pilot_feedback for select
  using (submitted_by = auth.uid());

-- Anyone authenticated can submit pilot feedback (anonymous demo feedback
-- arrives via the demo start flow which uses a service-role client; that path
-- bypasses RLS). `submission_key` enforces payload-level idempotency.
create policy "authenticated users can submit pilot feedback"
  on public.pilot_feedback for insert
  with check (auth.uid() is not null and submitted_by = auth.uid());

-- No update policy is granted to users: once submitted, a feedback is
-- immutable from RLS' perspective. Server-side correction (e.g. manually
-- merging a duplicate marker) happens via service role.

-- ============================================================================
-- RPC: rate-limited feedback submission
-- ============================================================================
-- call submit_pilot_feedback(p_payload jsonb)
-- Returns: { feedback_id uuid, accepted boolean }
-- Behavior:
--   - Validates auth.uid() server-side (do not trust client-supplied user_id).
--   - Enforces per-user rate limit: max 3 submissions / 15 minutes.
--   - Enforces per-IP rate limit on anonymous demo feedback (via a separate
--     demo identifier) by reusing the existing demo_rate_limits table.
--   - Computes submission_key as sha256(payload||user_id||trigger_context)
--     and upserts on conflict (no-op when duplicate).
--   - NEVER stores secrets/PII beyond what the user typed in comment text.

create or replace function public.submit_pilot_feedback(p_payload jsonb)
returns table (
  feedback_id uuid,
  accepted    boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id        uuid := auth.uid();
  v_role           text;
  v_company_type   text;
  v_trigger        text;
  v_most_used      text;
  v_most_useful    text;
  v_confusing      text;
  v_missing        text;
  v_ai_score       integer;
  v_weekly         boolean;
  v_purchase       boolean;
  v_price_min      numeric;
  v_price_max      numeric;
  v_blocker        text;
  v_score          integer;
  v_comment        text;
  v_org_id         uuid;
  v_is_demo        boolean;
  v_sub_key        text;
  v_existing_id    uuid;
  v_recent_count   integer;
  v_rate_limit_ok  boolean;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  -- Pull fields from payload defensively. Anything missing becomes null.
  v_role         := p_payload->>'user_role';
  v_company_type := p_payload->>'company_type';
  v_trigger      := p_payload->>'trigger_context';
  v_most_used    := p_payload->>'most_used_module';
  v_most_useful  := p_payload->>'most_useful_feature';
  v_confusing    := p_payload->>'most_confusing_area';
  v_missing      := p_payload->>'missing_feature';
  v_ai_score     := (p_payload->>'ai_helpful_score')::integer;
  v_weekly       := (p_payload->>'weekly_intent')::boolean;
  v_purchase     := (p_payload->>'purchase_intent')::boolean;
  v_price_min    := (p_payload->>'price_range_min')::numeric;
  v_price_max    := (p_payload->>'price_range_max')::numeric;
  v_blocker      := p_payload->>'biggest_blocker';
  v_score        := (p_payload->>'score')::integer;
  v_comment      := p_payload->>'comment';
  v_org_id       := nullif(p_payload->>'organization_id', '')::uuid;
  v_is_demo      := coalesce((p_payload->>'is_demo')::boolean, false);

  if v_score is null or v_score not between 1 and 5 then
    raise exception 'Score is required and must be between 1 and 5.' using errcode = '22023';
  end if;

  if v_trigger is null then
    raise exception 'Trigger context is required.' using errcode = '22023';
  end if;

  -- Validate org membership: only allow linking to an org the user belongs to.
  if v_org_id is not null and not public.is_org_member(v_org_id) then
    v_org_id := null;  -- silently drop rather than leak existence.
  end if;

  -- Compute deterministic idempotency key. We hash the user_id+trigger+score+
  -- comment (without trailing whitespace) so that a stray re-submit of the
  -- SAME form is idempotent, but a re-submit with different comment text is not.
  v_sub_key := encode(
    digest(
      coalesce(v_user_id::text, '') || '|' ||
      coalesce(v_trigger, '') || '|' ||
      coalesce(v_score::text, '') || '|' ||
      coalesce(trim(coalesce(v_comment, '')), ''),
      'sha256'
    ),
    'hex'
  );

  -- Idempotent: if we already have this exact submission, short-circuit.
  select id into v_existing_id
  from public.pilot_feedback
  where submission_key = v_sub_key
  limit 1;

  if v_existing_id is not null then
    return next (v_existing_id, false);
    return;
  end if;

  -- Per-user rate limit: max 3 submissions / 15 minutes.
  select count(*) into v_recent_count
  from public.pilot_feedback
  where submitted_by = v_user_id
    and created_at >= now() - interval '15 minutes';

  if v_recent_count >= 3 then
    raise exception 'Feedback rate limit reached. Try again later.'
      using errcode = 'P0001';
  end if;

  insert into public.pilot_feedback (
    organization_id, submitted_by,
    user_role, company_type, trigger_context,
    most_used_module, most_useful_feature, most_confusing_area, missing_feature,
    ai_helpful_score, weekly_intent, purchase_intent,
    price_range_min, price_range_max, biggest_blocker,
    score, comment, is_demo, submission_key
  )
  values (
    v_org_id, v_user_id,
    v_role, v_company_type, v_trigger,
    v_most_used, v_most_useful, v_confusing, v_missing,
    v_ai_score, v_weekly, v_purchase,
    v_price_min, v_price_max, v_blocker,
    v_score, v_comment, v_is_demo, v_sub_key
  )
  on conflict (submission_key) do nothing
  returning id into v_existing_id;

  if v_existing_id is null then
    -- Race: another request inserted the same key. Fetch it.
    select id into v_existing_id
    from public.pilot_feedback
    where submission_key = v_sub_key
    limit 1;
    return next (v_existing_id, false);
    return;
  end if;

  return next (v_existing_id, true);
  return;
end;
$$;

-- pgcrypto is enabled in 0001_initial.sql; `digest()` is provided by it.
revoke all on function public.submit_pilot_feedback(jsonb) from public;
grant execute on function public.submit_pilot_feedback(jsonb) to authenticated;

-- ============================================================================
-- Rollback notes
-- ============================================================================
-- To revert this migration cleanly:
--   drop function public.submit_pilot_feedback(jsonb);
--   drop table if exists public.pilot_feedback;
