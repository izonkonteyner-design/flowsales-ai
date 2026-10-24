-- Migration 0062: Omnichannel YouTube Provider Expansion
-- Updates check constraints across omnichannel tables to support 'youtube' provider.

-- 1. channel_connections
ALTER TABLE public.channel_connections
  DROP CONSTRAINT IF EXISTS channel_connections_provider_check;

ALTER TABLE public.channel_connections
  ADD CONSTRAINT channel_connections_provider_check
  CHECK (provider IN ('whatsapp', 'instagram', 'facebook', 'google', 'tiktok', 'youtube'));

-- 2. integration_tokens
ALTER TABLE public.integration_tokens
  DROP CONSTRAINT IF EXISTS integration_tokens_provider_check;

ALTER TABLE public.integration_tokens
  ADD CONSTRAINT integration_tokens_provider_check
  CHECK (provider IN ('whatsapp', 'instagram', 'facebook', 'google', 'tiktok', 'youtube'));

-- 3. oauth_states
ALTER TABLE public.oauth_states
  DROP CONSTRAINT IF EXISTS oauth_states_provider_check;

ALTER TABLE public.oauth_states
  ADD CONSTRAINT oauth_states_provider_check
  CHECK (provider IN ('whatsapp', 'instagram', 'facebook', 'google', 'tiktok', 'youtube'));

-- 4. webhook_events
ALTER TABLE public.webhook_events
  DROP CONSTRAINT IF EXISTS webhook_events_provider_check;

ALTER TABLE public.webhook_events
  ADD CONSTRAINT webhook_events_provider_check
  CHECK (provider IN ('whatsapp', 'instagram', 'facebook', 'google', 'tiktok', 'youtube'));

-- 5. channel_accounts
ALTER TABLE public.channel_accounts
  DROP CONSTRAINT IF EXISTS channel_accounts_provider_check;

ALTER TABLE public.channel_accounts
  ADD CONSTRAINT channel_accounts_provider_check
  CHECK (provider IN ('whatsapp', 'instagram', 'facebook', 'google', 'tiktok', 'youtube'));

-- 6. channel_contacts
ALTER TABLE public.channel_contacts
  DROP CONSTRAINT IF EXISTS channel_contacts_provider_check;

ALTER TABLE public.channel_contacts
  ADD CONSTRAINT channel_contacts_provider_check
  CHECK (provider IN ('whatsapp', 'instagram', 'facebook', 'google', 'tiktok', 'youtube'));

-- 7. conversations
ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_provider_check;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_provider_check
  CHECK (provider IN ('whatsapp', 'instagram', 'facebook', 'google', 'tiktok', 'youtube'));

-- 8. Record Migration
INSERT INTO public.deployment_migrations (version, name)
VALUES ('0062', 'channel_connections_youtube')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
