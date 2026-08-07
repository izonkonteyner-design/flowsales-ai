-- WhatsApp conversation -> CRM Lead/Customer identity resolution.

alter table public.conversations
  add column if not exists customer_id uuid references public.contacts(id) on delete set null,
  add column if not exists identity_resolution_status text not null default 'UNMATCHED',
  add column if not exists identity_resolution_method text,
  add column if not exists identity_resolved_at timestamptz;

alter table public.conversations
  drop constraint if exists conversations_identity_resolution_status_check;

alter table public.conversations
  add constraint conversations_identity_resolution_status_check
  check (identity_resolution_status in (
    'MATCHED_CUSTOMER',
    'MATCHED_LEAD',
    'UNMATCHED',
    'AMBIGUOUS',
    'MANUALLY_RESOLVED'
  ));

create index if not exists conversations_org_customer_idx
  on public.conversations (organization_id, customer_id)
  where customer_id is not null;

create index if not exists conversations_org_identity_status_idx
  on public.conversations (organization_id, identity_resolution_status);

create table if not exists public.conversation_identity_resolution_audit (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  previous_customer_id uuid references public.contacts(id) on delete set null,
  previous_lead_id uuid references public.leads(id) on delete set null,
  new_customer_id uuid references public.contacts(id) on delete set null,
  new_lead_id uuid references public.leads(id) on delete set null,
  resolution_status text not null,
  resolution_method text not null,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists conversation_identity_audit_org_conversation_idx
  on public.conversation_identity_resolution_audit (organization_id, conversation_id, created_at desc);

alter table public.conversation_identity_resolution_audit enable row level security;

drop policy if exists conversation_identity_audit_select_members on public.conversation_identity_resolution_audit;
create policy conversation_identity_audit_select_members
  on public.conversation_identity_resolution_audit
  for select to authenticated
  using (public.is_org_member(organization_id));

create or replace function public.normalize_crm_phone(p_phone text)
returns text
language plpgsql
immutable
strict
as $$
declare
  v_digits text := regexp_replace(p_phone, '\\D', '', 'g');
begin
  if v_digits ~ '^05[0-9]{9}$' then
    return '90' || substr(v_digits, 2);
  elsif v_digits ~ '^5[0-9]{9}$' then
    return '90' || v_digits;
  elsif v_digits ~ '^905[0-9]{9}$' then
    return v_digits;
  end if;
  return v_digits;
end;
$$;

create or replace function public.apply_whatsapp_conversation_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact_id uuid;
  v_lead_id uuid;
  v_contact_match text;
  v_lead_match text;
  v_verified_conversion boolean := false;
begin
  if new.provider <> 'whatsapp' or new.channel_contact_id is null then
    return new;
  end if;

  -- A human decision is sticky. Repeated inbound webhook upserts must not silently undo it.
  if tg_op = 'UPDATE'
     and old.identity_resolution_status = 'MANUALLY_RESOLVED'
     and old.channel_contact_id is not distinct from new.channel_contact_id then
    new.customer_id := old.customer_id;
    new.lead_id := old.lead_id;
    new.identity_resolution_status := old.identity_resolution_status;
    new.identity_resolution_method := old.identity_resolution_method;
    new.identity_resolved_at := old.identity_resolved_at;
    return new;
  end if;

  select cc.contact_id, cc.lead_id,
         coalesce(cc.metadata->>'crm_contact_match', 'none'),
         coalesce(cc.metadata->>'lead_match', 'none')
    into v_contact_id, v_lead_id, v_contact_match, v_lead_match
    from public.channel_contacts cc
   where cc.id = new.channel_contact_id
     and cc.organization_id = new.organization_id;

  if v_contact_match = 'ambiguous' or v_lead_match = 'ambiguous' then
    new.customer_id := null;
    new.lead_id := null;
    new.identity_resolution_status := 'AMBIGUOUS';
    new.identity_resolution_method := 'phone_exact_ambiguous';
    new.identity_resolved_at := now();
    return new;
  end if;

  if v_contact_id is not null and v_lead_id is not null then
    select exists (
      select 1
        from public.leads l
        join public.contacts c on c.id = v_contact_id
       where l.id = v_lead_id
         and l.organization_id = new.organization_id
         and c.organization_id = new.organization_id
         and (l.converted_customer_id = c.id or c.source_lead_id = l.id)
    ) into v_verified_conversion;

    if v_verified_conversion then
      new.customer_id := v_contact_id;
      new.lead_id := v_lead_id;
      new.identity_resolution_status := 'MATCHED_CUSTOMER';
      new.identity_resolution_method := 'phone_exact_verified_conversion';
    else
      new.customer_id := null;
      new.lead_id := null;
      new.identity_resolution_status := 'AMBIGUOUS';
      new.identity_resolution_method := 'phone_exact_customer_lead_conflict';
    end if;
    new.identity_resolved_at := now();
    return new;
  end if;

  if v_contact_id is not null then
    new.customer_id := v_contact_id;
    new.lead_id := null;
    new.identity_resolution_status := 'MATCHED_CUSTOMER';
    new.identity_resolution_method := 'phone_exact';
    new.identity_resolved_at := now();
  elsif v_lead_id is not null then
    new.customer_id := null;
    new.lead_id := v_lead_id;
    new.identity_resolution_status := 'MATCHED_LEAD';
    new.identity_resolution_method := 'phone_exact';
    new.identity_resolved_at := now();
  else
    new.customer_id := null;
    new.lead_id := null;
    new.identity_resolution_status := 'UNMATCHED';
    new.identity_resolution_method := 'phone_exact_none';
    new.identity_resolved_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists conversations_apply_whatsapp_identity on public.conversations;
create trigger conversations_apply_whatsapp_identity
before insert or update of channel_contact_id, organization_id, provider
on public.conversations
for each row execute function public.apply_whatsapp_conversation_identity();

create or replace function public.get_whatsapp_identity_candidates(
  p_organization_id uuid,
  p_conversation_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_normalized text;
  v_customers jsonb;
  v_leads jsonb;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;

  select cc.phone_number
    into v_phone
    from public.conversations c
    join public.channel_contacts cc on cc.id = c.channel_contact_id and cc.organization_id = c.organization_id
   where c.id = p_conversation_id
     and c.organization_id = p_organization_id
     and c.provider = 'whatsapp';

  if v_phone is null then
    return jsonb_build_object('normalizedPhone', null, 'customers', '[]'::jsonb, 'leads', '[]'::jsonb);
  end if;

  v_normalized := public.normalize_crm_phone(v_phone);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'name', coalesce(c.full_name, c.email, 'Customer'),
    'phone', c.phone,
    'sourceLeadId', c.source_lead_id
  ) order by c.created_at), '[]'::jsonb)
  into v_customers
  from public.contacts c
  where c.organization_id = p_organization_id
    and public.normalize_crm_phone(coalesce(c.phone, '')) = v_normalized;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id,
    'name', coalesce(l.full_name, l.email, 'Lead'),
    'phone', l.phone,
    'status', l.status,
    'convertedCustomerId', l.converted_customer_id
  ) order by l.created_at), '[]'::jsonb)
  into v_leads
  from public.leads l
  where l.organization_id = p_organization_id
    and public.normalize_crm_phone(coalesce(l.phone, '')) = v_normalized;

  return jsonb_build_object('normalizedPhone', v_normalized, 'customers', v_customers, 'leads', v_leads);
