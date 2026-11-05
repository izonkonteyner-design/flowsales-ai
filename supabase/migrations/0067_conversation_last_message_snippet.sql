-- The Omnichannel Inbox list (WhatsApp/Instagram/Facebook) previously rendered its
-- preview snippet by fetching every message row for every matched conversation on
-- every page load, then picking the latest one in application code. That scan grows
-- with total message history per organization, not with the number of conversations
-- shown, which made the inbox list open slowly as message volume increased.
--
-- This migration denormalizes a `last_message_snippet` onto `conversations` so the
-- list can read it directly, and updates the WhatsApp inbound RPC to keep it current.
-- Instagram/Facebook (meta-messaging.ts) and outbound WhatsApp sends (whatsapp-outbound.ts,
-- whatsapp-template-service.ts) are updated in the same change to write this column too.

alter table public.conversations
  add column if not exists last_message_snippet text;

-- Backfill existing conversations from message history, newest message per conversation.
update public.conversations c
   set last_message_snippet = coalesce(latest.body, '[Medya]')
  from (
    select distinct on (conversation_id) conversation_id, body
      from public.messages
     order by conversation_id, sent_at desc nulls last, created_at desc
  ) latest
 where latest.conversation_id = c.id
   and c.last_message_snippet is null;

create or replace function public.persist_whatsapp_inbound_message(
  p_organization_id uuid, p_connection_id uuid, p_external_message_id text,
  p_sender_external_id text, p_sender_name text, p_message_type text, p_body text,
  p_occurred_at timestamptz, p_metadata jsonb, p_attachment jsonb default null
) returns table(message_id uuid, conversation_id uuid, duplicate boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_contact_id uuid; v_crm_contact_id uuid; v_lead_id uuid;
  v_conversation_id uuid; v_message_id uuid;
  v_crm_contact_matches integer; v_lead_matches integer;
  v_normalized_sender text; v_snippet text;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  if not exists (
    select 1 from channel_connections where id = p_connection_id
      and organization_id = p_organization_id and provider = 'whatsapp' and status = 'connected'
  ) then raise exception 'active_connection_required'; end if;

  select id into v_message_id from messages
   where organization_id = p_organization_id and provider = 'whatsapp'
     and external_id = p_external_message_id;
  if v_message_id is not null then
    select m.conversation_id into v_conversation_id from messages m where m.id = v_message_id;
    return query select v_message_id, v_conversation_id, true;
    return;
  end if;

  v_normalized_sender := public.normalize_crm_phone(p_sender_external_id);
  v_snippet := coalesce(p_body, case when p_attachment is not null then '[Medya]' else null end);

  select count(*), case when count(*) = 1 then (array_agg(id order by id))[1] else null end
    into v_crm_contact_matches, v_crm_contact_id from contacts
   where organization_id = p_organization_id
     and public.normalize_crm_phone(coalesce(phone, '')) = v_normalized_sender;
  select count(*), case when count(*) = 1 then (array_agg(id order by id))[1] else null end
    into v_lead_matches, v_lead_id from leads
   where organization_id = p_organization_id
     and public.normalize_crm_phone(coalesce(phone, '')) = v_normalized_sender;

  insert into channel_contacts (organization_id, provider, external_id, display_name, phone_number, contact_id, lead_id, metadata)
  values (p_organization_id, 'whatsapp', p_sender_external_id, p_sender_name, p_sender_external_id,
    v_crm_contact_id, v_lead_id,
    jsonb_build_object(
      'crm_contact_match', case when v_crm_contact_matches > 1 then 'ambiguous' when v_crm_contact_matches = 1 then 'matched' else 'none' end,
      'lead_match', case when v_lead_matches > 1 then 'ambiguous' when v_lead_matches = 1 then 'matched' else 'none' end,
      'normalized_phone', v_normalized_sender))
  on conflict (organization_id, provider, external_id) do update set
    display_name = coalesce(excluded.display_name, channel_contacts.display_name),
    phone_number = excluded.phone_number,
    contact_id = case
      when excluded.metadata->>'crm_contact_match' = 'ambiguous' then null
      when excluded.metadata->>'crm_contact_match' = 'none' then null
      else excluded.contact_id
    end,
    lead_id = case
      when excluded.metadata->>'lead_match' = 'ambiguous' then null
      when excluded.metadata->>'lead_match' = 'none' then null
      else excluded.lead_id
    end,
    metadata = channel_contacts.metadata || excluded.metadata,
    updated_at = now()
  returning id into v_contact_id;

  insert into conversations (organization_id, connection_id, provider, external_id, channel_contact_id, lead_id, status, last_message_at, last_message_snippet, unread_count)
  values (p_organization_id, p_connection_id, 'whatsapp', p_sender_external_id, v_contact_id, v_lead_id, 'open', p_occurred_at, v_snippet, 1)
  on conflict (organization_id, provider, external_id) do update set
    connection_id = excluded.connection_id,
    channel_contact_id = excluded.channel_contact_id,
    status = 'open',
    last_message_at = greatest(coalesce(conversations.last_message_at, excluded.last_message_at), excluded.last_message_at),
    last_message_snippet = v_snippet,
    unread_count = conversations.unread_count + 1,
    updated_at = now()
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
