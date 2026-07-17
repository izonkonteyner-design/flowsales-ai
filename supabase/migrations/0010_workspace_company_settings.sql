-- Workspace/company settings and branded quote assets

alter table public.organizations
  add column if not exists logo_path text,
  add column if not exists legal_name text,
  add column if not exists website text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists secondary_phone text,
  add column if not exists address_line_1 text,
  add column if not exists address_line_2 text,
  add column if not exists district text,
  add column if not exists city text,
  add column if not exists postal_code text,
  add column if not exists country text,
  add column if not exists tax_office text,
  add column if not exists tax_number text,
  add column if not exists trade_registry_number text,
  add column if not exists mersis_number text,
  add column if not exists bank_name text,
  add column if not exists bank_branch text,
  add column if not exists iban text,
  add column if not exists account_holder text,
  add column if not exists default_tax_rate numeric(5,2) not null default 20,
  add column if not exists default_payment_terms text,
  add column if not exists default_delivery_terms text,
  add column if not exists default_quote_notes text,
  add column if not exists default_quote_validity_days integer not null default 30,
  add column if not exists quote_footer_text text,
  add column if not exists signature_name text,
  add column if not exists signature_title text,
  add column if not exists company_slogan text;

update public.organizations
set
  default_tax_rate = coalesce(default_tax_rate, 20),
  default_quote_validity_days = coalesce(default_quote_validity_days, 30);

insert into storage.buckets (id, name, public)
values ('workspace-assets', 'workspace-assets', true)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public;

drop policy if exists "members can read workspace assets" on storage.objects;
drop policy if exists "owners and admins can manage workspace assets" on storage.objects;

create policy "members can read workspace assets"
on storage.objects for select
using (
  bucket_id = 'workspace-assets'
  and name like 'organizations/%'
  and public.is_org_member(
    split_part(name, '/', 2)::uuid
  )
);

create policy "owners and admins can manage workspace assets"
on storage.objects for insert
with check (
  bucket_id = 'workspace-assets'
  and name like 'organizations/%'
  and public.has_org_role(
    split_part(name, '/', 2)::uuid,
    array['owner', 'admin']
  )
);

create policy "owners and admins can update workspace assets"
on storage.objects for update
using (
  bucket_id = 'workspace-assets'
  and name like 'organizations/%'
  and public.has_org_role(
    split_part(name, '/', 2)::uuid,
    array['owner', 'admin']
  )
)
with check (
  bucket_id = 'workspace-assets'
  and name like 'organizations/%'
  and public.has_org_role(
    split_part(name, '/', 2)::uuid,
    array['owner', 'admin']
  )
);

create policy "owners and admins can delete workspace assets"
on storage.objects for delete
using (
  bucket_id = 'workspace-assets'
  and name like 'organizations/%'
  and public.has_org_role(
    split_part(name, '/', 2)::uuid,
    array['owner', 'admin']
  )
);