end;
$$;

create or replace function public.resolve_whatsapp_identity_manual(
  p_organization_id uuid,
  p_conversation_id uuid,
  p_customer_id uuid,
  p_lead_id uuid,
  p_resolved_by uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_customer uuid;
  v_old_lead uuid;
  v_status text;
  v_method text;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  if p_customer_id is not null and p_lead_id is not null then raise exception 'single_manual_target_required'; end if;

  select customer_id, lead_id into v_old_customer, v_old_lead
    from public.conversations
   where id = p_conversation_id and organization_id = p_organization_id and provider = 'whatsapp'
   for update;
  if not found then raise exception 'conversation_not_found'; end if;

  if p_customer_id is not null and not exists (
    select 1 from public.contacts where id = p_customer_id and organization_id = p_organization_id
  ) then raise exception 'customer_not_found'; end if;

  if p_lead_id is not null and not exists (
    select 1 from public.leads where id = p_lead_id and organization_id = p_organization_id
  ) then raise exception 'lead_not_found'; end if;

  if p_customer_id is null and p_lead_id is null then
    v_status := 'UNMATCHED';
    v_method := 'manual_unlink';
  else
    v_status := 'MANUALLY_RESOLVED';
    v_method := case when p_customer_id is not null then 'manual_customer' else 'manual_lead' end;
  end if;

  update public.conversations
     set customer_id = p_customer_id,
         lead_id = p_lead_id,
         identity_resolution_status = v_status,
         identity_resolution_method = v_method,
         identity_resolved_at = now(),
         updated_at = now()
   where id = p_conversation_id and organization_id = p_organization_id;

  insert into public.conversation_identity_resolution_audit (
    organization_id, conversation_id, previous_customer_id, previous_lead_id,
    new_customer_id, new_lead_id, resolution_status, resolution_method, resolved_by
  ) values (
    p_organization_id, p_conversation_id, v_old_customer, v_old_lead,
    p_customer_id, p_lead_id, v_status, v_method, p_resolved_by
  );
end;
$$;

revoke all on function public.get_whatsapp_identity_candidates(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_whatsapp_identity_candidates(uuid, uuid) to service_role;
revoke all on function public.resolve_whatsapp_identity_manual(uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.resolve_whatsapp_identity_manual(uuid, uuid, uuid, uuid, uuid) to service_role;

-- Backfill existing WhatsApp conversations through the trigger without changing business state.
update public.conversations
   set channel_contact_id = channel_contact_id
 where provider = 'whatsapp';

insert into public.deployment_migrations (version, name)
values ('0038', '0038_whatsapp_crm_identity_resolution.sql')
on conflict (version) do nothing;
