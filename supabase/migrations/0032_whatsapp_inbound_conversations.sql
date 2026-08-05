-- Atomic, organization-scoped WhatsApp inbound persistence.
alter table public.conversations
  add column if not exists unread_count integer not null default 0 check (unread_count >= 0);

create or replace function public.persist_whatsapp_inbound_message(
  p_organization_id uuid,
  p_connection_id uuid,
  p_external_message_id text,
  p_sender_external_id text,
  p_sender_name text,
  p_message_type text,
  p_body text,
  p_occurred_at timestamptz,
  p_metadata jsonb,
  p_attachment jsonb default null
) returns table(message_id uuid, conversation_id uuid, duplicate boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_contact_id uuid;
  v_crm_contact_id uuid;
  v_lead_id uuid;
  v_conversation_id uuid;
  v_message_id uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  if not exists (
    select 1 from channel_connections
    where id = p_connection_id and organization_id = p_organization_id
      and provider = 'whatsapp' and status = 'connected'
  ) then raise exception 'active_connection_required'; end if;

  select id into v_message_id from messages
   where organization_id = p_organization_id and provider = 'whatsapp'
     and external_id = p_external_message_id;
  if v_message_id is not null then
    select m.conversation_id into v_conversation_id from messages m where m.id = v_message_id;
    return query select v_message_id, v_conversation_id, true;
    return;
  end if;

  select id into v_crm_contact_id from contacts
   where organization_id = p_organization_id
     and regexp_replace(coalesce(phone, ''), '\\D', '', 'g') = regexp_replace(p_sender_external_id, '\\D', '', 'g')
   order by created_at asc limit 1;
  select id into v_lead_id from leads
   where organization_id = p_organization_id
     and regexp_replace(coalesce(phone, ''), '\\D', '', 'g') = regexp_replace(p_sender_external_id, '\\D', '', 'g')
   order by created_at asc limit 1;

  insert into channel_contacts (organization_id, provider, external_id, display_name, phone_number, contact_id, lead_id)
  values (p_organization_id, 'whatsapp', p_sender_external_id, p_sender_name, p_sender_external_id, v_crm_contact_id, v_lead_id)
  on conflict (organization_id, provider, external_id) do update set
    display_name = coalesce(excluded.display_name, channel_contacts.display_name),
    contact_id = coalesce(channel_contacts.contact_id, excluded.contact_id),
    lead_id = coalesce(channel_contacts.lead_id, excluded.lead_id), updated_at = now()
  returning id into v_contact_id;

  insert into conversations (organization_id, connection_id, provider, external_id, channel_contact_id, lead_id, status, last_message_at, unread_count)
  values (p_organization_id, p_connection_id, 'whatsapp', p_sender_external_id, v_contact_id, v_lead_id, 'open', p_occurred_at, 1)
  on conflict (organization_id, provider, external_id) do update set
    connection_id = excluded.connection_id, channel_contact_id = excluded.channel_contact_id,
    lead_id = coalesce(conversations.lead_id, excluded.lead_id), status = 'open',
    last_message_at = greatest(coalesce(conversations.last_message_at, excluded.last_message_at), excluded.last_message_at),
    unread_count = conversations.unread_count + 1, updated_at = now()
  returning id into v_conversation_id;

  insert into messages (organization_id, conversation_id, provider, external_id, direction, message_type, body, sender_contact_id, status, metadata, sent_at)
  values (p_organization_id, v_conversation_id, 'whatsapp', p_external_message_id, 'inbound', p_message_type, p_body, v_contact_id, 'delivered', coalesce(p_metadata, '{}'::jsonb), p_occurred_at)
  returning id into v_message_id;

  if p_attachment is not null then
    insert into message_attachments (organization_id, message_id, attachment_type, mime_type, file_name, external_url, metadata)
    values (p_organization_id, v_message_id, p_attachment->>'type', p_attachment->>'mimeType', p_attachment->>'fileName', null,
      coalesce(p_attachment->'metadata', '{}'::jsonb) || jsonb_build_object('provider_media_id', p_attachment->>'externalId'));
  end if;
  return query select v_message_id, v_conversation_id, false;
end;
$$;

revoke all on function public.persist_whatsapp_inbound_message(uuid,uuid,text,text,text,text,text,timestamptz,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.persist_whatsapp_inbound_message(uuid,uuid,text,text,text,text,text,timestamptz,jsonb,jsonb) to service_role;

insert into public.deployment_migrations (version, name, checksum)
values ('0032', '0032_whatsapp_inbound_conversations.sql', 'b4db356f9b8650fc78956ad1ac9c54e1')
on conflict (version) do update set name = excluded.name, executed_at = now();
