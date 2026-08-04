-- 0027_omnichannel_foundation.sql
-- FlowSales AI: Omnichannel Integrations Foundation
--
-- Creates 13 tables for the omnichannel integration layer:
--   1.  channel_connections      – OAuth connection state per provider per org
--   2.  channel_accounts         – Normalized provider account details
--   3.  channel_contacts         – Cross-channel contact identity
--   4.  conversations            – Conversation threads
--   5.  conversation_participants – Participants in a conversation
--   6.  messages                 – Individual messages
--   7.  message_attachments      – Attachment metadata
--   8.  message_delivery_events  – Delivery/read receipt events
--   9.  webhook_events           – Incoming webhook events (idempotent)
--   10. integration_tokens       – Encrypted-ready token storage (server-only)
--   11. integration_sync_jobs    – Background sync job tracking
--   12. lead_source_events       – Lead attribution from channels
--   13. oauth_states             – Short-lived single-use CSRF/PKCE state (server-only)
--
-- Security model:
--   - RLS enabled on every table.
--   - Workspace isolation via organization_id on all tenant tables.
--   - Demo org (d3e00000-0000-0000-0000-000000000000) blocked from mutations.
--   - integration_tokens: only service_role can read token values.
--   - oauth_states: only service_role can read/write; no anon/authenticated access.
--   - Viewer role: read-only on channel_connections; cannot manage.
--   - Owner/admin: full management of connections.
--   - webhook_events: unique (provider, external_event_id) for idempotency.
--   - channel_connections: soft-disconnect via status field, no hard deletes.
--   - No DROP TABLE. No CASCADE drops. All ADD COLUMN uses IF NOT EXISTS.
--   - Rollback notes at bottom.

-- ============================================================================
-- 0. Helper: is_demo_organization already exists from 0017 / 0018 chain.
--    We rely on it; do not redefine.
-- ============================================================================

-- ============================================================================
-- 1. channel_connections
-- ============================================================================

create table if not exists public.channel_connections (
  id                uuid        primary key default gen_random_uuid(),
  organization_id   uuid        not null references public.organizations(id) on delete cascade,
  provider          text        not null check (provider in ('whatsapp', 'instagram', 'facebook', 'google', 'tiktok')),
  status            text        not null default 'not_connected'
                                check (status in ('not_connected', 'connecting', 'connected', 'expired', 'error', 'revoked')),
  -- Display / audit
  display_name      text,
  external_account_id text,
  scopes            text[]      not null default '{}',
  error_message     text,
  -- Soft-disconnect: last_connected_at and disconnected_at track lifecycle
  last_connected_at timestamptz,
  last_synced_at    timestamptz,
  disconnected_at   timestamptz,
  disconnected_by   uuid        references auth.users(id) on delete set null,
  -- Audit
  created_by        uuid        references auth.users(id) on delete set null,
  updated_by        uuid        references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- One connection row per provider per org (soft-revoked rows can coexist via status)
  constraint channel_connections_org_provider_unique unique (organization_id, provider)
);

alter table public.channel_connections enable row level security;

-- Indexes
create index if not exists channel_connections_org_idx
  on public.channel_connections (organization_id, provider, status);

-- RLS: members can read their org's connections
create policy "members_read_channel_connections"
  on public.channel_connections for select
  using (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = channel_connections.organization_id
        and om.user_id = auth.uid()
    )
  );

-- RLS: owner/admin can insert – demo org blocked
create policy "owner_admin_insert_channel_connections"
  on public.channel_connections for insert
  with check (
    organization_id <> 'd3e00000-0000-0000-0000-000000000000'::uuid
    and exists (
      select 1 from public.organization_members om
      where om.organization_id = channel_connections.organization_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin')
    )
  );

-- RLS: owner/admin can update – demo org blocked
create policy "owner_admin_update_channel_connections"
  on public.channel_connections for update
  using (
    organization_id <> 'd3e00000-0000-0000-0000-000000000000'::uuid
    and exists (
      select 1 from public.organization_members om
      where om.organization_id = channel_connections.organization_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin')
    )
  );

-- RLS: no direct delete; use status = 'revoked' (soft disconnect)
-- Hard deletes are service_role only (no authenticated policy for delete).

