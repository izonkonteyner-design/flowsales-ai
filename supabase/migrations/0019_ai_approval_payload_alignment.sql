-- Align persisted approval payload with the application domain contract.
alter table public.ai_approval_requests
  add column if not exists lead_id uuid references public.leads(id) on delete set null,
  add column if not exists evidence jsonb not null default '[]'::jsonb,
  add column if not exists money jsonb not null default '[]'::jsonb,
  add column if not exists reasons jsonb not null default '[]'::jsonb,
  add column if not exists provider text not null default 'unknown',
  add column if not exists model text not null default 'unknown';

alter table public.ai_approval_requests
  alter column risk_level set default 'medium';

create index if not exists ai_approval_lead_idx
  on public.ai_approval_requests (organization_id, lead_id, created_at desc);

-- Server-side insertion function keeps the queue creation atomic with its audit event.
create or replace function public.create_ai_approval(
  p_run_id uuid,
  p_lead_id uuid,
  p_capability text,
  p_summary text,
  p_actions jsonb,
  p_evidence jsonb,
  p_money jsonb,
  p_reasons jsonb,
  p_provider text,
  p_model text,
  p_risk_level text,
  p_expires_at timestamptz default null
)
returns public.ai_approval_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.ai_runs;
  v_row public.ai_approval_requests;
begin
  select * into v_run from public.ai_runs where id = p_run_id;
  if v_run.id is null then raise exception 'AI run not found'; end if;
  if v_run.actor_id <> auth.uid() then raise exception 'Run actor mismatch'; end if;
  if not public.is_org_member(v_run.organization_id) then raise exception 'Not authorized'; end if;
  if public.is_demo_organization(v_run.organization_id) then raise exception 'Demo workspace is read-only'; end if;
  if p_risk_level not in ('low','medium','high') then raise exception 'Invalid risk level'; end if;

  insert into public.ai_approval_requests (
    organization_id, run_id, requested_by, lead_id, capability, status,
    actions, evidence, money, reasons, summary, risk_level, provider, model, expires_at
  ) values (
    v_run.organization_id, v_run.id, auth.uid(), p_lead_id, p_capability, 'pending',
    coalesce(p_actions, '[]'::jsonb), coalesce(p_evidence, '[]'::jsonb),
    coalesce(p_money, '[]'::jsonb), coalesce(p_reasons, '[]'::jsonb),
    p_summary, p_risk_level, p_provider, p_model,
    coalesce(p_expires_at, now() + interval '7 days')
  )
  on conflict (run_id) do update set run_id = excluded.run_id
  returning * into v_row;

  insert into public.ai_approval_events (organization_id, approval_id, actor_id, event_type, metadata)
  values (v_row.organization_id, v_row.id, auth.uid(), 'created', jsonb_build_object('version', v_row.version));

  return v_row;
end;
$$;

revoke all on function public.create_ai_approval(uuid, uuid, text, text, jsonb, jsonb, jsonb, jsonb, text, text, text, timestamptz) from public;
grant execute on function public.create_ai_approval(uuid, uuid, text, text, jsonb, jsonb, jsonb, jsonb, text, text, text, timestamptz) to authenticated;
