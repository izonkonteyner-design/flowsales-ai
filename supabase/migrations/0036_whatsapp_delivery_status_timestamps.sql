-- Migration 0036: WhatsApp Delivery & Read Status Timestamps and Monotonic Precedence
-- Enhances update_message_delivery_status to record sent_at, delivered_at, read_at, failed_at, error_code

create or replace function public.update_message_delivery_status(
  p_organization_id uuid,
  p_provider_message_id text,
  p_new_status text,
  p_occurred_at timestamptz default null,
  p_error_payload jsonb default null
) returns table(updated boolean, message_id uuid, current_status text)
language plpgsql security definer set search_path = public as $$
declare
  v_msg_id uuid;
  v_current_status text;
  v_rank_new int;
  v_rank_current int;
  v_err_code text;
  v_occurred timestamptz;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;

  v_occurred := coalesce(p_occurred_at, now());

  select id, status into v_msg_id, v_current_status
  from public.messages
  where organization_id = p_organization_id
    and (external_id = p_provider_message_id or metadata->>'provider_message_id' = p_provider_message_id)
  limit 1;

  if v_msg_id is null then
    return query select false, null::uuid, null::text;
    return;
  end if;

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

  -- Monotonic progression safeguards:
  -- 1. If current status is read (5) and new status is lower (e.g. sent=3, delivered=4, accepted=2, pending=1), ignore.
  if v_rank_current >= 5 and p_new_status in ('sent', 'delivered', 'accepted', 'pending') then
    return query select false, v_msg_id, v_current_status;
    return;
  end if;

  -- 2. If current status is delivered (4) and new status is sent (3), accepted (2), or pending (1), ignore.
  if v_rank_current >= 4 and p_new_status in ('sent', 'accepted', 'pending') then
    return query select false, v_msg_id, v_current_status;
    return;
  end if;

  -- 3. If current status is read (5) and new status is failed, ignore (read message cannot become failed).
  if v_rank_current >= 5 and p_new_status = 'failed' then
    return query select false, v_msg_id, v_current_status;
    return;
  end if;

  if p_error_payload is not null and p_error_payload->>'error_code' is not null then
    v_err_code := p_error_payload->>'error_code';
  else
    v_err_code := null;
  end if;

  if v_rank_new >= v_rank_current or p_new_status = 'failed' then
    update public.messages
    set status = p_new_status,
        sent_at = case when p_new_status = 'sent' and sent_at is null then v_occurred else sent_at end,
        delivered_at = case when p_new_status = 'delivered' and delivered_at is null then v_occurred else delivered_at end,
        read_at = case when p_new_status = 'read' and read_at is null then v_occurred else read_at end,
        failed_at = case when p_new_status = 'failed' and failed_at is null then v_occurred else failed_at end,
        error_code = coalesce(v_err_code, error_code),
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
values ('0036', '0036_whatsapp_delivery_status_timestamps.sql', 'e3b8a1c92d54f67890123456789abcdef')
on conflict (version) do update set name = excluded.name, executed_at = now();
