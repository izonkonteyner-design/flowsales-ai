-- Compatibility: the historical health check reused version 0018.
-- Recreate the idempotent RPC at a unique version for clean installs.
-- Idempotent health check RPC
CREATE OR REPLACE FUNCTION public.health_check()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT true;
$$;

-- Grant execute to anon and authenticated
GRANT EXECUTE ON FUNCTION public.health_check() TO anon, authenticated;

insert into public.deployment_migrations(version, name) values ('0059', 'health_check_rpc') on conflict(version) do update set name = excluded.name;
