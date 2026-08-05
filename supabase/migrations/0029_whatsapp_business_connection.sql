-- 0029_whatsapp_business_connection.sql
-- FlowSales AI: WhatsApp Business Connection Extensions
--
-- Adds WhatsApp Business specific columns to channel_connections table:
--   - waba_id                     Meta WhatsApp Business Account ID
--   - phone_number_id             Meta Phone Number ID
--   - business_id                 Meta Business Portfolio ID
--   - verified_name               Verified display name from Meta
--   - display_phone_number        Formatted display phone number
--   - quality_rating              Meta phone number quality rating (GREEN, YELLOW, RED)
--   - messaging_limit_tier        Meta messaging tier (TIER_250, TIER_1K, TIER_10K, etc.)
--   - code_verification_status    Code verification status from Meta
--   - account_review_status       Meta WABA review status (APPROVED, PENDING, REJECTED)
--   - webhook_subscribed_at       Timestamp when WABA was subscribed to app webhooks
--   - connection_verified_at      Timestamp when connection health was last verified
--   - token_expires_at            OAuth token expiry timestamp
--   - last_health_check_at        Timestamp of last health check execution
--   - connection_error_code       Standardized error code when status = 'error'
--   - connection_error_message    Sanitized error message when status = 'error'

alter table public.channel_connections
  add column if not exists waba_id text,
  add column if not exists phone_number_id text,
  add column if not exists business_id text,
  add column if not exists verified_name text,
  add column if not exists display_phone_number text,
  add column if not exists quality_rating text,
  add column if not exists messaging_limit_tier text,
  add column if not exists code_verification_status text,
  add column if not exists account_review_status text,
  add column if not exists webhook_subscribed_at timestamptz,
  add column if not exists connection_verified_at timestamptz,
  add column if not exists token_expires_at timestamptz,
  add column if not exists last_health_check_at timestamptz,
  add column if not exists connection_error_code text,
  add column if not exists connection_error_message text;

-- Index for WABA and phone number lookups per organization
create index if not exists channel_connections_waba_phone_idx
  on public.channel_connections (organization_id, waba_id, phone_number_id)
  where provider = 'whatsapp';

-- Global index for cross-workspace WABA collision checks
create index if not exists channel_connections_global_waba_idx
  on public.channel_connections (waba_id, phone_number_id)
  where provider = 'whatsapp' and status in ('connected', 'connecting');

-- Manifest update
insert into public.deployment_migrations (version, name)
values ('0029', 'whatsapp_business_connection')
on conflict (version) do update set name = excluded.name;
