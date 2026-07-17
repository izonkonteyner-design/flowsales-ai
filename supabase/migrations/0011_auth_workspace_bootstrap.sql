create or replace function public.bootstrap_workspace(workspace_name text, full_name text default null)
returns table (
  organization_id uuid,
  organization_slug text,
  organization_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_workspace_name text;
  workspace_slug_base text;
  workspace_slug text;
  existing_organization_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  normalized_workspace_name := regexp_replace(coalesce(trim(workspace_name), ''), '\s+', ' ', 'g');
  if normalized_workspace_name = '' then
    raise exception 'Workspace name is required.' using errcode = '22023';
  end if;

  workspace_slug_base := lower(regexp_replace(normalized_workspace_name, '[^a-zA-Z0-9]+', '-', 'g'));
  workspace_slug_base := regexp_replace(workspace_slug_base, '(^-+|-+$)', '', 'g');
  if workspace_slug_base = '' then
    workspace_slug_base := 'workspace';
  end if;

  workspace_slug := workspace_slug_base || '-' || substr(replace(current_user_id::text, '-', ''), 1, 8);

  select om.organization_id
  into existing_organization_id
  from public.organization_members om
  where om.user_id = current_user_id
  order by om.created_at asc
  limit 1;

  if existing_organization_id is null then
    insert into public.organizations (name, slug, currency)
    values (normalized_workspace_name, workspace_slug, 'TRY')
    on conflict (slug) do update
    set name = excluded.name
    returning id into existing_organization_id;

    insert into public.organization_members (organization_id, user_id, role)
    values (existing_organization_id, current_user_id, 'owner')
    on conflict (organization_id, user_id) do nothing;
  else
    update public.organizations
    set name = normalized_workspace_name
    where id = existing_organization_id;
  end if;

  if nullif(trim(coalesce(full_name, '')), '') is not null then
    insert into public.profiles (id, full_name)
    values (current_user_id, regexp_replace(trim(full_name), '\s+', ' ', 'g'))
    on conflict (id) do update
    set full_name = excluded.full_name;
  else
    insert into public.profiles (id)
    values (current_user_id)
    on conflict (id) do nothing;
  end if;

  return query
  select
    o.id,
    o.slug,
    o.name
  from public.organizations o
  where o.id = existing_organization_id;
end;
$$;

grant execute on function public.bootstrap_workspace(text, text) to authenticated;

