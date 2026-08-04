-- 0028_oauth_state_atomic_consumption.sql
-- FlowSales AI: Atomic OAuth State Consumption RPC
--
-- Creates an atomic RPC function `consume_oauth_state` that:
--   1. Matches state_hash, provider, organization_id, and user_id.
--   2. Atomically checks consumed_at IS NULL and expires_at > now().
--   3. Sets consumed_at = now() in the same transaction.
--   4. Returns the state record (including code_verifier_ciphertext) on success.
--   5. Returns empty/null when state is invalid, expired, consumed, or owned by another user.
--
-- Security:
--   - Security definer; search_path pinned to public, pg_catalog.
--   - Revoked from public, anon, authenticated; granted to service_role only.

create or replace function public.consume_oauth_state(
  p_state_hash text,
  p_provider text,
  p_organization_id uuid,
  p_user_id uuid
)
returns table (
  id uuid,
  organization_id uuid,
  user_id uuid,
  provider text,
  return_path text,
  code_verifier_ciphertext text
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;

  return query
  update public.oauth_states
  set consumed_at = now()
  where oauth_states.state_hash = p_state_hash
    and oauth_states.provider = p_provider
    and oauth_states.organization_id = p_organization_id
    and oauth_states.user_id = p_user_id
    and oauth_states.consumed_at is null
    and oauth_states.expires_at > now()
  returning
    oauth_states.id,
    oauth_states.organization_id,
    oauth_states.user_id,
    oauth_states.provider,
    oauth_states.return_path,
    oauth_states.code_verifier_ciphertext;
end;
$$;

revoke all on function public.consume_oauth_state(text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.consume_oauth_state(text, text, uuid, uuid) to service_role;

insert into public.deployment_migrations (version, name)
values ('0028', 'oauth_state_atomic_consumption')
on conflict (version) do update set name = excluded.name;
