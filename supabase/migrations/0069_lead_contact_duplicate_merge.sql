-- Duplicate detection & merge workflow for leads and contacts (customers).
--
-- Roadmap: Priority 2 — CRM workflow depth #5 ("Add duplicate detection and
-- merge workflows for leads and customers"). This is distinct from
-- `normalizeCustomerDuplicateKey` in server/services/crm-integration.ts,
-- which only prevents creating a *new* duplicate customer at the moment of
-- lead-conversion. Here, two (or more) already-existing `leads` or
-- `contacts` rows in the same workspace are merged into one canonical row,
-- re-pointing every dependent foreign key so history (quotes, activities,
-- tasks, conversations, voice calls, AI runs, etc.) is preserved on the
-- canonical record before the duplicate row is deleted.
--
-- NOTE on migration numbering: this file was originally assigned "0065",
-- but supabase/migrations/0065_enterprise_strategic_modules.sql (and
-- 0066_orchestration_maestro_foundation.sql) already occupy that slot on
-- this branch, including a deployment_migrations row keyed version='0065'.
-- The task owner confirmed 0067 and 0068 are claimed by sibling agents, so
-- this migration uses the next free slot, 0069, to avoid corrupting the
-- deployment_migrations history or colliding with parallel work.

create or replace function public.merge_duplicate_records(
  p_organization_id uuid,
  p_entity_type text,
  p_canonical_id uuid,
  p_duplicate_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_canonical_org uuid;
  v_duplicate_org uuid;
  v_canonical_name text;
  v_duplicate_name text;
begin
  if p_entity_type not in ('lead', 'contact') then
    raise exception 'Invalid entity type';
  end if;

  if p_canonical_id is null or p_duplicate_id is null then
    raise exception 'canonical and duplicate ids are required';
  end if;

  if p_canonical_id = p_duplicate_id then
    raise exception 'Canonical and duplicate records must differ';
  end if;

  -- Only owner/admin/manager may merge; sales_rep/sales/viewer are rejected.
  if not public.has_org_permission(p_organization_id, 'manage_pipeline') then
    raise exception 'Not authorized';
  end if;

  if public.is_demo_organization(p_organization_id) then
    raise exception 'Demo workspace is read-only';
  end if;

  if p_entity_type = 'lead' then
    select organization_id, full_name into v_canonical_org, v_canonical_name
      from public.leads where id = p_canonical_id for update;
    select organization_id, full_name into v_duplicate_org, v_duplicate_name
      from public.leads where id = p_duplicate_id for update;
  else
    select organization_id, full_name into v_canonical_org, v_canonical_name
      from public.contacts where id = p_canonical_id for update;
    select organization_id, full_name into v_duplicate_org, v_duplicate_name
      from public.contacts where id = p_duplicate_id for update;
  end if;

  if v_canonical_org is null or v_duplicate_org is null then
    raise exception 'Record not found';
  end if;

  -- Reject cross-workspace merges: both records must belong to the caller's
  -- own organization, which has_org_permission has already authorized.
  if v_canonical_org <> p_organization_id or v_duplicate_org <> p_organization_id then
    raise exception 'Record does not belong to this organization';
  end if;

  if p_entity_type = 'lead' then
    -- Fill gaps on the canonical lead from the duplicate before the
    -- duplicate's own columns disappear.
    update public.leads l
    set company = coalesce(l.company, d.company),
        email = coalesce(l.email, d.email),
        phone = coalesce(l.phone, d.phone),
        city = coalesce(l.city, d.city),
        notes = case
          when l.notes is null or l.notes = '' then d.notes
          when d.notes is null or d.notes = '' then l.notes
          else l.notes || E'\n---\n' || d.notes
        end
    from public.leads d
    where l.id = p_canonical_id and d.id = p_duplicate_id;

    -- Re-point every foreign key referencing leads(id) from the duplicate
    -- to the canonical row (exhaustive as of this migration):
    update public.quotes set lead_id = p_canonical_id where lead_id = p_duplicate_id;
    update public.activities set lead_id = p_canonical_id where lead_id = p_duplicate_id;
    update public.tasks set lead_id = p_canonical_id where lead_id = p_duplicate_id;
    update public.contacts set source_lead_id = p_canonical_id where source_lead_id = p_duplicate_id;
    update public.ai_runs set lead_id = p_canonical_id where lead_id = p_duplicate_id;
    update public.ai_approval_requests set lead_id = p_canonical_id where lead_id = p_duplicate_id;
    update public.channel_contacts set lead_id = p_canonical_id where lead_id = p_duplicate_id;
    update public.conversations set lead_id = p_canonical_id where lead_id = p_duplicate_id;
    update public.lead_source_events set lead_id = p_canonical_id where lead_id = p_duplicate_id;
    update public.conversation_identity_resolution_audit set previous_lead_id = p_canonical_id where previous_lead_id = p_duplicate_id;
    update public.conversation_identity_resolution_audit set new_lead_id = p_canonical_id where new_lead_id = p_duplicate_id;
    update public.conversation_ai_qualifications set lead_id = p_canonical_id where lead_id = p_duplicate_id;
    update public.sales_follow_up_plans set lead_id = p_canonical_id where lead_id = p_duplicate_id;
    update public.calendar_events set lead_id = p_canonical_id where lead_id = p_duplicate_id;
    update public.sales_sessions set lead_id = p_canonical_id where lead_id = p_duplicate_id;
    update public.voice_calls set lead_id = p_canonical_id where lead_id = p_duplicate_id;
    update public.voice_handoffs set lead_id = p_canonical_id where lead_id = p_duplicate_id;
    update public.sales_callback_queue set lead_id = p_canonical_id where lead_id = p_duplicate_id;
    update public.sales_call_dispositions set lead_id = p_canonical_id where lead_id = p_duplicate_id;
    update public.lead_intent_history set lead_id = p_canonical_id where lead_id = p_duplicate_id;
    update public.sales_sequence_enrollments set lead_id = p_canonical_id where lead_id = p_duplicate_id;
    update public.sales_automation_drafts set lead_id = p_canonical_id where lead_id = p_duplicate_id;
    update public.sales_growth_opportunities set lead_id = p_canonical_id where lead_id = p_duplicate_id;
    update public.email_threads set lead_id = p_canonical_id where lead_id = p_duplicate_id;
    update public.customer_memories set lead_id = p_canonical_id where lead_id = p_duplicate_id;

    -- ad_attributions has UNIQUE(organization_id, lead_id) with lead_id NOT
    -- NULL: if the canonical lead already owns an attribution row, drop the
    -- duplicate's row instead of violating the unique constraint; otherwise
    -- repoint it onto the canonical lead.
    delete from public.ad_attributions
      where lead_id = p_duplicate_id
        and exists (select 1 from public.ad_attributions where lead_id = p_canonical_id);
    update public.ad_attributions set lead_id = p_canonical_id where lead_id = p_duplicate_id;

    insert into public.app_audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
    values (
      p_organization_id,
      auth.uid(),
      'lead.merge',
      'lead',
      p_canonical_id::text,
      jsonb_build_object(
        'canonicalId', p_canonical_id,
        'duplicateId', p_duplicate_id,
        'canonicalName', v_canonical_name,
        'duplicateName', v_duplicate_name,
        'note', p_note,
        'mergedAt', now()
      )
    );

    delete from public.leads where id = p_duplicate_id and organization_id = p_organization_id;
  else
    update public.contacts c
    set company = coalesce(c.company, d.company),
        email = coalesce(c.email, d.email),
        phone = coalesce(c.phone, d.phone),
        city = coalesce(c.city, d.city),
        notes = case
          when c.notes is null or c.notes = '' then d.notes
          when d.notes is null or d.notes = '' then c.notes
          else c.notes || E'\n---\n' || d.notes
        end
    from public.contacts d
    where c.id = p_canonical_id and d.id = p_duplicate_id;

    -- Re-point every foreign key referencing contacts(id) from the
    -- duplicate to the canonical row (exhaustive as of this migration):
    update public.quotes set customer_id = p_canonical_id where customer_id = p_duplicate_id;
    update public.leads set converted_customer_id = p_canonical_id where converted_customer_id = p_duplicate_id;
    update public.channel_contacts set contact_id = p_canonical_id where contact_id = p_duplicate_id;
    update public.conversations set customer_id = p_canonical_id where customer_id = p_duplicate_id;
    update public.conversation_identity_resolution_audit set previous_customer_id = p_canonical_id where previous_customer_id = p_duplicate_id;
    update public.conversation_identity_resolution_audit set new_customer_id = p_canonical_id where new_customer_id = p_duplicate_id;
    update public.sales_sessions set customer_id = p_canonical_id where customer_id = p_duplicate_id;
    update public.voice_calls set customer_id = p_canonical_id where customer_id = p_duplicate_id;
    update public.sales_growth_opportunities set customer_id = p_canonical_id where customer_id = p_duplicate_id;
    update public.email_threads set contact_id = p_canonical_id where contact_id = p_duplicate_id;
    update public.customer_memories set customer_id = p_canonical_id where customer_id = p_duplicate_id;

    insert into public.app_audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
    values (
      p_organization_id,
      auth.uid(),
      'contact.merge',
      'contact',
      p_canonical_id::text,
      jsonb_build_object(
        'canonicalId', p_canonical_id,
        'duplicateId', p_duplicate_id,
        'canonicalName', v_canonical_name,
        'duplicateName', v_duplicate_name,
        'note', p_note,
        'mergedAt', now()
      )
    );

    delete from public.contacts where id = p_duplicate_id and organization_id = p_organization_id;
  end if;

  return jsonb_build_object(
    'entityType', p_entity_type,
    'canonicalId', p_canonical_id,
    'duplicateId', p_duplicate_id
  );
end;
$$;

revoke all on function public.merge_duplicate_records(uuid, text, uuid, uuid, text) from public;
grant execute on function public.merge_duplicate_records(uuid, text, uuid, uuid, text) to authenticated;

insert into public.deployment_migrations(version, name, checksum)
values ('0069', '0069_lead_contact_duplicate_merge.sql', 'lead-contact-duplicate-merge-2026-11-04')
on conflict (version) do update set name = excluded.name, checksum = excluded.checksum, executed_at = now();
