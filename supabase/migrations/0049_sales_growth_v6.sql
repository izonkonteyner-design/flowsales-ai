-- 0049_sales_growth_v6.sql
-- SLA, routing, data quality, approvals, forecast snapshots and growth opportunities.

alter table public.products
  add column if not exists unit_cost numeric(14,2) check (unit_cost is null or unit_cost >= 0);

alter table public.quote_items
  add column if not exists cost_snapshot numeric(14,2) check (cost_snapshot is null or cost_snapshot >= 0);

create table if not exists public.sales_sla_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  lead_status text,
  priority text,
  first_response_minutes integer not null default 60 check (first_response_minutes > 0),
  follow_up_minutes integer not null default 1440 check (follow_up_minutes > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.sales_sla_policies enable row level security;
create policy "members_read_sales_sla_policies" on public.sales_sla_policies for select using (public.is_org_member(organization_id));
create policy "admins_manage_sales_sla_policies" on public.sales_sla_policies for all using (public.has_org_role(organization_id,array['owner','admin'])) with check (public.has_org_role(organization_id,array['owner','admin']));

create table if not exists public.sales_routing_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  source text,
  city text,
  min_estimated_value numeric(14,2),
  target_user_id uuid references auth.users(id) on delete set null,
  priority integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.sales_routing_rules enable row level security;
create policy "members_read_sales_routing_rules" on public.sales_routing_rules for select using (public.is_org_member(organization_id));
create policy "admins_manage_sales_routing_rules" on public.sales_routing_rules for all using (public.has_org_role(organization_id,array['owner','admin'])) with check (public.has_org_role(organization_id,array['owner','admin']));

create table if not exists public.quote_discount_approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  discount_percent numeric(7,3) not null check (discount_percent >= 0 and discount_percent <= 100),
  reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists quote_discount_approvals_org_status_idx on public.quote_discount_approvals(organization_id,status,created_at desc);
alter table public.quote_discount_approvals enable row level security;
create policy "members_read_quote_discount_approvals" on public.quote_discount_approvals for select using (public.is_org_member(organization_id));
create policy "sales_request_quote_discount_approvals" on public.quote_discount_approvals for insert with check (public.has_org_role(organization_id,array['owner','admin','sales']));
create policy "admins_decide_quote_discount_approvals" on public.quote_discount_approvals for update using (public.has_org_role(organization_id,array['owner','admin'])) with check (public.has_org_role(organization_id,array['owner','admin']));

create table if not exists public.quote_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  version_number integer not null,
  snapshot jsonb not null,
  change_note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(quote_id,version_number)
);
alter table public.quote_versions enable row level security;
create policy "members_read_quote_versions" on public.quote_versions for select using (public.is_org_member(organization_id));
create policy "sales_manage_quote_versions" on public.quote_versions for all using (public.has_org_role(organization_id,array['owner','admin','sales'])) with check (public.has_org_role(organization_id,array['owner','admin','sales']));

create table if not exists public.sales_growth_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  customer_id uuid references public.contacts(id) on delete cascade,
  opportunity_type text not null check (opportunity_type in ('reactivation','expansion','referral')),
  score integer not null check (score between 0 and 100),
  reason text not null,
  estimated_value numeric(14,2),
  status text not null default 'open' check (status in ('open','actioned','dismissed','converted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sales_growth_opportunities_org_type_idx on public.sales_growth_opportunities(organization_id,opportunity_type,status,score desc);
alter table public.sales_growth_opportunities enable row level security;
create policy "members_read_sales_growth_opportunities" on public.sales_growth_opportunities for select using (public.is_org_member(organization_id));
create policy "sales_manage_sales_growth_opportunities" on public.sales_growth_opportunities for all using (public.has_org_role(organization_id,array['owner','admin','sales'])) with check (public.has_org_role(organization_id,array['owner','admin','sales']));

create table if not exists public.pipeline_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  snapshot_date date not null,
  open_pipeline_value numeric(16,2) not null default 0,
  weighted_pipeline_value numeric(16,2) not null default 0,
  forecast_confidence integer not null default 0 check (forecast_confidence between 0 and 100),
  stage_counts jsonb not null default '{}'::jsonb,
  risk_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(organization_id,snapshot_date)
);
alter table public.pipeline_snapshots enable row level security;
create policy "members_read_pipeline_snapshots" on public.pipeline_snapshots for select using (public.is_org_member(organization_id));
create policy "service_manage_pipeline_snapshots" on public.pipeline_snapshots for all using (auth.role()='service_role') with check (auth.role()='service_role');

insert into public.deployment_migrations(version,name,checksum)
values ('0049','0049_sales_growth_v6.sql','sales-growth-v6-2026-08-11-r2')
on conflict(version) do update set name=excluded.name,checksum=excluded.checksum,executed_at=now();