-- updated_at trigger
create or replace function public.set_channel_connections_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_channel_connections_updated_at on public.channel_connections;
create trigger trg_channel_connections_updated_at
  before update on public.channel_connections
  for each row execute function public.set_channel_connections_updated_at();

-- ============================================================================
-- 2. channel_accounts
-- ============================================================================

create table if not exists public.channel_accounts (
  id                uuid        primary key default gen_random_uuid(),
  organization_id   uuid        not null references public.organizations(id) on delete cascade,
  connection_id     uuid        not null references public.channel_connections(id) on delete cascade,
  provider          text        not null check (provider in ('whatsapp', 'instagram', 'facebook', 'google', 'tiktok')),
  external_id       text        not null,
  external_username text,
  display_name      text,
  profile_picture_url text,
  metadata          jsonb       not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint channel_accounts_org_provider_external_unique
    unique (organization_id, provider, external_id)
);

alter table public.channel_accounts enable row level security;

create index if not exists channel_accounts_org_provider_idx
  on public.channel_accounts (organization_id, provider);

create policy "members_read_channel_accounts"
  on public.channel_accounts for select
  using (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = channel_accounts.organization_id
        and om.user_id = auth.uid()
    )
  );

create policy "owner_admin_insert_channel_accounts"
  on public.channel_accounts for insert
  with check (
    organization_id <> 'd3e00000-0000-0000-0000-000000000000'::uuid
    and exists (
      select 1 from public.organization_members om
      where om.organization_id = channel_accounts.organization_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin')
    )
  );

create policy "owner_admin_update_channel_accounts"
  on public.channel_accounts for update
  using (
    organization_id <> 'd3e00000-0000-0000-0000-000000000000'::uuid
    and exists (
      select 1 from public.organization_members om
      where om.organization_id = channel_accounts.organization_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin')
    )
  );

-- ============================================================================
-- 3. channel_contacts
-- ============================================================================

create table if not exists public.channel_contacts (
  id                uuid        primary key default gen_random_uuid(),
  organization_id   uuid        not null references public.organizations(id) on delete cascade,
  provider          text        not null check (provider in ('whatsapp', 'instagram', 'facebook', 'google', 'tiktok')),
  external_id       text        not null,
  display_name      text,
  phone_number      text,
  profile_picture_url text,
  metadata          jsonb       not null default '{}'::jsonb,
  -- Optional link to CRM contact
  contact_id        uuid        references public.contacts(id) on delete set null,
  lead_id           uuid        references public.leads(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint channel_contacts_org_provider_external_unique
    unique (organization_id, provider, external_id)
);

alter table public.channel_contacts enable row level security;

create index if not exists channel_contacts_org_provider_idx
  on public.channel_contacts (organization_id, provider);

create index if not exists channel_contacts_lead_idx
  on public.channel_contacts (organization_id, lead_id)
  where lead_id is not null;

create policy "members_read_channel_contacts"
  on public.channel_contacts for select
  using (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = channel_contacts.organization_id
        and om.user_id = auth.uid()
    )
  );

create policy "owner_admin_sales_write_channel_contacts"
  on public.channel_contacts for insert
  with check (
    organization_id <> 'd3e00000-0000-0000-0000-000000000000'::uuid
    and exists (
      select 1 from public.organization_members om
      where om.organization_id = channel_contacts.organization_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'sales')
    )
  );

create policy "owner_admin_sales_update_channel_contacts"
  on public.channel_contacts for update
  using (
    organization_id <> 'd3e00000-0000-0000-0000-000000000000'::uuid
    and exists (
      select 1 from public.organization_members om
      where om.organization_id = channel_contacts.organization_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'sales')
    )
  );

-- ============================================================================
-- 4. conversations
-- ============================================================================

create table if not exists public.conversations (
  id                uuid        primary key default gen_random_uuid(),
  organization_id   uuid        not null references public.organizations(id) on delete cascade,
  connection_id     uuid        references public.channel_connections(id) on delete set null,
  provider          text        not null check (provider in ('whatsapp', 'instagram', 'facebook', 'google', 'tiktok')),
  external_id       text        not null,
  status            text        not null default 'open'
                                check (status in ('open', 'resolved', 'archived')),
  channel_contact_id uuid       references public.channel_contacts(id) on delete set null,
  lead_id           uuid        references public.leads(id) on delete set null,
  last_message_at   timestamptz,
  metadata          jsonb       not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint conversations_org_provider_external_unique
    unique (organization_id, provider, external_id)
);

