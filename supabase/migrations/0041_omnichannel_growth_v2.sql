-- 0041_omnichannel_growth_v2.sql
-- Instagram/Messenger growth layer, AI conversation intelligence, and human-approved follow-up engine.

create table if not exists public.conversation_intelligence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  intent text not null default 'unknown',
  qualification_score integer not null default 0 check (qualification_score between 0 and 100),
  confidence numeric(4,3) not null default 0 check (confidence between 0 and 1),
  urgency text not null default 'normal' check (urgency in ('low','normal','high','critical')),
  next_best_action text not null,
  rationale text,
  signals jsonb not null default '[]'::jsonb,
  model text,
  prompt_version text,
  generated_by uuid references auth.users(id) on delete set null,
  generated_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_status text not null default 'suggested' check (review_status in ('suggested','accepted','edited','dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversation_intelligence_conversation_unique unique (conversation_id)
);

alter table public.conversation_intelligence enable row level security;
create index if not exists conversation_intelligence_org_score_idx on public.conversation_intelligence (organization_id, qualification_score desc, generated_at desc);

create policy "members_read_conversation_intelligence" on public.conversation_intelligence for select
using (exists (select 1 from public.organization_members om where om.organization_id = conversation_intelligence.organization_id and om.user_id = auth.uid()));
create policy "service_role_manage_conversation_intelligence" on public.conversation_intelligence for all
using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create table if not exists public.sales_follow_up_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  name text not null,
  status text not null default 'active' check (status in ('active','paused','completed','cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_follow_up_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan_id uuid not null references public.sales_follow_up_plans(id) on delete cascade,
  step_order integer not null check (step_order > 0),
  action_type text not null check (action_type in ('task','message_draft','call','quote_review')),
  channel text check (channel is null or channel in ('whatsapp','instagram','facebook')),
  due_at timestamptz not null,
  status text not null default 'pending_approval' check (status in ('pending_approval','approved','completed','skipped','cancelled')),
  draft_text text,
  requires_human_approval boolean not null default true,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_follow_up_steps_plan_order_unique unique (plan_id, step_order)
);

alter table public.sales_follow_up_plans enable row level security;
alter table public.sales_follow_up_steps enable row level security;
create index if not exists sales_follow_up_plans_org_status_idx on public.sales_follow_up_plans (organization_id, status, created_at desc);
create index if not exists sales_follow_up_steps_due_idx on public.sales_follow_up_steps (organization_id, status, due_at) where status in ('pending_approval','approved');

create policy "members_read_follow_up_plans" on public.sales_follow_up_plans for select
using (exists (select 1 from public.organization_members om where om.organization_id = sales_follow_up_plans.organization_id and om.user_id = auth.uid()));
create policy "members_read_follow_up_steps" on public.sales_follow_up_steps for select
using (exists (select 1 from public.organization_members om where om.organization_id = sales_follow_up_steps.organization_id and om.user_id = auth.uid()));
create policy "service_role_manage_follow_up_plans" on public.sales_follow_up_plans for all
using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service_role_manage_follow_up_steps" on public.sales_follow_up_steps for all
using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- Meta page/Instagram asset metadata remains non-secret in channel_accounts.metadata;
-- credentials remain encrypted in integration_tokens.
alter table public.channel_accounts add column if not exists parent_external_id text;
alter table public.channel_accounts add column if not exists webhook_subscribed_at timestamptz;
create index if not exists channel_accounts_parent_idx on public.channel_accounts (organization_id, provider, parent_external_id) where parent_external_id is not null;

insert into public.deployment_migrations (version, name)
values ('0041', 'omnichannel_growth_v2')
on conflict (version) do update set name = excluded.name;

do $$
begin
  if not exists (select 1 from public.deployment_migrations where version = '0041') then
    raise exception 'Migration 0041 registration failed';
  end if;
end $$;
