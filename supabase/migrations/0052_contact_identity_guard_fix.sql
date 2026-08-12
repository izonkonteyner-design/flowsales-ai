-- Repair the lead identity guard to query the canonical customer table.
-- The application stores customer records in public.contacts; public.customers
-- has never been part of the production schema.

create or replace function public.guard_duplicate_lead_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := public.normalize_identity_email(new.email);
  normalized_phone text := public.normalize_identity_phone(new.phone);
begin
  if normalized_email <> '' and exists (
    select 1 from public.leads l
    where l.organization_id = new.organization_id
      and public.normalize_identity_email(l.email) = normalized_email
  ) then
    raise exception using errcode = '23505', message = 'Bu e-posta ile mevcut bir lead zaten bulunuyor.';
  end if;

  if normalized_phone <> '' and exists (
    select 1 from public.leads l
    where l.organization_id = new.organization_id
      and public.normalize_identity_phone(l.phone) = normalized_phone
  ) then
    raise exception using errcode = '23505', message = 'Bu telefon ile mevcut bir lead zaten bulunuyor.';
  end if;

  if normalized_email <> '' and exists (
    select 1 from public.contacts c
    where c.organization_id = new.organization_id
      and public.normalize_identity_email(c.email) = normalized_email
  ) then
    raise exception using errcode = '23505', message = 'Bu e-posta mevcut bir müşteri kaydıyla eşleşiyor.';
  end if;

  if normalized_phone <> '' and exists (
    select 1 from public.contacts c
    where c.organization_id = new.organization_id
      and public.normalize_identity_phone(c.phone) = normalized_phone
  ) then
    raise exception using errcode = '23505', message = 'Bu telefon mevcut bir müşteri kaydıyla eşleşiyor.';
  end if;

  return new;
end;
$$;

insert into public.deployment_migrations(version,name,checksum)
values ('0052','0052_contact_identity_guard_fix.sql','contact-identity-guard-fix-2026-08-12')
on conflict (version) do update set name=excluded.name, checksum=excluded.checksum, executed_at=now();