alter table public.conversations enable row level security;

create index if not exists conversations_org_provider_status_idx
  on public.conversations (organization_id, provider, status, last_message_at desc);

create index if not exists conversations_lead_idx
  on public.conversations (organization_id, lead_id)
  where lead_id is not null;

create policy "members_read_conversations"
  on public.conversations for select
  using (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = conversations.organization_id
        and om.user_id = auth.uid()
    )
  );

create policy "owner_admin_sales_write_conversations"
  on public.conversations for insert
  with check (
    organization_id <> 'd3e00000-0000-0000-0000-000000000000'::uuid
    and exists (
      select 1 from public.organization_members om
      where om.organization_id = conversations.organization_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'sales')
    )
  );

create policy "owner_admin_sales_update_conversations"
  on public.conversations for update
  using (
    organization_id <> 'd3e00000-0000-0000-0000-000000000000'::uuid
    and exists (
      select 1 from public.organization_members om
      where om.organization_id = conversations.organization_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'sales')
    )
  );

-- ============================================================================
-- 5. conversation_participants
-- ============================================================================

create table if not exists public.conversation_participants (
  id                uuid        primary key default gen_random_uuid(),
  organization_id   uuid        not null references public.organizations(id) on delete cascade,
  conversation_id   uuid        not null references public.conversations(id) on delete cascade,
  participant_type  text        not null check (participant_type in ('agent', 'contact', 'bot')),
  user_id           uuid        references auth.users(id) on delete set null,
  channel_contact_id uuid       references public.channel_contacts(id) on delete set null,
  joined_at         timestamptz not null default now(),
  left_at           timestamptz,
  created_at        timestamptz not null default now(),
  constraint conversation_participants_unique
    unique (conversation_id, participant_type, coalesce(user_id::text, ''), coalesce(channel_contact_id::text, ''))
);

alter table public.conversation_participants enable row level security;

create index if not exists conversation_participants_conv_idx
  on public.conversation_participants (conversation_id);

create policy "members_read_conversation_participants"
  on public.conversation_participants for select
  using (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = conversation_participants.organization_id
        and om.user_id = auth.uid()
    )
  );

create policy "owner_admin_sales_write_conversation_participants"
  on public.conversation_participants for insert
  with check (
    organization_id <> 'd3e00000-0000-0000-0000-000000000000'::uuid
    and exists (
      select 1 from public.organization_members om
      where om.organization_id = conversation_participants.organization_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'sales')
    )
  );

-- ============================================================================
-- 6. messages
-- ============================================================================

create table if not exists public.messages (
  id                uuid        primary key default gen_random_uuid(),
  organization_id   uuid        not null references public.organizations(id) on delete cascade,
  conversation_id   uuid        not null references public.conversations(id) on delete cascade,
  provider          text        not null check (provider in ('whatsapp', 'instagram', 'facebook', 'google', 'tiktok')),
  external_id       text,
  direction         text        not null check (direction in ('inbound', 'outbound')),
  message_type      text        not null default 'text'
                                check (message_type in ('text', 'image', 'video', 'audio', 'document', 'template', 'interactive', 'system')),
  body              text,
  -- Who sent it (agent user_id or null for inbound from contact)
  sender_user_id    uuid        references auth.users(id) on delete set null,
  sender_contact_id uuid        references public.channel_contacts(id) on delete set null,
  status            text        not null default 'pending'
                                check (status in ('pending', 'sent', 'delivered', 'read', 'failed')),
  metadata          jsonb       not null default '{}'::jsonb,
  sent_at           timestamptz,
  delivered_at      timestamptz,
  read_at           timestamptz,
  failed_at         timestamptz,
  error_code        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- Idempotency: one row per external message id
  constraint messages_org_provider_external_unique
    unique (organization_id, provider, external_id)
);

alter table public.messages enable row level security;

create index if not exists messages_conversation_idx
  on public.messages (conversation_id, created_at desc);

create index if not exists messages_org_direction_idx
  on public.messages (organization_id, direction, created_at desc);

