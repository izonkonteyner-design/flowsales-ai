-- FlowSales AI initial schema
create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_org_member(target_org uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = target_org
      and om.user_id = auth.uid()
  );
$$;

create or replace function public.has_org_role(target_org uuid, allowed_roles text[])
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = target_org
      and om.user_id = auth.uid()
      and om.role = any(allowed_roles)
  );
$$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  currency char(3) not null default 'TRY',
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  timezone text not null default 'Europe/Istanbul',
  language text not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'sales', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null,
  company text,
  email text,
  phone text,
  city text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null,
  company text,
  email text,
  phone text,
  city text,
  source text not null default 'Website',
  status text not null check (status in ('new', 'contacted', 'qualified', 'quote_sent', 'negotiation', 'won', 'lost')),
  estimated_value numeric(14,2) not null default 0,
  currency char(3) not null default 'TRY',
  notes text,
  assigned_to uuid references auth.users(id) on delete set null,
  next_follow_up_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  category text not null,
  description text not null,
  base_price numeric(14,2) not null default 0,
  currency char(3) not null default 'TRY',
  tax_rate numeric(5,2) not null default 20,
  unit text not null default 'unit',
  active boolean not null default true,
  specifications jsonb not null default '[]'::jsonb,
  image_url text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  quote_number text not null,
  issue_date date not null,
  expiry_date date not null,
  status text not null check (status in ('draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired')),
  currency char(3) not null default 'TRY',
  notes text,
  payment_terms text,
  delivery_terms text,
  subtotal numeric(14,2) not null default 0,
  discount_total numeric(14,2) not null default 0,
  tax_total numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, quote_number)
);

create table if not exists public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  description text not null,
  quantity numeric(14,2) not null default 1,
  unit_price numeric(14,2) not null default 0,
  discount numeric(5,2) not null default 0,
  tax_rate numeric(5,2) not null default 20,
  line_total numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  quote_id uuid references public.quotes(id) on delete cascade,
  type text not null,
  title text not null,
  detail text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  title text not null,
  due_at timestamptz not null,
  priority text not null check (priority in ('low', 'medium', 'high')),
  assigned_to uuid references auth.users(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'completed')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_agent_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade unique,
  system_prompt text not null default 'Be accurate. Never invent product prices. Ask for missing information before drafting quotes.',
  temperature numeric(3,2) not null default 0.3,
  enable_streaming boolean not null default true,
  require_human_approval boolean not null default true,
  usage_limit integer not null default 500,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  content text not null,
  source_url text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade unique,
  plan text not null check (plan in ('starter', 'pro', 'business')),
  status text not null default 'active',
  seat_limit integer not null default 3,
  ai_message_limit integer not null default 100,
  current_period_start timestamptz,
  current_period_end timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leads_organization_status_idx on public.leads (organization_id, status);
create index if not exists leads_organization_follow_up_idx on public.leads (organization_id, next_follow_up_at);
create index if not exists products_organization_active_idx on public.products (organization_id, active);
create index if not exists quotes_organization_status_idx on public.quotes (organization_id, status);
create index if not exists quote_items_quote_id_idx on public.quote_items (quote_id);
create index if not exists tasks_organization_due_idx on public.tasks (organization_id, due_at);
create index if not exists activities_organization_created_idx on public.activities (organization_id, created_at desc);
create index if not exists organization_members_user_id_idx on public.organization_members (user_id);

drop trigger if exists set_organizations_updated_at on public.organizations;
create trigger set_organizations_updated_at before update on public.organizations for each row execute function public.set_updated_at();

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();

drop trigger if exists set_organization_members_updated_at on public.organization_members;
create trigger set_organization_members_updated_at before update on public.organization_members for each row execute function public.set_updated_at();

drop trigger if exists set_contacts_updated_at on public.contacts;
create trigger set_contacts_updated_at before update on public.contacts for each row execute function public.set_updated_at();

drop trigger if exists set_leads_updated_at on public.leads;
create trigger set_leads_updated_at before update on public.leads for each row execute function public.set_updated_at();

drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at before update on public.products for each row execute function public.set_updated_at();

drop trigger if exists set_quotes_updated_at on public.quotes;
create trigger set_quotes_updated_at before update on public.quotes for each row execute function public.set_updated_at();

drop trigger if exists set_quote_items_updated_at on public.quote_items;
create trigger set_quote_items_updated_at before update on public.quote_items for each row execute function public.set_updated_at();

drop trigger if exists set_activities_updated_at on public.activities;
create trigger set_activities_updated_at before update on public.activities for each row execute function public.set_updated_at();

drop trigger if exists set_tasks_updated_at on public.tasks;
create trigger set_tasks_updated_at before update on public.tasks for each row execute function public.set_updated_at();

drop trigger if exists set_ai_agent_settings_updated_at on public.ai_agent_settings;
create trigger set_ai_agent_settings_updated_at before update on public.ai_agent_settings for each row execute function public.set_updated_at();

