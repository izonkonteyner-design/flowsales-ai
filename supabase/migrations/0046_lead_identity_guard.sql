-- Lead identity guard: prevent new live leads from duplicating an existing lead/customer
-- on a normalized email or phone identity within the same organization.
-- Existing duplicates are intentionally preserved for human resolution.

create or replace function public.normalize_identity_email(value text)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(trim(coalesce(value, '')));
$$;

create or replace function public.normalize_identity_phone(value text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when regexp_replace(coalesce(value, ''), '[^0-9]', '', 'g') = '' then ''
    else right(regexp_replace(coalesce(value, ''), '[^0-9]', '', 'g'), 10)
  end;
$$;

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
    select 1 from public.customers c
    where c.organization_id = new.organization_id
      and public.normalize_identity_email(c.email) = normalized_email
  ) then
    raise exception using errcode = '23505', message = 'Bu e-posta mevcut bir müşteri kaydıyla eşleşiyor.';
  end if;

  if normalized_phone <> '' and exists (
    select 1 from public.customers c
    where c.organization_id = new.organization_id
      and public.normalize_identity_phone(c.phone) = normalized_phone
  ) then
    raise exception using errcode = '23505', message = 'Bu telefon mevcut bir müşteri kaydıyla eşleşiyor.';
  end if;

  return new;
end;
$$;

drop trigger if exists leads_identity_guard_before_insert on public.leads;
create trigger leads_identity_guard_before_insert
before insert on public.leads
for each row execute function public.guard_duplicate_lead_identity();

insert into public.deployment_migrations(version,name,checksum)
values ('0046','0046_lead_identity_guard.sql','lead-identity-guard-2026-08-10')
on conflict (version) do update set name=excluded.name, checksum=excluded.checksum, executed_at=now();