create policy "members_read_messages"
  on public.messages for select
  using (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = messages.organization_id
        and om.user_id = auth.uid()
    )
  );

create policy "owner_admin_sales_write_messages"
  on public.messages for insert
  with check (
    organization_id <> 'd3e00000-0000-0000-0000-000000000000'::uuid
    and exists (
      select 1 from public.organization_members om
      where om.organization_id = messages.organization_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'sales')
    )
  );

create policy "owner_admin_sales_update_messages"
  on public.messages for update
  using (
    organization_id <> 'd3e00000-0000-0000-0000-000000000000'::uuid
    and exists (
      select 1 from public.organization_members om
      where om.organization_id = messages.organization_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'sales')
    )
  );

-- ============================================================================
-- 7. message_attachments
-- ============================================================================

create table if not exists public.message_attachments (
  id                uuid        primary key default gen_random_uuid(),
  organization_id   uuid        not null references public.organizations(id) on delete cascade,
  message_id        uuid        not null references public.messages(id) on delete cascade,
  attachment_type   text        not null check (attachment_type in ('image', 'video', 'audio', 'document', 'sticker', 'location')),
  mime_type         text,
  file_name         text,
  file_size_bytes   integer,
  -- Storage URL is internal; never return raw provider CDN URLs to client
  storage_path      text,
  external_url      text,
  metadata          jsonb       not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

alter table public.message_attachments enable row level security;

create index if not exists message_attachments_message_idx
  on public.message_attachments (message_id);

create policy "members_read_message_attachments"
  on public.message_attachments for select
  using (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = message_attachments.organization_id
        and om.user_id = auth.uid()
    )
  );

create policy "service_role_write_message_attachments"
  on public.message_attachments for insert
  with check (auth.role() = 'service_role');

-- ============================================================================
-- 8. message_delivery_events
-- ============================================================================

create table if not exists public.message_delivery_events (
  id                uuid        primary key default gen_random_uuid(),
  organization_id   uuid        not null references public.organizations(id) on delete cascade,
  message_id        uuid        not null references public.messages(id) on delete cascade,
  event_type        text        not null check (event_type in ('sent', 'delivered', 'read', 'failed', 'deleted')),
  external_event_id text,
  event_at          timestamptz not null default now(),
  metadata          jsonb       not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  -- Idempotency per event
  constraint message_delivery_events_message_event_unique
    unique (message_id, event_type, coalesce(external_event_id, id::text))
);

alter table public.message_delivery_events enable row level security;

create index if not exists message_delivery_events_message_idx
  on public.message_delivery_events (message_id, event_type);

create policy "members_read_message_delivery_events"
  on public.message_delivery_events for select
  using (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = message_delivery_events.organization_id
        and om.user_id = auth.uid()
    )
  );

create policy "service_role_write_message_delivery_events"
  on public.message_delivery_events for insert
  with check (auth.role() = 'service_role');

-- ============================================================================
-- 9. webhook_events
-- ============================================================================

create table if not exists public.webhook_events (
  id                uuid        primary key default gen_random_uuid(),
  organization_id   uuid        references public.organizations(id) on delete cascade,
  provider          text        not null check (provider in ('whatsapp', 'instagram', 'facebook', 'google', 'tiktok')),
  -- Provider's unique event identifier – used for duplicate detection
  external_event_id text        not null,
  event_type        text        not null,
  payload           jsonb       not null default '{}'::jsonb,
  -- Processing lifecycle
  status            text        not null default 'received'
                                check (status in ('received', 'processing', 'processed', 'failed', 'ignored')),
  processing_started_at timestamptz,
  processed_at      timestamptz,
  error_message     text,
  retry_count       integer     not null default 0,
  received_at       timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  -- Duplicate webhook event protection
  constraint webhook_events_provider_external_unique
    unique (provider, external_event_id)
);

alter table public.webhook_events enable row level security;

create index if not exists webhook_events_provider_status_idx
  on public.webhook_events (provider, status, received_at desc);

create index if not exists webhook_events_org_idx
  on public.webhook_events (organization_id, provider, received_at desc)
  where organization_id is not null;

