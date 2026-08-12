-- Production onboarding fields and canonical workspace role profiles.

alter table public.organizations
  add column if not exists timezone text not null default 'Europe/Istanbul';

alter table public.organization_members drop constraint if exists organization_members_role_check;
alter table public.organization_members
  add constraint organization_members_role_check
  check (role in ('owner', 'admin', 'manager', 'sales_rep', 'sales', 'viewer'));

alter table public.workspace_invitations drop constraint if exists workspace_invitations_role_check;
alter table public.workspace_invitations
  add constraint workspace_invitations_role_check
  check (role in ('owner', 'admin', 'manager', 'sales_rep', 'sales', 'viewer'));

create or replace function public.has_org_role(target_org uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members om
    where om.organization_id = target_org
      and om.user_id = auth.uid()
      and (
        om.role = any(allowed_roles)
        or (om.role = 'manager' and ('sales' = any(allowed_roles) or 'manager' = any(allowed_roles)))
        or (om.role = 'sales_rep' and ('sales' = any(allowed_roles) or 'sales_rep' = any(allowed_roles)))
        or (om.role = 'sales' and ('sales_rep' = any(allowed_roles) or 'sales' = any(allowed_roles)))
      )
  );
$$;

revoke all on function public.has_org_role(uuid, text[]) from public;
grant execute on function public.has_org_role(uuid, text[]) to authenticated;

create or replace function public.has_org_permission(p_organization_id uuid, p_permission text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_role text;
begin
  v_role := public.current_org_role(p_organization_id);
  if v_role is null then return false; end if;
  if v_role = 'owner' then return true; end if;
  if p_permission in ('manage_members','manage_billing','manage_workspace') then return v_role = 'admin'; end if;
  if p_permission in ('review_ai','manage_pipeline') then return v_role in ('admin','manager'); end if;
  if p_permission in ('run_ai','import_data','edit_crm') then return v_role in ('admin','manager','sales_rep','sales'); end if;
  if p_permission = 'view_crm' then return true; end if;
  return false;
end;
$$;

-- The original omnichannel policies used direct role checks. Recreate them
-- through has_org_role so Manager and Sales Representative receive the same
-- scoped CRM-write access while Viewer remains read-only.
drop policy if exists "owner_admin_sales_write_channel_contacts" on public.channel_contacts;
create policy "owner_admin_sales_write_channel_contacts" on public.channel_contacts for insert
with check (organization_id <> 'd3e00000-0000-0000-0000-000000000000'::uuid and public.has_org_role(organization_id, array['owner','admin','sales']));
drop policy if exists "owner_admin_sales_update_channel_contacts" on public.channel_contacts;
create policy "owner_admin_sales_update_channel_contacts" on public.channel_contacts for update
using (organization_id <> 'd3e00000-0000-0000-0000-000000000000'::uuid and public.has_org_role(organization_id, array['owner','admin','sales']));

drop policy if exists "owner_admin_sales_write_conversations" on public.conversations;
create policy "owner_admin_sales_write_conversations" on public.conversations for insert
with check (organization_id <> 'd3e00000-0000-0000-0000-000000000000'::uuid and public.has_org_role(organization_id, array['owner','admin','sales']));
drop policy if exists "owner_admin_sales_update_conversations" on public.conversations;
create policy "owner_admin_sales_update_conversations" on public.conversations for update
using (organization_id <> 'd3e00000-0000-0000-0000-000000000000'::uuid and public.has_org_role(organization_id, array['owner','admin','sales']));

drop policy if exists "owner_admin_sales_write_conversation_participants" on public.conversation_participants;
create policy "owner_admin_sales_write_conversation_participants" on public.conversation_participants for insert
with check (organization_id <> 'd3e00000-0000-0000-0000-000000000000'::uuid and public.has_org_role(organization_id, array['owner','admin','sales']));

drop policy if exists "owner_admin_sales_write_messages" on public.messages;
create policy "owner_admin_sales_write_messages" on public.messages for insert
with check (organization_id <> 'd3e00000-0000-0000-0000-000000000000'::uuid and public.has_org_role(organization_id, array['owner','admin','sales']));
drop policy if exists "owner_admin_sales_update_messages" on public.messages;
create policy "owner_admin_sales_update_messages" on public.messages for update
using (organization_id <> 'd3e00000-0000-0000-0000-000000000000'::uuid and public.has_org_role(organization_id, array['owner','admin','sales']));

drop policy if exists "owner_admin_sales_write_lead_source_events" on public.lead_source_events;
create policy "owner_admin_sales_write_lead_source_events" on public.lead_source_events for insert
with check (organization_id <> 'd3e00000-0000-0000-0000-000000000000'::uuid and public.has_org_role(organization_id, array['owner','admin','sales']));

insert into public.deployment_migrations(version, name, checksum)
values ('0050','0050_onboarding_roles.sql','onboarding-roles-2026-08-12')
on conflict (version) do update set name = excluded.name, checksum = excluded.checksum, executed_at = now();
