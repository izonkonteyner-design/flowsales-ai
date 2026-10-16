-- 0028_customer_messages.sql
-- FlowSales AI: Omnichannel customer inbox core.
--
-- Strategy:
--  * Single `customer_messages` table stores inbound/outbound messages from
--    all channels (WhatsApp, Instagram DM, Facebook Messenger, Email).
--  * Platform-scoped ids + idempotency key prevent duplicate webhook ingestion.
--  * Messages link to leads via lead_id; unmatched messages can create new leads.
--  * RLS restricts every row to its organization; follows existing RLS pattern.
--  * No parallel tenant subsystem; extends existing organizations/auth.users.

-- ============================================================================
-- 1. customer_messages: unified inbox across all channels
-- ============================================================================

create table if not exists public.customer_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel text not null
    check (channel in ('whatsapp', 'instagram_dm', 'facebook_messenger', 'email')),
  direction text not null
    check (direction in ('inbound', 'outbound')),
  status text not null default 'new'
    check (status in ('new', 'read', 'replied', 'closed', 'failed')),

  -- Platform identifiers for idempotency and conversation threading
  channel_message_id text not null,          -- platform-assigned message id
  channel_conversation_id text not null,     -- platform-assigned conversation id
  idempotency_key text not null unique,      -- client-generated idempotency key

  -- Sender information
  sender_name text not null,
  sender_phone text,
  sender_email text,
  sender_platform_id text,                   -- platform user id (WhatsApp phone, IG psid, etc.)

  -- Content
  content text not null,
  media_urls text[] default '{}'::text[],

  -- CRM linkage
  lead_id uuid references public.leads(id) on delete set null,
  lead_match_confidence numeric,             -- 0..1 confidence score for auto-match
  assigned_to uuid references auth.users(id) on delete set null,
  internal_notes text,

  -- Webhook audit
  webhook_received_at timestamptz not null default now(),
  webhook_payload jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_messages_org_idx
  on public.customer_messages (organization_id, created_at desc);

create index if not exists customer_messages_channel_idx
  on public.customer_messages (organization_id, channel, created_at desc);

create index if not exists customer_messages_status_idx
  on public.customer_messages (organization_id, status, created_at desc);

create index if not exists customer_messages_lead_idx
  on public.customer_messages (lead_id, created_at desc);

create index if not exists customer_messages_idempotency_idx
  on public.customer_messages (idempotency_key);

create index if not exists customer_messages_conversation_idx
  on public.customer_messages (channel_conversation_id, created_at desc);

-- ============================================================================
-- 2. RLS
-- ============================================================================

alter table public.customer_messages enable row level security;

create policy "members can read customer messages"
  on public.customer_messages for select
  using (public.is_org_member(organization_id));

create policy "sales and admins can manage customer messages"
  on public.customer_messages for all
  using (public.has_org_role(organization_id, array['owner', 'admin', 'sales']))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'sales']));

-- ============================================================================
-- 3. Updated at trigger
-- ============================================================================

create trigger set_customer_messages_updated_at
  before update on public.customer_messages
  for each row execute function public.set_updated_at();

-- Rollback notes:
--   drop trigger if exists set_customer_messages_updated_at on public.customer_messages;
--   drop table if exists public.customer_messages;