-- Only service_role can insert/update webhook_events (ingested by server)
create policy "service_role_manage_webhook_events"
  on public.webhook_events for all
  using (auth.role() = 'service_role');

-- Members can read processed events for their org
create policy "members_read_webhook_events"
  on public.webhook_events for select
  using (
    organization_id is not null
    and exists (
      select 1 from public.organization_members om
      where om.organization_id = webhook_events.organization_id
        and om.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 10. integration_tokens
-- ============================================================================
-- SECURITY: This table stores token values for OAuth integrations.
-- Design principles:
--   - access_token_cipher, refresh_token_cipher store AES-GCM ciphertext.
--   - When TOKEN_ENCRYPTION_KEY is not configured, values are stored as NULL
--     and the connection is not marked as connected (status stays 'error').
--   - authenticated / anon roles have NO SELECT policy on this table.
--   - Only service_role reads tokens; app server uses service_role client.
--   - Column names include _cipher suffix to make clear they are NOT plaintext.
--   - No plaintext access_token, refresh_token, client_secret columns.

create table if not exists public.integration_tokens (
  id                uuid        primary key default gen_random_uuid(),
  organization_id   uuid        not null references public.organizations(id) on delete cascade,
  connection_id     uuid        not null references public.channel_connections(id) on delete cascade,
  provider          text        not null check (provider in ('whatsapp', 'instagram', 'facebook', 'google', 'tiktok')),
  -- Ciphertext blobs (AES-GCM, base64-encoded). NULL means not encrypted / not stored.
  -- Never populated when TOKEN_ENCRYPTION_KEY is absent.
  access_token_cipher  text,
  refresh_token_cipher text,
  -- Token metadata (non-secret)
  token_type        text,
  expires_at        timestamptz,
  refresh_expires_at timestamptz,
  scopes            text[]      not null default '{}',
  -- Idempotency key for token updates
  idempotency_key   uuid        not null default gen_random_uuid(),
  -- Audit
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint integration_tokens_connection_unique unique (connection_id)
);

alter table public.integration_tokens enable row level security;

create index if not exists integration_tokens_org_provider_idx
  on public.integration_tokens (organization_id, provider);

-- No authenticated/anon SELECT policy intentionally.
-- Only service_role can access token rows.
create policy "service_role_manage_integration_tokens"
  on public.integration_tokens for all
  using (auth.role() = 'service_role');

-- ============================================================================
-- 11. integration_sync_jobs
-- ============================================================================

create table if not exists public.integration_sync_jobs (
  id                uuid        primary key default gen_random_uuid(),
  organization_id   uuid        not null references public.organizations(id) on delete cascade,
  connection_id     uuid        references public.channel_connections(id) on delete cascade,
  provider          text        not null check (provider in ('whatsapp', 'instagram', 'facebook', 'google', 'tiktok')),
  job_type          text        not null check (job_type in ('full_sync', 'incremental', 'contact_sync', 'message_sync', 'webhook_replay')),
  status            text        not null default 'pending'
                                check (status in ('pending', 'running', 'completed', 'failed', 'cancelled')),
  started_at        timestamptz,
  completed_at      timestamptz,
  records_processed integer     not null default 0,
  records_failed    integer     not null default 0,
  error_message     text,
  metadata          jsonb       not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.integration_sync_jobs enable row level security;

create index if not exists integration_sync_jobs_org_status_idx
  on public.integration_sync_jobs (organization_id, status, created_at desc);

create policy "members_read_integration_sync_jobs"
  on public.integration_sync_jobs for select
  using (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = integration_sync_jobs.organization_id
        and om.user_id = auth.uid()
    )
  );

create policy "service_role_manage_integration_sync_jobs"
  on public.integration_sync_jobs for all
  using (auth.role() = 'service_role');

-- ============================================================================
-- 12. lead_source_events
-- ============================================================================

create table if not exists public.lead_source_events (
  id                uuid        primary key default gen_random_uuid(),
  organization_id   uuid        not null references public.organizations(id) on delete cascade,
  lead_id           uuid        references public.leads(id) on delete cascade,
  provider          text        not null check (provider in ('whatsapp', 'instagram', 'facebook', 'google', 'tiktok')),
  event_type        text        not null check (event_type in ('first_contact', 'form_fill', 'ad_click', 'message_received', 'call_initiated')),
  external_id       text,
  channel_contact_id uuid       references public.channel_contacts(id) on delete set null,
  metadata          jsonb       not null default '{}'::jsonb,
  occurred_at       timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  constraint lead_source_events_org_provider_external_unique
    unique (organization_id, provider, external_id)
);

alter table public.lead_source_events enable row level security;

create index if not exists lead_source_events_lead_idx
  on public.lead_source_events (organization_id, lead_id, occurred_at desc)
  where lead_id is not null;

create index if not exists lead_source_events_provider_idx
  on public.lead_source_events (organization_id, provider, occurred_at desc);

create policy "members_read_lead_source_events"
  on public.lead_source_events for select
  using (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = lead_source_events.organization_id
        and om.user_id = auth.uid()
    )
  );

create policy "owner_admin_sales_write_lead_source_events"
  on public.lead_source_events for insert
  with check (
    organization_id <> 'd3e00000-0000-0000-0000-000000000000'::uuid
    and exists (
      select 1 from public.organization_members om
      where om.organization_id = lead_source_events.organization_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'sales')
    )
  );

