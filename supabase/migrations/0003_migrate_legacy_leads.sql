-- Preserve the old MVP leads table by expanding it into the new tenant-aware shape.
do $$
declare
  has_leads boolean;
  has_name boolean;
  has_value boolean;
  default_org uuid;
begin
  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'leads'
  ) into has_leads;

  if not has_leads then
    return;
  end if;

  insert into public.organizations (name, slug, currency)
  values ('Legacy Workspace', 'legacy-workspace', 'TRY')
  on conflict (slug) do update set name = excluded.name
  returning id into default_org;

  alter table public.leads add column if not exists organization_id uuid;
  alter table public.leads add column if not exists full_name text;
  alter table public.leads add column if not exists estimated_value numeric(14,2);
  alter table public.leads add column if not exists currency char(3) default 'TRY';
  alter table public.leads add column if not exists notes text;
  alter table public.leads add column if not exists assigned_to uuid;
  alter table public.leads add column if not exists next_follow_up_at timestamptz;
  alter table public.leads add column if not exists created_by uuid;
  alter table public.leads add column if not exists updated_at timestamptz not null default now();

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'leads' and column_name = 'name'
  ) into has_name;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'leads' and column_name = 'value'
  ) into has_value;

  update public.leads
  set organization_id = coalesce(organization_id, default_org),
      estimated_value = coalesce(estimated_value, 0),
      currency = coalesce(currency, 'TRY'),
      notes = coalesce(notes, ''),
      updated_at = now();

  if has_name then
    execute $sql$
      update public.leads
      set full_name = coalesce(nullif(full_name, ''), name)
      where name is not null
        and nullif(full_name, '') is null
    $sql$;
  end if;

  if has_value then
    execute $sql$
      update public.leads
      set estimated_value = coalesce(
        nullif(regexp_replace(coalesce(value::text, ''), '[^0-9\.]', '', 'g'), '')::numeric,
        0
      )
      where value is not null
        and estimated_value = 0
    $sql$;
  end if;

  alter table public.leads alter column organization_id set not null;
  alter table public.leads alter column full_name set not null;
  alter table public.leads alter column estimated_value set not null;
  alter table public.leads alter column currency set not null;
end $$;
