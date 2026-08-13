-- Link CRM-associated email messages to the lead activity timeline.
-- email_threads already stores the CRM match (lead_id/contact_id) during email sync.
-- This migration makes that relationship visible in the existing CRM activity timeline.

create or replace function public.record_email_crm_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_thread record;
  activity_title text;
  activity_detail text;
begin
  select et.lead_id, et.participant_email, et.subject
    into matched_thread
  from public.email_threads et
  where et.id = new.thread_id
    and et.organization_id = new.organization_id;

  if matched_thread.lead_id is null then
    return new;
  end if;

  if new.direction = 'inbound' then
    activity_title := 'E-posta alındı';
  else
    activity_title := 'E-posta gönderildi';
  end if;

  activity_detail := format(
    '%s · %s · external_message_id=%s',
    activity_title,
    coalesce(new.subject, '(Konu yok)'),
    new.external_message_id
  );

  -- email_messages has a unique connection/message id, so this trigger runs
  -- only for a newly inserted external message. Keep the guard for safe
  -- replays/backfills and future trigger changes.
  if not exists (
    select 1
    from public.activities a
    where a.organization_id = new.organization_id
      and a.lead_id = matched_thread.lead_id
      and a.type = 'email'
      and a.detail = activity_detail
  ) then
    insert into public.activities (
      organization_id,
      lead_id,
      type,
      title,
      detail,
      created_at,
      updated_at
    ) values (
      new.organization_id,
      matched_thread.lead_id,
      'email',
      activity_title,
      activity_detail,
      coalesce(new.sent_at, now()),
      now()
    );
  end if;

  return new;
end;
$$;

drop trigger if exists email_messages_crm_activity on public.email_messages;
create trigger email_messages_crm_activity
after insert on public.email_messages
for each row
execute function public.record_email_crm_activity();

-- Backfill messages already synced before this fix so existing CRM-linked
-- emails also appear in the lead timeline.
insert into public.activities (
  organization_id,
  lead_id,
  type,
  title,
  detail,
  created_at,
  updated_at
)
select
  em.organization_id,
  et.lead_id,
  'email',
  case when em.direction = 'inbound' then 'E-posta alındı' else 'E-posta gönderildi' end,
  format(
    '%s · %s · external_message_id=%s',
    case when em.direction = 'inbound' then 'E-posta alındı' else 'E-posta gönderildi' end,
    coalesce(em.subject, '(Konu yok)'),
    em.external_message_id
  ),
  coalesce(em.sent_at, em.created_at),
  now()
from public.email_messages em
join public.email_threads et
  on et.id = em.thread_id
 and et.organization_id = em.organization_id
where et.lead_id is not null
  and not exists (
    select 1
    from public.activities a
    where a.organization_id = em.organization_id
      and a.lead_id = et.lead_id
      and a.type = 'email'
      and a.detail = format(
        '%s · %s · external_message_id=%s',
        case when em.direction = 'inbound' then 'E-posta alındı' else 'E-posta gönderildi' end,
        coalesce(em.subject, '(Konu yok)'),
        em.external_message_id
      )
  );

insert into public.deployment_migrations (version, name)
values ('0054', 'email_crm_activities')
on conflict (version) do update set name = excluded.name;
