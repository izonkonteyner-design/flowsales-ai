create table if not exists public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner', 'admin', 'sales', 'viewer')),
  token_hash text not null unique,
  invited_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists workspace_invitations_pending_email_unique
on public.workspace_invitations (organization_id, lower(email))
where status = 'pending';

create index if not exists workspace_invitations_organization_id_idx
on public.workspace_invitations (organization_id);

create index if not exists workspace_invitations_status_idx
on public.workspace_invitations (status);

alter table public.workspace_invitations enable row level security;

create or replace function public.prevent_owner_membership_modification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' and old.role = 'owner' then
    raise exception 'Owner memberships cannot be removed.' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and old.role = 'owner' and new.role <> 'owner' then
    raise exception 'Owner memberships cannot be demoted.' using errcode = '42501';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists organization_members_owner_guard on public.organization_members;
create trigger organization_members_owner_guard
before update or delete on public.organization_members
for each row execute function public.prevent_owner_membership_modification();

create policy "owners and admins can read invitations"
on public.workspace_invitations for select
using (public.has_org_role(organization_id, array['owner', 'admin']));

create policy "owners and admins can create invitations"
on public.workspace_invitations for insert
with check (public.has_org_role(organization_id, array['owner', 'admin']));

create policy "owners and admins can update invitations"
on public.workspace_invitations for update
using (public.has_org_role(organization_id, array['owner', 'admin']))
with check (public.has_org_role(organization_id, array['owner', 'admin']));

create policy "owners and admins can delete invitations"
on public.workspace_invitations for delete
using (public.has_org_role(organization_id, array['owner', 'admin']));

create or replace function public.get_workspace_invitation_preview(invitation_token text)
returns table (
  invitation_id uuid,
  organization_id uuid,
  organization_name text,
  organization_slug text,
  email text,
  role text,
  status text,
  expires_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz,
  invited_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    wi.id,
    wi.organization_id,
    o.name,
    o.slug,
    wi.email,
    wi.role,
    wi.status,
    wi.expires_at,
    wi.accepted_at,
    wi.revoked_at,
    wi.invited_by,
    wi.created_at,
    wi.updated_at
  from public.workspace_invitations wi
  inner join public.organizations o on o.id = wi.organization_id
  where wi.token_hash = encode(extensions.digest(invitation_token, 'sha256'), 'hex')
  limit 1;
$$;

grant execute on function public.get_workspace_invitation_preview(text) to anon, authenticated;

create or replace function public.accept_workspace_invitation(invitation_token text, actor_user_id uuid, actor_email text)
returns table (
  organization_id uuid,
  organization_name text,
  role text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  invitation_row public.workspace_invitations%rowtype;
  normalized_actor_email text;
begin
  if current_user_id is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  if actor_user_id is null or actor_user_id <> current_user_id then
    raise exception 'Invalid invitation acceptance.' using errcode = '28000';
  end if;

  normalized_actor_email := lower(trim(coalesce(actor_email, '')));
  if normalized_actor_email = '' then
    raise exception 'Invitation email is required.' using errcode = '22023';
  end if;

  select *
  into invitation_row
  from public.workspace_invitations
  where token_hash = encode(extensions.digest(invitation_token, 'sha256'), 'hex')
  limit 1
  for update;

  if not found then
    raise exception 'Invitation token is invalid.' using errcode = '22023';
  end if;

  if invitation_row.revoked_at is not null or invitation_row.status = 'revoked' then
    raise exception 'This invitation has been revoked.' using errcode = '22023';
  end if;

  if invitation_row.expires_at <= now() and invitation_row.status <> 'accepted' then
    raise exception 'This invitation has expired.' using errcode = '22023';
  end if;

  if lower(trim(invitation_row.email)) <> normalized_actor_email then
    raise exception 'Invitation email does not match the signed-in account.' using errcode = '22023';
  end if;

  insert into public.organization_members (organization_id, user_id, role)
  values (invitation_row.organization_id, current_user_id, invitation_row.role)
  on conflict (organization_id, user_id) do nothing;

  update public.workspace_invitations
  set
    status = 'accepted',
    accepted_at = coalesce(accepted_at, now()),
    updated_at = now()
  where id = invitation_row.id;

  return query
  select
    o.id,
    o.name,
    invitation_row.role
  from public.organizations o
  where o.id = invitation_row.organization_id;
end;
$$;

grant execute on function public.accept_workspace_invitation(text, uuid, text) to authenticated;

