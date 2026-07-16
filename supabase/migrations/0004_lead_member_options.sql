-- Safe helper for tenant-scoped assignee lookup without broadening profile reads.
create or replace function public.get_org_member_options(target_org uuid)
returns table (
  user_id uuid,
  full_name text,
  role text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    om.user_id,
    coalesce(p.full_name, 'Team member') as full_name,
    om.role
  from public.organization_members om
  left join public.profiles p on p.id = om.user_id
  where om.organization_id = target_org
  order by
    case om.role
      when 'owner' then 1
      when 'admin' then 2
      when 'sales' then 3
      else 4
    end,
    coalesce(p.full_name, om.user_id::text);
$$;

grant execute on function public.get_org_member_options(uuid) to authenticated;
