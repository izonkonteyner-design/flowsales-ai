-- Align omnichannel inbox contact projection with the production schema.

alter table public.channel_contacts
  add column if not exists avatar_url text;

insert into public.deployment_migrations(version,name,checksum)
values ('0043','0043_channel_contact_avatar.sql','channel-contact-avatar-v1')
on conflict (version) do update set name=excluded.name, checksum=excluded.checksum, executed_at=now();
