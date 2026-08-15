-- Quote attachments: private Storage bucket + metadata + organization-scoped RLS.
-- Safe to run more than once.

create table if not exists public.quote_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  mime_type text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0 and file_size_bytes <= 10485760),
  kind text not null default 'other',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists quote_attachments_quote_id_idx on public.quote_attachments(quote_id, created_at desc);
create index if not exists quote_attachments_organization_id_idx on public.quote_attachments(organization_id);

alter table public.quote_attachments enable row level security;

drop policy if exists "quote_attachments_select_member" on public.quote_attachments;
create policy "quote_attachments_select_member"
on public.quote_attachments for select
to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = quote_attachments.organization_id
      and om.user_id = auth.uid()
  )
);

drop policy if exists "quote_attachments_insert_sales" on public.quote_attachments;
create policy "quote_attachments_insert_sales"
on public.quote_attachments for insert
to authenticated
with check (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = quote_attachments.organization_id
      and om.user_id = auth.uid()
      and om.role in ('owner','admin','sales')
  )
);

drop policy if exists "quote_attachments_delete_sales" on public.quote_attachments;
create policy "quote_attachments_delete_sales"
on public.quote_attachments for delete
to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.organization_id = quote_attachments.organization_id
      and om.user_id = auth.uid()
      and om.role in ('owner','admin','sales')
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'quote-attachments',
  'quote-attachments',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp','application/pdf','text/plain','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "quote_attachments_storage_select_member" on storage.objects;
create policy "quote_attachments_storage_select_member"
on storage.objects for select
to authenticated
using (
  bucket_id = 'quote-attachments'
  and exists (
    select 1
    from public.organization_members om
    where om.organization_id::text = (storage.foldername(name))[2]
      and om.user_id = auth.uid()
  )
);

drop policy if exists "quote_attachments_storage_insert_sales" on storage.objects;
create policy "quote_attachments_storage_insert_sales"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'quote-attachments'
  and exists (
    select 1
    from public.organization_members om
    where om.organization_id::text = (storage.foldername(name))[2]
      and om.user_id = auth.uid()
      and om.role in ('owner','admin','sales')
  )
);

drop policy if exists "quote_attachments_storage_delete_sales" on storage.objects;
create policy "quote_attachments_storage_delete_sales"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'quote-attachments'
  and exists (
    select 1
    from public.organization_members om
    where om.organization_id::text = (storage.foldername(name))[2]
      and om.user_id = auth.uid()
      and om.role in ('owner','admin','sales')
  )
);
