ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS industry text NULL;

-- Safe backfill for existing organizations
UPDATE public.organizations
SET onboarding_completed_at = now()
WHERE onboarding_completed_at IS NULL;
