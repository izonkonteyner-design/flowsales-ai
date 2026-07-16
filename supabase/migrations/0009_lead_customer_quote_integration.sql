-- Lead-to-customer conversion metadata and quote/customer linkage helpers

alter table public.leads
  add column if not exists converted_at timestamptz,
  add column if not exists converted_customer_id uuid references public.contacts(id) on delete set null,
  add column if not exists converted_by uuid references auth.users(id) on delete set null;

alter table public.contacts
  add column if not exists source_lead_id uuid references public.leads(id) on delete set null;

create index if not exists leads_organization_converted_customer_idx
  on public.leads (organization_id, converted_customer_id);

create index if not exists leads_organization_converted_at_idx
  on public.leads (organization_id, converted_at);

create unique index if not exists contacts_source_lead_unique_idx
  on public.contacts (source_lead_id)
  where source_lead_id is not null;

create index if not exists contacts_organization_email_idx
  on public.contacts (organization_id, lower(email));

create index if not exists contacts_organization_phone_idx
  on public.contacts (organization_id, phone);

