-- Conversation Intelligence 2.0: explainable lead scoring, structured sales signals and next-best-action evidence.

alter table public.conversation_ai_qualifications
  add column if not exists sales_stage text,
  add column if not exists priority text,
  add column if not exists confidence numeric,
  add column if not exists signals jsonb not null default '{}'::jsonb,
  add column if not exists missing_information jsonb not null default '[]'::jsonb,
  add column if not exists score_breakdown jsonb not null default '[]'::jsonb,
  add column if not exists next_best_action_type text,
  add column if not exists next_best_action_rationale text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'conversation_ai_qualifications_sales_stage_check'
      and conrelid = 'public.conversation_ai_qualifications'::regclass
  ) then
    alter table public.conversation_ai_qualifications
      add constraint conversation_ai_qualifications_sales_stage_check
      check (sales_stage is null or sales_stage in ('new_lead','discovery','qualified','quote_ready','quote_sent','negotiation','won','lost','support'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'conversation_ai_qualifications_priority_check'
      and conrelid = 'public.conversation_ai_qualifications'::regclass
  ) then
    alter table public.conversation_ai_qualifications
      add constraint conversation_ai_qualifications_priority_check
      check (priority is null or priority in ('high','medium','low'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'conversation_ai_qualifications_confidence_check'
      and conrelid = 'public.conversation_ai_qualifications'::regclass
  ) then
    alter table public.conversation_ai_qualifications
      add constraint conversation_ai_qualifications_confidence_check
      check (confidence is null or (confidence >= 0 and confidence <= 1));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'conversation_ai_qualifications_nba_type_check'
      and conrelid = 'public.conversation_ai_qualifications'::regclass
  ) then
    alter table public.conversation_ai_qualifications
      add constraint conversation_ai_qualifications_nba_type_check
      check (next_best_action_type is null or next_best_action_type in ('ask_question','share_information','create_quote','follow_up','call','no_action'));
  end if;
end $$;

create index if not exists conversation_ai_qualifications_org_priority_idx
  on public.conversation_ai_qualifications (organization_id, priority, score desc, created_at desc);

insert into public.deployment_migrations(version,name,checksum)
values ('0045','0045_conversation_intelligence_v2.sql','conversation-intelligence-v2-2026-08-09')
on conflict (version) do update set name=excluded.name, checksum=excluded.checksum, executed_at=now();
