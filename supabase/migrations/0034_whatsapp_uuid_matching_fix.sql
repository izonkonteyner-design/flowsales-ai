-- PostgreSQL does not define min(uuid). Keep ambiguous normalized-phone matching fail-closed
-- while selecting the sole UUID through an ordered aggregate.
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

  select count(*), case when count(*) = 1 then (array_agg(id order by id))[1] else null end
    into v_crm_contact_matches, v_crm_contact_id from contacts
   where organization_id = p_organization_id
     and regexp_replace(coalesce(phone, ''), '\\D', '', 'g') = regexp_replace(p_sender_external_id, '\\D', '', 'g');
  select count(*), case when count(*) = 1 then (array_agg(id order by id))[1] else null end
    into v_lead_matches, v_lead_id from leads
   where organization_id = p_organization_id
     and regexp_replace(coalesce(phone, ''), '\\D', '', 'g') = regexp_replace(p_sender_external_id, '\\D', '', 'g');

  insert into channel_contacts (organization_id, provider, external_id, display_name, phone_number, contact_id, lead_id, metadata)
  values (p_organization_id, 'whatsapp', p_sender_external_id, p_sender_name, p_sender_external_id,
    v_crm_contact_id, v_lead_id,
    jsonb_build_object(
      'crm_contact_match', case when v_crm_contact_matches > 1 then 'ambiguous' when v_crm_contact_matches = 1 then 'matched' else 'none' end,
      'lead_match', case when v_lead_matches > 1 then 'ambiguous' when v_lead_matches = 1 then 'matched' else 'none' end))
  on conflict (organization_id, provider, external_id) do update set
    display_name = coalesce(excluded.display_name, channel_contacts.display_name),
    contact_id = case when excluded.metadata->>'crm_contact_match' = 'ambiguous' then null else coalesce(channel_contacts.contact_id, excluded.contact_id) end,
    lead_id = case when excluded.metadata->>'lead_match' = 'ambiguous' then null else coalesce(channel_contacts.lead_id, excluded.lead_id) end,
    metadata = channel_contacts.metadata || excluded.metadata, updated_at = now()
  returning id into v_contact_id;

  insert into conversations (organization_id, connection_id, provider, external_id, channel_contact_id, lead_id, status, last_message_at, unread_count)
  values (p_organization_id, p_connection_id, 'whatsapp', p_sender_external_id, v_contact_id, v_lead_id, 'open', p_occurred_at, 1)
  on conflict (organization_id, provider, external_id) do update set
    connection_id = excluded.connection_id, channel_contact_id = excluded.channel_contact_id,
    lead_id = case when v_lead_matches > 1 then null else coalesce(conversations.lead_id, excluded.lead_id) end,
    status = 'open',
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

create or replace function public.deployment_readiness()
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_missing_functions text[] := array[]::text[]; v_missing_tables text[] := array[]::text[];
  v_latest_version text; v_required_version constant text := '0034'; v_function text; v_table text;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  foreach v_function in array array[
    'health_check','join_demo_workspace','check_demo_rate_limit','is_demo_organization',
    'can_review_ai_approvals','check_workspace_entitlement','record_ai_usage',
    'create_user_notification','get_operational_alerts','resolve_operational_alert',
    'get_ai_quality_dashboard','persist_whatsapp_inbound_message'
  ] loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=v_function)
    then v_missing_functions := array_append(v_missing_functions, v_function); end if;
  end loop;
  foreach v_table in array array[
    'ai_runs','ai_approval_requests','ai_approval_events','workspace_entitlements',
    'ai_usage_monthly','notifications','organization_invitations','import_jobs',
    'billing_events','account_lifecycle_requests','deployment_migrations',
    'operational_alert_resolutions','ai_run_feedback','ai_evaluation_runs',
    'channel_connections','channel_accounts','channel_contacts','conversations','messages','webhook_events'
  ] loop
    if to_regclass(format('public.%I', v_table)) is null then v_missing_tables := array_append(v_missing_tables, v_table); end if;
  end loop;
  select max(version) into v_latest_version from deployment_migrations;
  return jsonb_build_object(
    'ready', coalesce(v_latest_version,'') >= v_required_version and cardinality(v_missing_functions)=0 and cardinality(v_missing_tables)=0,
    'latestMigration', v_latest_version, 'requiredMigration', v_required_version,
    'missingFunctions', to_jsonb(v_missing_functions), 'missingTables', to_jsonb(v_missing_tables));
end;
$$;
revoke all on function public.deployment_readiness() from public, anon, authenticated;
grant execute on function public.deployment_readiness() to service_role;

insert into public.deployment_migrations (version, name, checksum)
values ('0034', '0034_whatsapp_uuid_matching_fix.sql', 'uuid-safe-single-match-v1')
on conflict (version) do update set name = excluded.name, executed_at = now();
