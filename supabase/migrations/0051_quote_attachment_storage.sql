-- 0051_quote_attachment_storage.sql
-- Storage bucket for private quote attachments.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'quote-attachments',
  'quote-attachments',
  false,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = excluded.allowed_mime_types;

-- Object paths are scoped to an organization and quote. The application upload
-- endpoint performs the role/quote checks before writing objects.
create policy "quote_attachment_objects_read_org_members"
  on storage.objects for select
  using (
    bucket_id = 'quote-attachments'
    and public.is_org_member((storage.foldername(name))[2]::uuid)
  );

create policy "quote_attachment_objects_insert_sales"
  on storage.objects for insert
  with check (
    bucket_id = 'quote-attachments'
    and public.has_org_role((storage.foldername(name))[2]::uuid, array['owner','admin','sales'])
  );

create policy "quote_attachment_objects_delete_sales"
  on storage.objects for delete
  using (
    bucket_id = 'quote-attachments'
    and public.has_org_role((storage.foldername(name))[2]::uuid, array['owner','admin','sales'])
  );

insert into public.deployment_migrations(version,name,checksum)
values ('0051','0051_quote_attachment_storage.sql','quote-attachment-storage-v1-2026-08-15')
on conflict(version) do update set name=excluded.name,checksum=excluded.checksum,executed_at=now();
