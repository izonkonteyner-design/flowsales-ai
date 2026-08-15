-- 0050_quote_attachments.sql
-- Secure per-quote attachment metadata. Storage objects are kept under
-- organizations/{organization_id}/quotes/{quote_id}/attachments/.

create table if not exists public.quote_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  mime_type text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0 and file_size_bytes <= 10485760),
  kind text not null default 'document' check (kind in ('image','document','catalog','technical','other')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists quote_attachments_quote_idx
  on public.quote_attachments(organization_id, quote_id, created_at desc);

alter table public.quote_attachments enable row level security;

create policy "members_read_quote_attachments"
  on public.quote_attachments for select
  using (public.is_org_member(organization_id));

create policy "sales_create_quote_attachments"
  on public.quote_attachments for insert
  with check (public.has_org_role(organization_id,array['owner','admin','sales']));

create policy "sales_delete_quote_attachments"
  on public.quote_attachments for delete
  using (public.has_org_role(organization_id,array['owner','admin','sales']));

insert into public.deployment_migrations(version,name,checksum)
values ('0050','0050_quote_attachments.sql','quote-attachments-v1-2026-08-15')
on conflict(version) do update set name=excluded.name,checksum=excluded.checksum,executed_at=now();
