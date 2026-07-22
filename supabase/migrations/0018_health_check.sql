-- Idempotent health check RPC
CREATE OR REPLACE FUNCTION public.health_check()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT true;
$$;

-- Grant execute to anon and authenticated
GRANT EXECUTE ON FUNCTION public.health_check() TO anon, authenticated;
