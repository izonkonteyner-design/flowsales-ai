-- 0044_inbox_conversation_fields.sql
-- Align the production conversation schema with the omnichannel Inbox repository.

alter table public.conversations
  add column if not exists assigned_user_id uuid references auth.users(id) on delete set null,
  add column if not exists unread_count integer not null default 0;

create index if not exists conversations_assigned_user_idx
  on public.conversations (organization_id, assigned_user_id, last_message_at desc);

-- Inbox supports open/pending/resolved/closed. Preserve legacy archived rows while
-- allowing the current workflow states used by the application.
alter table public.conversations
  drop constraint if exists conversations_status_check;

alter table public.conversations
  add constraint conversations_status_check
  check (status in ('open', 'pending', 'resolved', 'closed', 'archived'));

insert into public.deployment_migrations(version,name,checksum)
values ('0044','0044_inbox_conversation_fields.sql','inbox-conversation-fields-v1')
on conflict (version) do update
set name=excluded.name, checksum=excluded.checksum, executed_at=now();