create policy "service_role_write_lead_source_events"
  on public.lead_source_events for insert
  with check (auth.role() = 'service_role');

-- ============================================================================
-- 13. oauth_states
-- ============================================================================
-- SECURITY: This table stores short-lived, single-use CSRF/PKCE state for OAuth.
-- Design principles:
--   - state_hash stores SHA-256 of the random state token (never plaintext).
--   - code_verifier_ciphertext stores AES-GCM ciphertext of PKCE verifier.
--   - return_path is validated at app layer to be an allowed internal path.
--   - expires_at is 10 minutes from creation.
--   - consumed_at is set atomically on first use; subsequent use rejected.
--   - Only service_role can read/write this table.
--   - No anon, authenticated, or public policies.

create table if not exists public.oauth_states (
  id                        uuid        primary key default gen_random_uuid(),
  organization_id           uuid        not null references public.organizations(id) on delete cascade,
  user_id                   uuid        not null references auth.users(id) on delete cascade,
  provider                  text        not null check (provider in ('whatsapp', 'instagram', 'facebook', 'google', 'tiktok')),
  -- SHA-256 hex digest of the random state token passed in the OAuth URL
  state_hash                text        not null,
  -- AES-GCM ciphertext of the PKCE code_verifier; null for non-PKCE providers
  code_verifier_ciphertext  text,
  -- Validated at app layer: must be an allowed internal path (starts with /)
  -- Open redirect protection: external URLs are rejected before storage
  return_path               text        not null default '/settings/integrations',
  expires_at                timestamptz not null default (now() + interval '10 minutes'),
  -- Set atomically when state is consumed; never null means already used
  consumed_at               timestamptz,
  created_at                timestamptz not null default now(),
  constraint oauth_states_state_hash_unique unique (state_hash)
);

alter table public.oauth_states enable row level security;

create index if not exists oauth_states_hash_expires_idx
  on public.oauth_states (state_hash, expires_at)
  where consumed_at is null;

-- No authenticated/anon policies. service_role only.
create policy "service_role_manage_oauth_states"
  on public.oauth_states for all
  using (auth.role() = 'service_role');

-- ============================================================================
-- 14. Deployment manifest
-- ============================================================================

insert into public.deployment_migrations (version, name)
values ('0027', 'omnichannel_foundation')
on conflict (version) do update set name = excluded.name;

-- ============================================================================
-- Rollback notes
-- ============================================================================
-- To revert this migration:
--   drop table if exists public.oauth_states;
--   drop table if exists public.lead_source_events;
--   drop table if exists public.integration_sync_jobs;
--   drop table if exists public.integration_tokens;
--   drop table if exists public.webhook_events;
--   drop table if exists public.message_delivery_events;
--   drop table if exists public.message_attachments;
--   drop table if exists public.messages;
--   drop table if exists public.conversation_participants;
--   drop table if exists public.conversations;
--   drop table if exists public.channel_contacts;
--   drop table if exists public.channel_accounts;
--   drop table if exists public.channel_connections;
--   drop function if exists public.set_channel_connections_updated_at();
--   delete from public.deployment_migrations where version = '0027';
