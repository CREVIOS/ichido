-- Operator-side gaps from the sourced stories (docs/research/10-real-stories.md §2 gaps 1, 4, 7, 12 and §3):
-- fraud-in-progress mode, mass-incident grouping with one broadcast, timers on promises, the harassment flag and
-- takeover, and the security company's control centre (警備会社 管制) on every dispatch.
-- Codes and data only; all wording lives in web/content/ops.ts. Every command is a person's: the Ichido Bot only
-- expires promises a person (or a guard's own estimate) made.

-- 1. Tunables, operator-readable like ichido.sla_target.
create table ichido.ops_setting (
  key text primary key check (key in ('mass_stations', 'mass_window_s', 'arrived_open_s')),
  value integer not null check (value > 0)
);
insert into ichido.ops_setting values ('mass_stations', 3), ('mass_window_s', 600), ('arrived_open_s', 1200);
alter table ichido.ops_setting enable row level security;
revoke all on ichido.ops_setting from public, anon, authenticated;
grant select on ichido.ops_setting to authenticated, service_role;
create policy operator_settings on ichido.ops_setting for select to authenticated using (ichido.has_role('operator'));

-- 2. Case flags. caller_card.fraud and .notice are what the caller's phone shows (approved catalogue text by code).
create table public.mass_incident (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  broadcast_at timestamptz,
  broadcast_by text,
  recipients int
);
alter table public.desk
  add column fraud_at timestamptz,
  add column abusive_at timestamptz,
  add column mass_incident uuid references public.mass_incident on delete set null;
alter table public.caller_card
  add column fraud boolean not null default false,
  add column notice text check (notice in ('mass_leave', 'still_working')),
  add column notice_at timestamptz;
-- The generation whose estimate ran out: the guard's screen asks for a new one while it matches.
alter table public.field_job add column reestimate_gen int;
alter table public.light drop constraint light_state_check,
  add constraint light_state_check check (state in ('idle', 'received', 'review', 'field', 'guided', 'fraud'));

-- A promise with a deadline: the operator's call-back or re-check, the guard's own arrival estimate, or "arrived"
-- without "done". The Ichido Bot sleeps until due_at and expires it if nobody settled it.
create table public.promise (
  id uuid primary key default gen_random_uuid(),
  incident uuid not null references public.desk on delete cascade,
  kind text not null check (kind in ('callback', 'recheck', 'eta', 'arrived')),
  generation int,
  due_at timestamptz not null,
  made_by text,
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  outcome text check (outcome in ('kept', 'expired', 'replaced', 'closed'))
);
create index promise_open on public.promise (incident) where settled_at is null;
create index desk_mass_incident on public.desk (mass_incident) where mass_incident is not null;

do $$
declare t text;
begin
  foreach t in array array['mass_incident', 'promise'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
create policy operator_read on public.promise for select to authenticated using (ichido.has_role('operator'));
create policy staff_read on public.mass_incident for select to authenticated
  using (ichido.has_role('operator') or ichido.has_role('manager'));
alter publication supabase_realtime add table public.mass_incident, public.promise;

-- 3. The light stays red while a fraud case is open, whatever later step (a redispatch) asks for.
create or replace function ichido.set_light(p_station text, p_incident uuid, p_state text) returns void
language plpgsql security definer set search_path = '' as $$
declare s text := p_state;
begin
  perform 1 from public.station where id = p_station for update;
  if exists (select 1 from public.desk where station = p_station and finished_at is null and id <> p_incident) then return; end if;
  if s not in ('idle', 'guided')
     and exists (select 1 from public.desk where id = p_incident and fraud_at is not null and finished_at is null) then
    s := 'fraud';
  end if;
  insert into public.light (station, state, updated_at) values (p_station, s, now())
    on conflict (station) do update set state = excluded.state, updated_at = now();
end $$;

-- 4. Dispatch realism: the operator asks the station's security company control centre, which sends the guard.
--    Same rules as before; the timeline now names the company.
create or replace function public.cmd_assign(p_uid uuid, p_name text, p_incident uuid, p_assignee uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.desk; guard text; prev public.field_job; company text;
begin
  d := ichido.owned_case(p_uid, p_incident);
  select display_name into guard from ichido.staff where uid = p_assignee and role = 'field';
  if guard is null then perform ichido.fail('bad_request'); end if;
  select * into prev from public.field_job where incident = d.id for update;
  if found and prev.assignee = p_assignee and not prev.case_closed then return; end if;
  select security_company into company from public.station where id = d.station;
  insert into public.field_job (incident, station, fault, assignee, generation, state, eta, case_closed, updated_at)
    values (d.id, d.station, d.fault, p_assignee, coalesce(prev.generation, 0) + 1, 'requested', null, false, now())
    on conflict (incident) do update set assignee = excluded.assignee, generation = excluded.generation,
      state = 'requested', eta = null, case_closed = false, updated_at = now();
  update public.desk set status = 'field' where id = d.id;
  update public.caller_card set status = 'field', field_state = 'requested', eta = null where id = d.id;
  perform ichido.set_light(d.station, d.id, 'field');
  perform ichido.event(d.id, 'operator', case when prev.incident is null then 'dispatch' else 'redispatch' end,
                       jsonb_build_object('assignee', guard, 'company', company), p_name);
end $$;

-- 5. Fraud-in-progress mode (特殊詐欺の疑い), by the operator who owns the case: the caller's phone shows the approved
--    full-screen warning, the light turns red, and a guard is dispatched through the control centre. The server then
--    issues the police hand-off record (web/lib/ops.ts). Never callable by the bot or a model.
create function public.cmd_fraud(p_uid uuid, p_name text, p_incident uuid, p_assignee uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.desk;
begin
  d := ichido.owned_case(p_uid, p_incident);
  if d.fraud_at is not null then perform ichido.fail('conflict'); end if;
  update public.desk set fraud_at = now() where id = d.id;
  update public.caller_card set fraud = true, notice = null, notice_at = null where id = d.id;
  perform ichido.event(d.id, 'operator', 'fraud',
    jsonb_build_object('company', (select security_company from public.station where id = d.station)), p_name);
  perform public.cmd_assign(p_uid, p_name, d.id, p_assignee);   -- a no-op when this guard already has the job
  perform ichido.set_light(d.station, d.id, 'fraud');
end $$;

-- 6. Harassment flag (カスハラ): one person's judgement, recorded once. No emotion scoring.
create function public.cmd_abusive(p_uid uuid, p_name text, p_incident uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.desk;
begin
  d := ichido.owned_case(p_uid, p_incident);
  if d.abusive_at is not null then perform ichido.fail('conflict'); end if;
  update public.desk set abusive_at = now() where id = d.id;
  perform ichido.event(d.id, 'operator', 'abusive', '{}', p_name);
end $$;

-- Another operator (the supervisor) takes over a case someone else holds.
create function public.cmd_takeover(p_uid uuid, p_name text, p_incident uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.desk;
begin
  if not exists (select 1 from ichido.staff where uid = p_uid and role = 'operator') then perform ichido.fail('forbidden'); end if;
  select * into d from public.desk where id = p_incident for update;
  if not found then perform ichido.fail('not_found'); end if;
  if d.finished_at is not null or d.operator_id is null or d.operator_id = p_uid then perform ichido.fail('conflict'); end if;
  update public.desk set operator_id = p_uid where id = d.id;
  perform ichido.event(d.id, 'operator', 'takeover', jsonb_build_object(
    'from', (select display_name from ichido.staff where uid = d.operator_id), 'abusive', d.abusive_at is not null), p_name);
end $$;

-- 7. Mass incident: when a fault makes at least mass_stations stations open within mass_window_s, those cases are
--    grouped; while any grouped case is open, new faults join it. Runs after the fault event, under one lock.
create function ichido.group_mass() returns trigger
language plpgsql security definer set search_path = '' as $$
declare m uuid; need int; win int;
begin
  perform pg_advisory_xact_lock(hashtext('ichido.mass_incident'));
  select d.mass_incident into m from public.desk d
    where d.finished_at is null and d.mass_incident is not null and d.id <> new.incident limit 1;
  if m is not null then
    update public.desk set mass_incident = m where id = new.incident and mass_incident is null;
    if found then perform ichido.event(new.incident, 'system', 'mass_grouped', '{}'); end if;
    return null;
  end if;
  select value into need from ichido.ops_setting where key = 'mass_stations';
  select value into win from ichido.ops_setting where key = 'mass_window_s';
  if (select count(distinct station) from public.desk
      where finished_at is null and created_at > now() - make_interval(secs => win)) < need then
    return null;
  end if;
  insert into public.mass_incident default values returning id into m;
  with grouped as (
    update public.desk set mass_incident = m
      where finished_at is null and created_at > now() - make_interval(secs => win) returning id
  )
  insert into public.case_event (incident, actor, kind, data) select id, 'system', 'mass_grouped', '{}' from grouped;
  return null;
end $$;
create trigger group_mass after insert on public.case_event
  for each row when (new.kind = 'fault') execute function ichido.group_mass();

-- One approved broadcast per incident, by an operator, to every paired caller of its open cases (never a fraud case).
create function public.cmd_broadcast(p_uid uuid, p_name text, p_mass uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare m public.mass_incident; n int;
begin
  if not exists (select 1 from ichido.staff where uid = p_uid and role = 'operator') then perform ichido.fail('forbidden'); end if;
  select * into m from public.mass_incident where id = p_mass for update;
  if not found then perform ichido.fail('not_found'); end if;
  if m.broadcast_at is not null then perform ichido.fail('conflict'); end if;
  perform 1 from public.desk where mass_incident = p_mass and finished_at is null order by id for update;
  if not found then perform ichido.fail('conflict'); end if;
  with sent as (
    update public.caller_card c set notice = 'mass_leave', notice_at = now()
      from public.desk d
      where d.id = c.id and d.mass_incident = p_mass and d.finished_at is null and not c.fraud
        and exists (select 1 from ichido.binding b where b.incident = d.id and b.expires > now())
      returning c.id
  ), logged as (
    insert into public.case_event (incident, actor, kind, data, actor_name)
      select id, 'operator', 'broadcast', '{}', p_name from sent returning 1
  )
  select count(*) into n from logged;
  update public.mass_incident set broadcast_at = now(), broadcast_by = p_name, recipients = n where id = p_mass;
  return n;
end $$;

-- 8. Promises. The operator's own call-back or re-check (one open per kind; a new one replaces it).
create function public.cmd_promise(p_uid uuid, p_name text, p_incident uuid, p_kind text, p_minutes int, p_due timestamptz) returns uuid
language plpgsql security definer set search_path = '' as $$
declare d public.desk; p uuid;
begin
  d := ichido.owned_case(p_uid, p_incident);
  if p_kind not in ('callback', 'recheck') or p_due <= now() then perform ichido.fail('bad_request'); end if;
  update public.promise set settled_at = now(), outcome = 'replaced'
    where incident = d.id and kind = p_kind and settled_at is null;
  insert into public.promise (incident, kind, due_at, made_by) values (d.id, p_kind, p_due, p_name) returning id into p;
  perform ichido.event(d.id, 'operator', 'promise', jsonb_build_object('kind', p_kind, 'minutes', p_minutes), p_name);
  return p;
end $$;

create function public.cmd_promise_done(p_uid uuid, p_name text, p_promise uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare i uuid; k text;
begin
  select incident, kind into i, k from public.promise where id = p_promise;
  if i is null then perform ichido.fail('not_found'); end if;
  perform ichido.owned_case(p_uid, i);
  update public.promise set settled_at = now(), outcome = 'kept'
    where id = p_promise and settled_at is null and kind in ('callback', 'recheck');
  if not found then perform ichido.fail('conflict'); end if;
  perform ichido.event(i, 'operator', 'promise_kept', jsonb_build_object('kind', k), p_name);
end $$;

-- After a guard's update (cmd_field): settle the previous estimate and open the next one. p_due comes from the
-- guard's own estimate (on_way) or arrived_open_s (arrived); null for "done" or an unknown estimate.
create function public.ops_field_promise(p_incident uuid, p_generation int, p_state text, p_due timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare j public.field_job;
begin
  select * into j from public.field_job where incident = p_incident for update;
  if not found or j.generation <> p_generation or j.state <> p_state then return; end if;   -- a newer update won
  update public.promise set settled_at = now(), outcome = case when kind = 'eta' and p_state = 'on_way' then 'replaced' else 'kept' end
    where incident = p_incident and kind in ('eta', 'arrived') and settled_at is null;
  update public.field_job set reestimate_gen = null where incident = p_incident and reestimate_gen is not null;
  if p_due is not null and p_state in ('on_way', 'arrived') and not j.case_closed then
    insert into public.promise (incident, kind, generation, due_at, made_by)
      values (p_incident, case when p_state = 'on_way' then 'eta' else 'arrived' end, p_generation, p_due,
              (select display_name from ichido.staff where uid = j.assignee));
  end if;
end $$;

-- The bot's one action on a promise: expire it once its time has passed (the workflow slept until due_at).
-- The caller gets the approved "still working on it" status, the console an event (toast), the guard a re-estimate ask.
create function public.ops_promise_expire(p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare p public.promise; d public.desk; j public.field_job;
begin
  select * into p from public.promise where id = p_id;
  if not found then return 'gone'; end if;
  select * into d from public.desk where id = p.incident for update;
  select * into p from public.promise where id = p_id for update;
  if p.settled_at is not null then return 'settled'; end if;
  if d.finished_at is not null then
    update public.promise set settled_at = now(), outcome = 'closed' where id = p_id;
    return 'closed';
  end if;
  if p.kind in ('eta', 'arrived') then
    select * into j from public.field_job where incident = d.id for update;
    if not found or j.generation <> p.generation or j.case_closed
       or j.state <> (case p.kind when 'eta' then 'on_way' else 'arrived' end) then
      update public.promise set settled_at = now(), outcome = 'replaced' where id = p_id;
      return 'moved';
    end if;
    update public.field_job set reestimate_gen = j.generation where incident = d.id;
  end if;
  update public.promise set settled_at = now(), outcome = 'expired' where id = p_id;
  update public.caller_card set notice = 'still_working', notice_at = now() where id = d.id and not fraud;
  perform ichido.event(d.id, 'bot', 'promise_due', jsonb_strip_nulls(jsonb_build_object('kind', p.kind, 'by', p.made_by)));
  return 'expired';
end $$;

-- 9. Insights: counts only.
create function public.insights_ops(p_days int default 14) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  tz constant text := 'Asia/Tokyo';
  since timestamptz;
begin
  if not (ichido.has_role('operator') or ichido.has_role('manager')) then perform ichido.fail('forbidden'); end if;
  if p_days not in (7, 14, 30) then perform ichido.fail('bad_request'); end if;
  since := (date_trunc('day', now() at time zone tz) - make_interval(days => p_days - 1)) at time zone tz;
  return (
    with c as (
      select d.*, d.fault = 'card_retained' as captured,
        d.fault = 'card_retained' and d.status = 'guided' and d.finished_at is not null
          and (d.finished_at at time zone tz)::date = (d.created_at at time zone tz)::date as same_day
      from public.desk d where d.created_at >= since
    ), e as (
      select e.kind from public.case_event e join c on c.id = e.incident where e.kind in ('takeover', 'broadcast')
    ), p as (
      select p.outcome from public.promise p join c on c.id = p.incident
    )
    select jsonb_build_object(
      'fraud', (select count(*) from c where fraud_at is not null),
      'abusive', (select count(*) from c where abusive_at is not null),
      'takeovers', (select count(*) from e where kind = 'takeover'),
      'mass_incidents', (select count(distinct mass_incident) from c),
      'broadcasts', (select count(*) from e where kind = 'broadcast'),
      'promises', (select count(*) from p),
      'promises_expired', (select count(*) from p where outcome = 'expired'),
      'captured', (select count(*) from c where captured),
      'resolved_same_day', (select count(*) from c where same_day),
      'per_day', (
        select coalesce(jsonb_agg(jsonb_build_object('day', g::date,
          'captured', (select count(*) from c where captured and (c.created_at at time zone tz)::date = g::date),
          'resolved', (select count(*) from c where same_day and (c.created_at at time zone tz)::date = g::date)) order by g), '[]')
        from generate_series((since at time zone tz)::date, (now() at time zone tz)::date, interval '1 day') g)
    )
  );
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'cmd_assign(uuid,text,uuid,uuid)', 'cmd_fraud(uuid,text,uuid,uuid)', 'cmd_abusive(uuid,text,uuid)', 'cmd_takeover(uuid,text,uuid)',
    'cmd_broadcast(uuid,text,uuid)', 'cmd_promise(uuid,text,uuid,text,int,timestamptz)', 'cmd_promise_done(uuid,text,uuid)',
    'ops_field_promise(uuid,int,text,timestamptz)', 'ops_promise_expire(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
revoke all on function public.insights_ops(int) from public, anon;
grant execute on function public.insights_ops(int) to authenticated;
revoke all on function ichido.set_light(text, uuid, text), ichido.group_mass() from public, anon, authenticated;