drop trigger if exists set_knowledge_documents_updated_at on public.knowledge_documents;
create trigger set_knowledge_documents_updated_at before update on public.knowledge_documents for each row execute function public.set_updated_at();

drop trigger if exists set_subscriptions_updated_at on public.subscriptions;
create trigger set_subscriptions_updated_at before update on public.subscriptions for each row execute function public.set_updated_at();

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.contacts enable row level security;
alter table public.leads enable row level security;
alter table public.products enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
alter table public.activities enable row level security;
alter table public.tasks enable row level security;
alter table public.ai_agent_settings enable row level security;
alter table public.knowledge_documents enable row level security;
alter table public.subscriptions enable row level security;

create policy "members can read their organizations"
on public.organizations for select
using (public.is_org_member(id));

create policy "authenticated users can create organizations"
on public.organizations for insert
with check (auth.uid() is not null);

create policy "owners and admins can update organizations"
on public.organizations for update
using (public.has_org_role(id, array['owner', 'admin']));

create policy "users can read their profile"
on public.profiles for select
using (id = auth.uid());

create policy "users can update their profile"
on public.profiles for update
using (id = auth.uid());

create policy "users can read organization memberships"
on public.organization_members for select
using (public.is_org_member(organization_id));

create policy "owners and admins can manage memberships"
on public.organization_members for all
using (public.has_org_role(organization_id, array['owner', 'admin']))
with check (public.has_org_role(organization_id, array['owner', 'admin']));

create policy "members can read contacts"
on public.contacts for select
using (public.is_org_member(organization_id));

create policy "sales and admins can manage contacts"
on public.contacts for all
using (public.has_org_role(organization_id, array['owner', 'admin', 'sales']))
with check (public.has_org_role(organization_id, array['owner', 'admin', 'sales']));

create policy "members can read leads"
on public.leads for select
using (public.is_org_member(organization_id));

create policy "sales and admins can manage leads"
on public.leads for all
using (public.has_org_role(organization_id, array['owner', 'admin', 'sales']))
with check (public.has_org_role(organization_id, array['owner', 'admin', 'sales']));

create policy "members can read products"
on public.products for select
using (public.is_org_member(organization_id));

create policy "owners and admins can manage products"
on public.products for all
using (public.has_org_role(organization_id, array['owner', 'admin']))
with check (public.has_org_role(organization_id, array['owner', 'admin']));

create policy "members can read quotes"
on public.quotes for select
using (public.is_org_member(organization_id));

create policy "sales and admins can manage quotes"
on public.quotes for all
using (public.has_org_role(organization_id, array['owner', 'admin', 'sales']))
with check (public.has_org_role(organization_id, array['owner', 'admin', 'sales']));

create policy "members can read quote items"
on public.quote_items for select
using (
  exists (
    select 1
    from public.quotes q
    where q.id = quote_items.quote_id
      and public.is_org_member(q.organization_id)
  )
);

create policy "sales and admins can manage quote items"
on public.quote_items for all
using (
  exists (
    select 1
    from public.quotes q
    where q.id = quote_items.quote_id
      and public.has_org_role(q.organization_id, array['owner', 'admin', 'sales'])
  )
)
with check (
  exists (
    select 1
    from public.quotes q
    where q.id = quote_items.quote_id
      and public.has_org_role(q.organization_id, array['owner', 'admin', 'sales'])
  )
);

create policy "members can read activities"
on public.activities for select
using (public.is_org_member(organization_id));

create policy "sales and admins can manage activities"
on public.activities for all
using (public.has_org_role(organization_id, array['owner', 'admin', 'sales']))
with check (public.has_org_role(organization_id, array['owner', 'admin', 'sales']));

create policy "members can read tasks"
on public.tasks for select
using (public.is_org_member(organization_id));

create policy "sales and admins can manage tasks"
on public.tasks for all
using (public.has_org_role(organization_id, array['owner', 'admin', 'sales']))
with check (public.has_org_role(organization_id, array['owner', 'admin', 'sales']));

create policy "owners and admins can manage ai settings"
on public.ai_agent_settings for all
using (public.has_org_role(organization_id, array['owner', 'admin']))
with check (public.has_org_role(organization_id, array['owner', 'admin']));

create policy "members can read knowledge documents"
on public.knowledge_documents for select
using (public.is_org_member(organization_id));

create policy "owners and admins can manage knowledge documents"
on public.knowledge_documents for all
using (public.has_org_role(organization_id, array['owner', 'admin']))
with check (public.has_org_role(organization_id, array['owner', 'admin']));

create policy "members can read subscriptions"
on public.subscriptions for select
using (public.is_org_member(organization_id));

create policy "owners and admins can manage subscriptions"
on public.subscriptions for all
using (public.has_org_role(organization_id, array['owner', 'admin']))
with check (public.has_org_role(organization_id, array['owner', 'admin']));

