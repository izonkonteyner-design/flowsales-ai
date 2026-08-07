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
  using (public.is_organization_member(organization_id));

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

-- Backfill existing WhatsApp conversations through the trigger without changing business state.
update public.conversations
   set channel_contact_id = channel_contact_id
 where provider = 'whatsapp';

insert into public.deployment_migrations (version, name)
values ('0038', '0038_whatsapp_crm_identity_resolution.sql')
on conflict (version) do nothing;
