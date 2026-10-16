-- 0023_sales_visibility_mode.sql
-- FlowSales AI: Sales visibility model per organization.
-- Adds `sales_visibility_mode` to organizations and implements the new RLS policies.

-- 1. Add sales_visibility_mode to organizations
alter table public.organizations
  add column if not exists sales_visibility_mode text not null default 'organization'
  check (sales_visibility_mode in ('organization', 'assigned', 'shared_read'));

-- 2. Helper function: get current user's membership role in an organization
create or replace function public.get_my_org_role(target_org uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select om.role
  from public.organization_members om
  where om.organization_id = target_org
    and om.user_id = auth.uid()
  limit 1;
$$;

revoke all on function public.get_my_org_role(uuid) from public;
grant execute on function public.get_my_org_role(uuid) to authenticated;

-- 3. Helper function: check if user can read all records in organization
create or replace function public.can_read_all_in_org(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = target_org
      and om.user_id = auth.uid()
      and om.role in ('owner', 'admin')
  )
  or (
    select o.sales_visibility_mode = 'organization'
    from public.organizations o
    where o.id = target_org
  ) and exists (
    select 1
    from public.organization_members om
    where om.organization_id = target_org
      and om.user_id = auth.uid()
      and om.role = 'sales'
  )
  or (
    select o.sales_visibility_mode = 'shared_read'
    from public.organizations o
    where o.id = target_org
  ) and exists (
    select 1
    from public.organization_members om
    where om.organization_id = target_org
      and om.user_id = auth.uid()
      and om.role = 'sales'
  );
$$;

revoke all on function public.can_read_all_in_org(uuid) from public;
grant execute on function public.can_read_all_in_org(uuid) to authenticated;

-- 4. Helper function: check if user can mutate a record based on ownership and visibility mode
create or replace function public.can_mutate_record(
  target_org uuid,
  assigned_to uuid,
  owner_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1
      from public.organization_members om
      where om.organization_id = target_org
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin')
    ) then true
    when auth.uid() = assigned_to
         and exists (
           select 1
           from public.organization_members om
           where om.organization_id = target_org
             and om.user_id = auth.uid()
             and om.role = 'sales'
         ) then true
    when auth.uid() = owner_id
         and exists (
           select 1
           from public.organization_members om
           where om.organization_id = target_org
             and om.user_id = auth.uid()
             and om.role = 'sales'
         ) then true
    else false
  end;
$$;

revoke all on function public.can_mutate_record(uuid, uuid, uuid) from public;
grant execute on function public.can_mutate_record(uuid, uuid, uuid) to authenticated;

-- 5. Helper function: get organization's sales_visibility_mode
create or replace function public.get_org_visibility_mode(target_org uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select sales_visibility_mode
  from public.organizations
  where id = target_org;
$$;

revoke all on function public.get_org_visibility_mode(uuid) from public;
grant execute on function public.get_org_visibility_mode(uuid) to authenticated;

-- 6. Drop existing permissive policies for leads, quotes, tasks, activities
drop policy if exists "members can read leads" on public.leads;
drop policy if exists "sales and admins can manage leads" on public.leads;

drop policy if exists "members can read quotes" on public.quotes;
drop policy if exists "sales and admins can manage quotes" on public.quotes;

drop policy if exists "members can read quote items" on public.quote_items;
drop policy if exists "sales and admins can manage quote items" on public.quote_items;

drop policy if exists "members can read activities" on public.activities;
drop policy if exists "sales and admins can manage activities" on public.activities;

drop policy if exists "members can read tasks" on public.tasks;
drop policy if exists "sales and admins can manage tasks" on public.tasks;

drop policy if exists "members can read contacts" on public.contacts;
drop policy if exists "owners and admins can manage contacts" on public.contacts;

drop policy if exists "members can read products" on public.products;
drop policy if exists "owners and admins can manage products" on public.products;

-- 7. New granular policies for LEADS
-- SELECT
create policy "leads_select_owner_admin"
on public.leads for select
using (
  public.has_org_role(organization_id, array['owner', 'admin'])
);

create policy "leads_select_sales_org_mode"
on public.leads for select
using (
  public.has_org_role(organization_id, array['sales'])
  and public.get_org_visibility_mode(organization_id) = 'organization'
);

create policy "leads_select_sales_assigned_mode"
on public.leads for select
using (
  public.has_org_role(organization_id, array['sales'])
  and public.get_org_visibility_mode(organization_id) = 'assigned'
  and assigned_to = auth.uid()
);

create policy "leads_select_sales_shared_read_mode"
on public.leads for select
using (
  public.has_org_role(organization_id, array['sales'])
  and public.get_org_visibility_mode(organization_id) = 'shared_read'
);

create policy "leads_select_viewer"
on public.leads for select
using (
  public.has_org_role(organization_id, array['viewer'])
);

-- INSERT
create policy "leads_insert_sales_admin_owner"
on public.leads for insert
with check (
  public.has_org_role(organization_id, array['owner', 'admin', 'sales'])
);

-- UPDATE
create policy "leads_update_owner_admin"
on public.leads for update
using (
  public.has_org_role(organization_id, array['owner', 'admin'])
)
with check (
  public.has_org_role(organization_id, array['owner', 'admin'])
);

create policy "leads_update_sales_org_mode"
on public.leads for update
using (
  public.has_org_role(organization_id, array['sales'])
  and public.get_org_visibility_mode(organization_id) = 'organization'
)
with check (
  public.has_org_role(organization_id, array['sales'])
  and public.get_org_visibility_mode(organization_id) = 'organization'
);

create policy "leads_update_sales_assigned_mode"
on public.leads for update
using (
  public.has_org_role(organization_id, array['sales'])
  and public.get_org_visibility_mode(organization_id) = 'assigned'
  and assigned_to = auth.uid()
)
with check (
  public.has_org_role(organization_id, array['sales'])
  and public.get_org_visibility_mode(organization_id) = 'assigned'
  and assigned_to = auth.uid()
);

create policy "leads_update_sales_shared_read_mode"
on public.leads for update
using (
  public.has_org_role(organization_id, array['sales'])
  and public.get_org_visibility_mode(organization_id) = 'shared_read'
  and assigned_to = auth.uid()
)
with check (
  public.has_org_role(organization_id, array['sales'])
  and public.get_org_visibility_mode(organization_id) = 'shared_read'
  and assigned_to = auth.uid()
);

-- DELETE
create policy "leads_delete_owner_admin"
on public.leads for delete
using (
  public.has_org_role(organization_id, array['owner', 'admin'])
);

create policy "leads_delete_sales_org_mode"
on public.leads for delete
using (
  public.has_org_role(organization_id, array['sales'])
  and public.get_org_visibility_mode(organization_id) = 'organization'
);

create policy "leads_delete_sales_assigned_mode"
on public.leads for delete
using (
  public.has_org_role(organization_id, array['sales'])
  and public.get_org_visibility_mode(organization_id) = 'assigned'
  and assigned_to = auth.uid()
);

create policy "leads_delete_sales_shared_read_mode"
on public.leads for delete
using (
  public.has_org_role(organization_id, array['sales'])
  and public.get_org_visibility_mode(organization_id) = 'shared_read'
  and assigned_to = auth.uid()
);

-- 8. New granular policies for QUOTES (use owner_id for ownership)
-- SELECT
create policy "quotes_select_owner_admin"
on public.quotes for select
using (
  public.has_org_role(organization_id, array['owner', 'admin'])
);

create policy "quotes_select_sales_org_mode"
on public.quotes for select
using (
  public.has_org_role(organization_id, array['sales'])
  and public.get_org_visibility_mode(organization_id) = 'organization'
);

create policy "quotes_select_sales_assigned_mode"
on public.quotes for select
using (
  public.has_org_role(organization_id, array['sales'])
  and public.get_org_visibility_mode(organization_id) = 'assigned'
  and owner_id = auth.uid()
);

create policy "quotes_select_sales_shared_read_mode"
on public.quotes for select
using (
  public.has_org_role(organization_id, array['sales'])
  and public.get_org_visibility_mode(organization_id) = 'shared_read'
);

create policy "quotes_select_viewer"
on public.quotes for select
using (
  public.has_org_role(organization_id, array['viewer'])
);

-- INSERT
create policy "quotes_insert_sales_admin_owner"
on public.quotes for insert
with check (
  public.has_org_role(organization_id, array['owner', 'admin', 'sales'])
);

-- UPDATE
create policy "quotes_update_owner_admin"
on public.quotes for update
using (
  public.has_org_role(organization_id, array['owner', 'admin'])
)
with check (
  public.has_org_role(organization_id, array['owner', 'admin'])
);

create policy "quotes_update_sales_org_mode"
on public.quotes for update
using (
  public.has_org_role(organization_id, array['sales'])
  and public.get_org_visibility_mode(organization_id) = 'organization'
)
with check (
  public.has_org_role(organization_id, array['sales'])
  and public.get_org_visibility_mode(organization_id) = 'organization'
);

create policy "quotes_update_sales_assigned_mode"
on public.quotes for update
using (
  public.has_org_role(organization_id, array['sales'])
  and public.get_org_visibility_mode(organization_id) = 'assigned'
  and owner_id = auth.uid()
)
with check (
  public.has_org_role(organization_id, array['sales'])
  and public.get_org_visibility_mode(organization_id) = 'assigned'
  and owner_id = auth.uid()
);

create policy "quotes_update_sales_shared_read_mode"
on public.quotes for update
using (
  public.has_org_role(organization_id, array['sales'])
  and public.get_org_visibility_mode(organization_id) = 'shared_read'
  and owner_id = auth.uid()
)
with check (
  public.has_org_role(organization_id, array['sales'])
  and public.get_org_visibility_mode(organization_id) = 'shared_read'
  and owner_id = auth.uid()
);

-- DELETE
create policy "quotes_delete_owner_admin"
on public.quotes for delete
using (
  public.has_org_role(organization_id, array['owner', 'admin'])
);

create policy "quotes_delete_sales_org_mode"
on public.quotes for delete
using (
  public.has_org_role(organization_id, array['sales'])
  and public.get_org_visibility_mode(organization_id) = 'organization'
);

create policy "quotes_delete_sales_assigned_mode"
on public.quotes for delete
using (
  public.has_org_role(organization_id, array['sales'])
  and public.get_org_visibility_mode(organization_id) = 'assigned'
  and owner_id = auth.uid()
);

create policy "quotes_delete_sales_shared_read_mode"
on public.quotes for delete
using (
  public.has_org_role(organization_id, array['sales'])
  and public.get_org_visibility_mode(organization_id) = 'shared_read'
  and owner_id = auth.uid()
);

-- 9. QUOTE ITEMS - inherit from parent quote
-- SELECT
create policy "quote_items_select_owner_admin"
on public.quote_items for select
using (
  exists (
    select 1 from public.quotes q
    where q.id = quote_items.quote_id
      and public.has_org_role(q.organization_id, array['owner', 'admin'])
  )
);

create policy "quote_items_select_sales_org_mode"
on public.quote_items for select
using (
  exists (
    select 1 from public.quotes q
    where q.id = quote_items.quote_id
      and public.has_org_role(q.organization_id, array['sales'])
      and public.get_org_visibility_mode(q.organization_id) = 'organization'
  )
);

create policy "quote_items_select_sales_assigned_mode"
on public.quote_items for select
using (
  exists (
    select 1 from public.quotes q
    where q.id = quote_items.quote_id
      and public.has_org_role(q.organization_id, array['sales'])
      and public.get_org_visibility_mode(q.organization_id) = 'assigned'
      and q.owner_id = auth.uid()
  )
);

create policy "quote_items_select_sales_shared_read_mode"
on public.quote_items for select
using (
  exists (
    select 1 from public.quotes q
    where q.id = quote_items.quote_id
      and public.has_org_role(q.organization_id, array['sales'])
      and public.get_org_visibility_mode(q.organization_id) = 'shared_read'
  )
);

create policy "quote_items_select_viewer"
on public.quote_items for select
using (
  exists (
    select 1 from public.quotes q
    where q.id = quote_items.quote_id
      and public.has_org_role(q.organization_id, array['viewer'])
  )
);

-- INSERT
create policy "quote_items_insert_sales_admin_owner"
on public.quote_items for insert
with check (
  exists (
    select 1 from public.quotes q
    where q.id = quote_items.quote_id
      and public.has_org_role(q.organization_id, array['owner', 'admin', 'sales'])
  )
);

-- UPDATE
create policy "quote_items_update_owner_admin"
on public.quote_items for update
using (
  exists (
    select 1 from public.quotes q
    where q.id = quote_items.quote_id
      and public.has_org_role(q.organization_id, array['owner', 'admin'])
  )
)
with check (
  exists (
    select 1 from public.quotes q
    where q.id = quote_items.quote_id
      and public.has_org_role(q.organization_id, array['owner', 'admin'])
  )
);

create policy "quote_items_update_sales_org_mode"
on public.quote_items for update
using (
  exists (
    select 1 from public.quotes q
    where q.id = quote_items.quote_id
      and public.has_org_role(q.organization_id, array['sales'])
      and public.get_org_visibility_mode(q.organization_id) = 'organization'
  )
)
with check (
  exists (
    select 1 from public.quotes q
    where q.id = quote_items.quote_id
      and public.has_org_role(q.organization_id, array['sales'])
      and public.get_org_visibility_mode(q.organization_id) = 'organization'
  )
);

create policy "quote_items_update_sales_assigned_mode"
on public.quote_items for update
using (
  exists (
    select 1 from public.quotes q
    where q.id = quote_items.quote_id
      and public.has_org_role(q.organization_id, array['sales'])
      and public.get_org_visibility_mode(q.organization_id) = 'assigned'
      and q.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.quotes q
    where q.id = quote_items.quote_id
      and public.has_org_role(q.organization_id, array['sales'])
      and public.get_org_visibility_mode(q.organization_id) = 'assigned'
      and q.owner_id = auth.uid()
  )
);

create policy "quote_items_update_sales_shared_read_mode"
on public.quote_items for update
using (
  exists (
    select 1 from public.quotes q
    where q.id = quote_items.quote_id
      and public.has_org_role(q.organization_id, array['sales'])
      and public.get_org_visibility_mode(q.organization_id) = 'shared_read'
      and q.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.quotes q
    where q.id = quote_items.quote_id
      and public.has_org_role(q.organization_id, array['sales'])
      and public.get_org_visibility_mode(q.organization_id) = 'shared_read'
      and q.owner_id = auth.uid()
  )
);

-- DELETE
create policy "quote_items_delete_owner_admin"
on public.quote_items for delete
using (
  exists (
    select 1 from public.quotes q
    where q.id = quote_items.quote_id
      and public.has_org_role(q.organization_id, array['owner', 'admin'])
  )
);

create policy "quote_items_delete_sales_org_mode"
on public.quote_items for delete
using (
  exists (
    select 1 from public.quotes q
    where q.id = quote_items.quote_id
      and public.has_org_role(q.organization_id, array['sales'])
      and public.get_org_visibility_mode(q.organization_id) = 'organization'
  )
);

create policy "quote_items_delete_sales_assigned_mode"
on public.quote_items for delete
using (
  exists (
    select 1 from public.quotes q
    where q.id = quote_items.quote_id
      and public.has_org_role(q.organization_id, array['sales'])
      and public.get_org_visibility_mode(q.organization_id) = 'assigned'
      and q.owner_id = auth.uid()
  )
);

create policy "quote_items_delete_sales_shared_read_mode"
on public.quote_items for delete
using (
  exists (
    select 1 from public.quotes q
    where q.id = quote_items.quote_id
      and public.has_org_role(q.organization_id, array['sales'])
      and public.get_org_visibility_mode(q.organization_id) = 'shared_read'
      and q.owner_id = auth.uid()
  )
);

-- 10. New granular policies for ACTIVITIES
-- SELECT visibility derives from parent entity (lead/quote/contact) + org mode
create policy "activities_select_owner_admin"
on public.activities for select
using (
  public.has_org_role(organization_id, array['owner', 'admin'])
);

create policy "activities_select_sales_org_mode"
on public.activities for select
using (
  public.has_org_role(organization_id, array['sales'])
  and public.get_org_visibility_mode(organization_id) = 'organization'
);

create policy "activities_select_sales_assigned_mode"
on public.activities for select
using (
  public.has_org_role(organization_id, array['sales'])
  and public.get_org_visibility_mode(organization_id) = 'assigned'
  and created_by = auth.uid()
);

create policy "activities_select_sales_shared_read_mode"
on public.activities for select
using (
  public.has_org_role(organization_id, array['sales'])
  and public.get_org_visibility_mode(organization_id) = 'shared_read'
);

create policy "activities_select_viewer"
on public.activities for select
using (
  public.has_org_role(organization_id, array['viewer'])
);

-- INSERT: sales and above
create policy "activities_insert_sales_admin_owner"
on public.activities for insert
with check (
  public.has_org_role(organization_id, array['owner', 'admin', 'sales'])
);

-- UPDATE: owner/admin full, sales own activities
create policy "activities_update_owner_admin"
on public.activities for update
using (
  public.has_org_role(organization_id, array['owner', 'admin'])
)
with check (
  public.has_org_role(organization_id, array['owner', 'admin'])
);

create policy "activities_update_sales_own"
on public.activities for update
using (
  public.has_org_role(organization_id, array['sales'])
  and created_by = auth.uid()
)
with check (
  public.has_org_role(organization_id, array['sales'])
  and created_by = auth.uid()
);

-- DELETE: owner/admin full, sales own activities
create policy "activities_delete_owner_admin"
on public.activities for delete
using (
  public.has_org_role(organization_id, array['owner', 'admin'])
);

create policy "activities_delete_sales_own"
on public.activities for delete
using (
  public.has_org_role(organization_id, array['sales'])
  and created_by = auth.uid()
);

-- 11. New granular policies for TASKS (use assigned_to for ownership)
create policy "tasks_select_owner_admin"
on public.tasks for select
using (
  public.has_org_role(organization_id, array['owner', 'admin'])
);

create policy "tasks_select_sales_org_mode"
on public.tasks for select
using (
  public.has_org_role(organization_id, array['sales'])
  and public.get_org_visibility_mode(organization_id) = 'organization'
);

create policy "tasks_select_sales_assigned_mode"
on public.tasks for select
using (
  public.has_org_role(organization_id, array['sales'])
  and public.get_org_visibility_mode(organization_id) = 'assigned'
  and assigned_to = auth.uid()
);

create policy "tasks_select_sales_shared_read_mode"
on public.tasks for select
using (
  public.has_org_role(organization_id, array['sales'])
  and public.get_org_visibility_mode(organization_id) = 'shared_read'
);

create policy "tasks_select_viewer"
on public.tasks for select
using (
  public.has_org_role(organization_id, array['viewer'])
);

-- INSERT
create policy "tasks_insert_sales_admin_owner"
on public.tasks for insert
with check (
  public.has_org_role(organization_id, array['owner', 'admin', 'sales'])
);

-- UPDATE
create policy "tasks_update_owner_admin"
on public.tasks for update
using (
  public.has_org_role(organization_id, array['owner', 'admin'])
)
with check (
  public.has_org_role(organization_id, array['owner', 'admin'])
);

create policy "tasks_update_sales_org_mode"
on public.tasks for update
using (
  public.has_org_role(organization_id, array['sales'])
  and public.get_org_visibility_mode(organization_id) = 'organization'
)
with check (
  public.has_org_role(organization_id, array['sales'])
  and public.get_org_visibility_mode(organization_id) = 'organization'
);

create policy "tasks_update_sales_assigned_mode"
on public.tasks for update
using (
  public.has_org_role(organization_id, array['sales'])
  and public.get_org_visibility_mode(organization_id) = 'assigned'
  and assigned_to = auth.uid()
)
with check (
  public.has_org_role(organization_id, array['sales'])
  and public.get_org_visibility_mode(organization_id) = 'assigned'
  and assigned_to = auth.uid()
);

create policy "tasks_update_sales_shared_read_mode"
on public.tasks for update
using (
  public.has_org_role(organization_id, array['sales'])
  and public.get_org_visibility_mode(organization_id) = 'shared_read'
  and assigned_to = auth.uid()
)
with check (
  public.has_org_role(organization_id, array['sales'])
  and public.get_org_visibility_mode(organization_id) = 'shared_read'
  and assigned_to = auth.uid()
);

-- DELETE
create policy "tasks_delete_owner_admin"
on public.tasks for delete
using (
  public.has_org_role(organization_id, array['owner', 'admin'])
);

create policy "tasks_delete_sales_org_mode"
on public.tasks for delete
using (
  public.has_org_role(organization_id, array['sales'])
  and public.get_org_visibility_mode(organization_id) = 'organization'
);

create policy "tasks_delete_sales_assigned_mode"
on public.tasks for delete
using (
  public.has_org_role(organization_id, array['sales'])
  and public.get_org_visibility_mode(organization_id) = 'assigned'
  and assigned_to = auth.uid()
);

create policy "tasks_delete_sales_shared_read_mode"
on public.tasks for delete
using (
  public.has_org_role(organization_id, array['sales'])
  and public.get_org_visibility_mode(organization_id) = 'shared_read'
  and assigned_to = auth.uid()
);

-- 12. CONTACTS - keep existing behavior (org-wide read for members, owner/admin manage)
-- SELECT: all members
create policy "contacts_select_members"
on public.contacts for select
using (
  public.is_org_member(organization_id)
);

-- INSERT/UPDATE/DELETE: owner/admin only
create policy "contacts_insert_owner_admin"
on public.contacts for insert
with check (
  public.has_org_role(organization_id, array['owner', 'admin'])
);

create policy "contacts_update_owner_admin"
on public.contacts for update
using (
  public.has_org_role(organization_id, array['owner', 'admin'])
)
with check (
  public.has_org_role(organization_id, array['owner', 'admin'])
);

create policy "contacts_delete_owner_admin"
on public.contacts for delete
using (
  public.has_org_role(organization_id, array['owner', 'admin'])
);

-- 13. PRODUCTS - keep existing behavior
create policy "products_select_members"
on public.products for select
using (
  public.is_org_member(organization_id)
);

create policy "products_insert_owner_admin"
on public.products for insert
with check (
  public.has_org_role(organization_id, array['owner', 'admin'])
);

create policy "products_update_owner_admin"
on public.products for update
using (
  public.has_org_role(organization_id, array['owner', 'admin'])
)
with check (
  public.has_org_role(organization_id, array['owner', 'admin'])
);

create policy "products_delete_owner_admin"
on public.products for delete
using (
  public.has_org_role(organization_id, array['owner', 'admin'])
);

-- 14. Update existing demo workspace to use default visibility mode
update public.organizations
set sales_visibility_mode = 'organization'
where id = 'd3e00000-0000-0000-0000-000000000000';

-- 15. Rollback notes
-- To revert this migration:
--   drop policy if exists "leads_select_*" on public.leads;
--   drop policy if exists "leads_insert_*" on public.leads;
--   drop policy if exists "leads_update_*" on public.leads;
--   drop policy if exists "leads_delete_*" on public.leads;
--   drop policy if exists "quotes_select_*" on public.quotes;
--   drop policy if exists "quotes_insert_*" on public.quotes;
--   drop policy if exists "quotes_update_*" on public.quotes;
--   drop policy if exists "quotes_delete_*" on public.quotes;
--   drop policy if exists "quote_items_select_*" on public.quote_items;
--   drop policy if exists "quote_items_insert_*" on public.quote_items;
--   drop policy if exists "quote_items_update_*" on public.quote_items;
--   drop policy if exists "quote_items_delete_*" on public.quote_items;
--   drop policy if exists "activities_select_*" on public.activities;
--   drop policy if exists "activities_insert_*" on public.activities;
--   drop policy if exists "activities_update_*" on public.activities;
--   drop policy if exists "activities_delete_*" on public.activities;
--   drop policy if exists "tasks_select_*" on public.tasks;
--   drop policy if exists "tasks_insert_*" on public.tasks;
--   drop policy if exists "tasks_update_*" on public.tasks;
--   drop policy if exists "tasks_delete_*" on public.tasks;
--   drop policy if exists "contacts_select_*" on public.contacts;
--   drop policy if exists "contacts_insert_*" on public.contacts;
--   drop policy if exists "contacts_update_*" on public.contacts;
--   drop policy if exists "contacts_delete_*" on public.contacts;
--   drop policy if exists "products_select_*" on public.products;
--   drop policy if exists "products_insert_*" on public.products;
--   drop policy if exists "products_update_*" on public.products;
--   drop policy if exists "products_delete_*" on public.products;
--   create policy "members can read leads" on public.leads for select using (public.is_org_member(organization_id));
--   create policy "sales and admins can manage leads" on public.leads for all using (public.has_org_role(organization_id, array['owner', 'admin', 'sales'])) with check (public.has_org_role(organization_id, array['owner', 'admin', 'sales']));
--   create policy "members can read quotes" on public.quotes for select using (public.is_org_member(organization_id));
--   create policy "sales and admins can manage quotes" on public.quotes for all using (public.has_org_role(organization_id, array['owner', 'admin', 'sales'])) with check (public.has_org_role(organization_id, array['owner', 'admin', 'sales']));
--   create policy "members can read quote items" on public.quote_items for select using (exists (select 1 from public.quotes q where q.id = quote_items.quote_id and public.is_org_member(q.organization_id)));
--   create policy "sales and admins can manage quote items" on public.quote_items for all using (exists (select 1 from public.quotes q where q.id = quote_items.quote_id and public.has_org_role(q.organization_id, array['owner', 'admin', 'sales']))) with check (exists (select 1 from public.quotes q where q.id = quote_items.quote_id and public.has_org_role(q.organization_id, array['owner', 'admin', 'sales'])));
--   create policy "members can read activities" on public.activities for select using (public.is_org_member(organization_id));
--   create policy "sales and admins can manage activities" on public.activities for all using (public.has_org_role(organization_id, array['owner', 'admin', 'sales'])) with check (public.has_org_role(organization_id, array['owner', 'admin', 'sales']));
--   create policy "members can read tasks" on public.tasks for select using (public.is_org_member(organization_id));
--   create policy "sales and admins can manage tasks" on public.tasks for all using (public.has_org_role(organization_id, array['owner', 'admin', 'sales'])) with check (public.has_org_role(organization_id, array['owner', 'admin', 'sales']));
--   create policy "members can read contacts" on public.contacts for select using (public.is_org_member(organization_id));
--   create policy "owners and admins can manage contacts" on public.contacts for all using (public.has_org_role(organization_id, array['owner', 'admin'])) with check (public.has_org_role(organization_id, array['owner', 'admin']));
--   create policy "members can read products" on public.products for select using (public.is_org_member(organization_id));
--   create policy "owners and admins can manage products" on public.products for all using (public.has_org_role(organization_id, array['owner', 'admin'])) with check (public.has_org_role(organization_id, array['owner', 'admin']));
--   alter table public.organizations drop column if exists sales_visibility_mode;
--   drop function if exists public.get_my_org_role(uuid);
--   drop function if exists public.can_read_all_in_org(uuid);
--   drop function if exists public.can_mutate_record(uuid, uuid, uuid);
--   drop function if exists public.get_org_visibility_mode(uuid);