-- AI response training (AI応対トレーニング): an operator practises against a simulated caller.
-- Isolated from the desk on purpose: no row here references a case, station, caller binding or guard job,
-- nothing here is published to Realtime, and insights() never reads these tables.
-- Clients only SELECT their own rows; the server (service role) writes after checking the actor.

create table public.training_session (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references ichido.staff on delete cascade,
  scenario text not null,                                -- key into SCENARIOS in web/content/training.ts
  lang text not null check (lang in ('bn', 'en', 'ja')),
  card_back public.fact not null default 'unknown',      -- what the simulated caller confirmed on read-back
  cash_received public.fact not null default 'unknown',
  confirmed_at timestamptz,
  needs_human boolean not null default false,
  dispatched boolean not null default false,             -- simulated only: no guard is ever notified
  first_reply_at timestamptz,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  score jsonb,                                           -- rubric results as codes: [{key, result, points, max, seconds?}]
  points int,
  max_points int
);
create index training_session_operator on public.training_session (operator_id, started_at desc);

-- One line of the simulated call. A line that looked like a number is stored with text = null.
create table public.training_turn (
  id bigint generated always as identity primary key,
  session uuid not null references public.training_session on delete cascade,
  who text not null check (who in ('caller', 'operator', 'system')),
  kind text not null check (kind in ('say', 'withheld', 'human', 'readback', 'confirm', 'reply', 'dispatch')),
  text text,
  ja text,                                               -- Japanese gloss of a caller line (script or machine translation)
  data jsonb not null default '{}',
  at timestamptz not null default now()
);
create index training_turn_session on public.training_turn (session, id);

alter table public.training_session enable row level security;
alter table public.training_turn enable row level security;
revoke all on public.training_session, public.training_turn from public, anon, authenticated;
grant select on public.training_session, public.training_turn to authenticated;
grant all on public.training_session, public.training_turn to service_role;
grant usage, select on sequence public.training_turn_id_seq to service_role;

create policy training_session_own on public.training_session for select to authenticated
  using (operator_id = auth.uid() and ichido.has_role('operator'));
create policy training_turn_own on public.training_turn for select to authenticated
  using (ichido.has_role('operator')
         and exists (select 1 from public.training_session s where s.id = session and s.operator_id = auth.uid()));
