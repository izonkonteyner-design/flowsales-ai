-- Migration 0035: WhatsApp Outbound Replies, Idempotency & Delivery Status Precedence

create table if not exists public.outbound_idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  idempotency_key text not null,
  message_id uuid references public.messages(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  constraint uq_outbound_idempotency_key unique (organization_id, conversation_id, idempotency_key)
);

alter table public.outbound_idempotency_keys enable row level security;

-- Only service_role can access idempotency keys directly
drop policy if exists "Service role access for outbound_idempotency_keys" on public.outbound_idempotency_keys;
create policy "Service role access for outbound_idempotency_keys" on public.outbound_idempotency_keys
  for all to service_role using (true) with check (true);

create or replace function public.update_message_delivery_status(
  p_organization_id uuid,
  p_provider_message_id text,
  p_new_status text,
  p_occurred_at timestamptz,
  p_error_payload jsonb default null
) returns table(updated boolean, message_id uuid, current_status text)
language plpgsql security definer set search_path = public as $$
declare
  v_msg_id uuid;
  v_current_status text;
  v_rank_new int;
  v_rank_current int;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;

  select id, status into v_msg_id, v_current_status
  from public.messages
  where organization_id = p_organization_id
    and (external_id = p_provider_message_id or metadata->>'provider_message_id' = p_provider_message_id)
  limit 1;

  if v_msg_id is null then
    return query select false, null::uuid, null::text;
    return;
  end if;

  -- Precedence rank: pending=1, accepted=2, sent=3, delivered=4, read=5, failed=99
  v_rank_new := case p_new_status
    when 'pending' then 1
    when 'accepted' then 2
    when 'sent' then 3
    when 'delivered' then 4
    when 'read' then 5
    when 'failed' then 99
    else 0
  end;

  v_rank_current := case v_current_status
    when 'pending' then 1
    when 'accepted' then 2
    when 'sent' then 3
    when 'delivered' then 4
    when 'read' then 5
    when 'failed' then 99
    else 0
  end;

  -- Do not downgrade if current status is read (5) and new status is lower (e.g. sent=3, delivered=4)
  if v_rank_current >= 5 and p_new_status in ('sent', 'delivered', 'accepted', 'pending') then
    return query select false, v_msg_id, v_current_status;
    return;
  end if;

  -- Do not overwrite read state with failed unless current status is not read
  if v_rank_current >= 5 and p_new_status = 'failed' then
    return query select false, v_msg_id, v_current_status;
    return;
  end if;

  if v_rank_new >= v_rank_current or p_new_status = 'failed' then
    update public.messages
    set status = p_new_status,
        metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_error_payload, '{}'::jsonb),
        updated_at = now()
    where id = v_msg_id;
    return query select true, v_msg_id, p_new_status;
  else
    return query select false, v_msg_id, v_current_status;
  end if;
end;
$$;

revoke all on function public.update_message_delivery_status(uuid,text,text,timestamptz,jsonb) from public, anon, authenticated;
grant execute on function public.update_message_delivery_status(uuid,text,text,timestamptz,jsonb) to service_role;

insert into public.deployment_migrations (version, name, checksum)
values ('0035', '0035_whatsapp_outbound_replies.sql', 'c5a9b71d6f284e31a0e826b0147e8a92')
on conflict (version) do update set name = excluded.name, executed_at = now();
