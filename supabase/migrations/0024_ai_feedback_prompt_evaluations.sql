-- AI feedback, prompt/model traceability and evaluation evidence.

alter table public.ai_runs
  add column if not exists prompt_version text,
  add column if not exists output_schema_version text;

create table if not exists public.ai_run_feedback (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid not null references public.ai_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating text not null check (rating in ('helpful','not_helpful')),
  reason_code text check (reason_code is null or reason_code in ('accurate','actionable','clear','incorrect','unsupported','unsafe','not_relevant','other')),
  comment text check (comment is null or char_length(comment) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, user_id)
);

create index if not exists ai_run_feedback_org_created_idx
  on public.ai_run_feedback (organization_id, created_at desc);

alter table public.ai_run_feedback enable row level security;

create policy ai_feedback_select_member on public.ai_run_feedback
for select to authenticated
using (public.is_org_member(organization_id));

create policy ai_feedback_insert_member on public.ai_run_feedback
for insert to authenticated
with check (
  user_id = auth.uid()
  and public.is_org_member(organization_id)
  and exists (
    select 1 from public.ai_runs r
    where r.id = run_id
      and r.organization_id = organization_id
      and r.status = 'completed'
  )
);

create policy ai_feedback_update_owner on public.ai_run_feedback
for update to authenticated
using (user_id = auth.uid() and public.is_org_member(organization_id))
with check (user_id = auth.uid() and public.is_org_member(organization_id));

create table if not exists public.ai_evaluation_runs (
  id uuid primary key default gen_random_uuid(),
  suite_key text not null,
  prompt_version text not null,
  model text,
  total_cases integer not null check (total_cases >= 0),
  passed_cases integer not null check (passed_cases >= 0 and passed_cases <= total_cases),
  score numeric(6,5) not null check (score >= 0 and score <= 1),
  status text not null check (status in ('passed','failed')),
  commit_sha text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.ai_evaluation_runs enable row level security;

create policy ai_eval_select_admin on public.ai_evaluation_runs
for select to authenticated
using (
  exists (
    select 1 from public.organization_members m
    where m.user_id = auth.uid() and m.role in ('owner','admin')
  )
);

-- Evaluation writes are CI/service-role only.
revoke all on table public.ai_evaluation_runs from anon, authenticated;
grant select on table public.ai_evaluation_runs to authenticated;
grant all on table public.ai_evaluation_runs to service_role;
