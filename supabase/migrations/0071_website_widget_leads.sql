-- Migration 0071: Public website lead-capture widget
-- Adds a rotatable, publicly-safe widget_key per organization (analogous to a
-- Stripe "publishable key") so an embeddable JS widget on a customer's own
-- website can submit leads without exposing any internal API key.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS widget_key TEXT UNIQUE DEFAULT md5(random()::text || clock_timestamp()::text);

UPDATE public.organizations
  SET widget_key = md5(random()::text || clock_timestamp()::text || id::text)
  WHERE widget_key IS NULL;

INSERT INTO public.deployment_migrations (version, name)
VALUES ('0071', 'website_widget_leads')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
