-- Commands. Each runs in one transaction with its preconditions checked inside the same statement
-- or under a row lock, so concurrent requests cannot both succeed. Callable by the server only.
-- Errors are raised with a stable code the route maps to HTTP: forbidden, not_found, conflict, bad_request, rate_limited.

create function ichido.fail(code text) returns void language plpgsql as $$
begin
  raise exception using message = code, errcode = 'P0001';
end $$;

-- Set a station's light for an incident, but never over a newer open case at the same station.
create function ichido.set_light(p_station text, p_incident uuid, p_state text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.station where id = p_station for update;
  if exists (select 1 from public.desk where station = p_station and finished_at is null and id <> p_incident) then return; end if;
  insert into public.light (station, state, updated_at) values (p_station, p_state, now())
    on conflict (station) do update set state = excluded.state, updated_at = now();
end $$;

create function ichido.event(p_incident uuid, p_actor text, p_kind text, p_data jsonb, p_name text default null) returns void
language sql security definer set search_path = '' as $$
  insert into public.case_event (incident, actor, kind, data, actor_name) values (p_incident, p_actor, p_kind, coalesce(p_data, '{}'), p_name)
$$;

-- The operator's own open case, locked.
create function ichido.owned_case(p_uid uuid, p_incident uuid) returns public.desk
language plpgsql security definer set search_path = '' as $$
declare d public.desk;
begin
  select * into d from public.desk where id = p_incident for update;
  if not found then perform ichido.fail('not_found'); end if;
  if d.finished_at is not null then perform ichido.fail('conflict'); end if;
  if d.operator_id is distinct from p_uid then perform ichido.fail('forbidden'); end if;
  return d;
end $$;

-- The caller's open case, via their binding.
create function ichido.caller_case(p_uid uuid) returns public.desk
language plpgsql security definer set search_path = '' as $$
declare d public.desk;
begin
  select d2.* into d from public.desk d2 join ichido.binding b on b.incident = d2.id
    where b.uid = p_uid and b.expires > now() for update of d2;
  if not found then perform ichido.fail('forbidden'); end if;
  if d.finished_at is not null then perform ichido.fail('conflict'); end if;
  return d;
end $$;

create function public.cmd_claim(p_uid uuid, p_name text, p_incident uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare s text;
begin
  update public.desk set operator_id = p_uid, status = 'review'
    where id = p_incident and finished_at is null and operator_id is null returning station into s;
  if s is null then
    if exists (select 1 from public.desk where id = p_incident and finished_at is null and operator_id = p_uid) then return; end if;
    perform ichido.fail('conflict');
  end if;
  update public.caller_card set status = 'review' where id = p_incident;
  perform ichido.set_light(s, p_incident, 'review');
  perform ichido.event(p_incident, 'operator', 'claimed', '{}', p_name);
end $$;

create function public.cmd_remote_release(p_uid uuid, p_name text, p_incident uuid, p_result text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform ichido.owned_case(p_uid, p_incident);
  if p_result not in ('failed', 'released') then perform ichido.fail('bad_request'); end if;
  update public.desk set remote_release = p_result where id = p_incident;
  perform ichido.event(p_incident, 'operator', 'remote_release', jsonb_build_object('result', p_result), p_name);
end $$;

-- p_needs_held: the reply says the card is still inside, so it needs a caller-confirmed "not back" and no successful release.
create function public.cmd_send(p_uid uuid, p_name text, p_incident uuid, p_intent text, p_manual text, p_needs_held boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare d public.desk; st public.station; r uuid;
begin
  d := ichido.owned_case(p_uid, p_incident);
  if d.confirmed_rev is null or d.clarifying then perform ichido.fail('conflict'); end if;
  if p_needs_held and (d.card_back <> 'no' or d.remote_release = 'released') then perform ichido.fail('conflict'); end if;
  select * into st from public.station where id = d.station;
  insert into public.reply (incident, intent, slots, manual_version, operator_id)
    values (d.id, p_intent, jsonb_build_object('branch', st.branch, 'hours', st.counter_hours), p_manual, p_uid)
    returning id into r;
  -- New guidance supersedes any earlier choice and teach-back.
  update public.caller_card set reply_id = r, choice = null, teachback = null, teachback_ja = null, teachback_reply = null, teachback_result = null
    where id = d.id;
  perform ichido.event(d.id, 'operator', 'reply', jsonb_build_object('intent', p_intent), p_name);
  return r;
end $$;

create function public.cmd_assign(p_uid uuid, p_name text, p_incident uuid, p_assignee uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.desk; guard text; prev public.field_job;
begin
  d := ichido.owned_case(p_uid, p_incident);
  select display_name into guard from ichido.staff where uid = p_assignee and role = 'field';
  if guard is null then perform ichido.fail('bad_request'); end if;
  select * into prev from public.field_job where incident = d.id for update;
  if found and prev.assignee = p_assignee and not prev.case_closed then return; end if;
  insert into public.field_job (incident, station, fault, assignee, generation, state, eta, case_closed, updated_at)
    values (d.id, d.station, d.fault, p_assignee, coalesce(prev.generation, 0) + 1, 'requested', null, false, now())
    on conflict (incident) do update set assignee = excluded.assignee, generation = excluded.generation,
      state = 'requested', eta = null, case_closed = false, updated_at = now();
  update public.desk set status = 'field' where id = d.id;
  update public.caller_card set status = 'field', field_state = 'requested', eta = null where id = d.id;
  perform ichido.set_light(d.station, d.id, 'field');
  perform ichido.event(d.id, 'operator', case when prev.incident is null then 'dispatch' else 'redispatch' end,
                       jsonb_build_object('assignee', guard), p_name);
end $$;

-- Only the current assignee of the current generation may update an open job.
create function public.cmd_field(p_uid uuid, p_name text, p_incident uuid, p_generation int, p_state text, p_eta text) returns void
language plpgsql security definer set search_path = '' as $$
declare guided boolean;
begin
  if p_state not in ('on_way', 'arrived', 'done') then perform ichido.fail('bad_request'); end if;
  select d.status = 'guided' into guided from public.desk d where d.id = p_incident;
  update public.field_job set state = p_state, eta = case when p_state = 'on_way' then p_eta end, updated_at = now(),
         case_closed = (p_state = 'done' and coalesce(guided, false))
    where incident = p_incident and assignee = p_uid and generation = p_generation and not case_closed;
  if not found then perform ichido.fail('forbidden'); end if;
  update public.caller_card set field_state = p_state, eta = case when p_state = 'on_way' then p_eta end where id = p_incident;
  perform ichido.event(p_incident, 'field', 'field',
    jsonb_strip_nulls(jsonb_build_object('state', p_state, 'eta', case when p_state = 'on_way' then p_eta end)), p_name);
end $$;

-- A caller's edit against an exact revision. Null facts are unchanged. Edits stop once the report is confirmed.
create function public.cmd_draft(p_uid uuid, p_rev int, p_card public.fact, p_cash public.fact, p_words text, p_clarify boolean) returns int
language plpgsql security definer set search_path = '' as $$
declare d public.desk; next_rev int;
begin
  d := ichido.caller_case(p_uid);
  if exists (select 1 from public.caller_card where id = d.id and confirmed_rev is not null) then perform ichido.fail('conflict'); end if;
  update public.draft set
      card_back = coalesce(p_card, card_back),
      cash_received = coalesce(p_cash, cash_received),
      -- keep every accepted utterance so the operator sees the words behind each fact
      words = case when p_words is null then words else left(concat_ws(' / ', words, p_words), 1500) end,
      needs_clarification = coalesce(p_clarify, false),
      rev = rev + 1
    where incident = d.id and rev = p_rev
    returning rev into next_rev;
  if next_rev is null then perform ichido.fail('conflict'); end if;
  update public.desk set clarifying = coalesce(p_clarify, false) where id = d.id;
  return next_rev;
end $$;

create function public.cmd_confirm(p_uid uuid, p_rev int) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.desk; dr public.draft;
begin
  d := ichido.caller_case(p_uid);
  select * into dr from public.draft where incident = d.id for update;
  if dr.rev <> p_rev or dr.needs_clarification or (dr.card_back = 'unknown' and dr.cash_received = 'unknown') then
    perform ichido.fail('conflict');
  end if;
  if exists (select 1 from public.caller_card where id = d.id and confirmed_rev is not null) then perform ichido.fail('conflict'); end if;
  update public.desk set card_back = dr.card_back, cash_received = dr.cash_received, confirmed_rev = dr.rev,
                         caller_words = dr.words, clarifying = false where id = d.id;
  update public.caller_card set confirmed_rev = dr.rev where id = d.id;
  perform ichido.event(d.id, 'caller', 'confirmed', jsonb_build_object('card_back', dr.card_back, 'cash_received', dr.cash_received));
end $$;

-- A choice is only possible after a reply that offers it, and before guidance is confirmed.
create function public.cmd_choose(p_uid uuid, p_choice text, p_choice_intents text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.desk;
begin
  d := ichido.caller_case(p_uid);
  if p_choice not in ('wait', 'leave') then perform ichido.fail('bad_request'); end if;
  update public.caller_card c set choice = p_choice
    where c.id = d.id and c.teachback_result is distinct from 'understood'
      and exists (select 1 from public.reply r where r.id = c.reply_id and r.intent = any (p_choice_intents));
  if not found then perform ichido.fail('conflict'); end if;
  perform ichido.event(d.id, 'caller', 'choice', jsonb_build_object('choice', p_choice));
end $$;

create function public.cmd_teachback(p_uid uuid, p_text text, p_ja text) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.desk;
begin
  d := ichido.caller_case(p_uid);
  update public.caller_card set teachback = p_text, teachback_ja = p_ja, teachback_reply = reply_id, teachback_result = null
    where id = d.id and reply_id is not null and teachback_result is distinct from 'understood';
  if not found then perform ichido.fail('conflict'); end if;
  perform ichido.event(d.id, 'caller', 'teachback', '{}');
end $$;

create function public.cmd_human(p_uid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.desk;
begin
  d := ichido.caller_case(p_uid);
  update public.caller_card set needs_human = true where id = d.id and not needs_human;
  if found then perform ichido.event(d.id, 'caller', 'human', '{}'); end if;
end $$;

-- The operator judges a teach-back that answers the current reply. Guidance closes the case;
-- a guard still on the way keeps their job open until they finish it.
create function public.cmd_outcome(p_uid uuid, p_name text, p_incident uuid, p_reply uuid, p_result text) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.desk; c public.caller_card;
begin
  d := ichido.owned_case(p_uid, p_incident);
  select * into c from public.caller_card where id = d.id for update;
  if c.teachback is null or c.teachback_reply is distinct from p_reply or c.reply_id is distinct from p_reply then
    perform ichido.fail('conflict');
  end if;
  if p_result = 'clarify' then
    update public.caller_card set teachback_result = 'clarify', teachback = null, teachback_ja = null, teachback_reply = null where id = d.id;
    perform ichido.event(d.id, 'operator', 'clarify', '{}', p_name);
    return;
  end if;
  if p_result <> 'understood' then perform ichido.fail('bad_request'); end if;
  update public.caller_card set teachback_result = 'understood', status = 'guided' where id = d.id;
  update public.desk set status = 'guided', guided_at = now(), finished_at = now() where id = d.id;
  update public.field_job set case_closed = true where incident = d.id and state = 'done';
  perform ichido.set_light(d.station, d.id, 'guided');
  perform ichido.event(d.id, 'operator', 'guided', '{}', p_name);
end $$;

-- Recovery: the caller lost their phone or session; retire the binding so a new code can be issued.
create function public.cmd_reset_caller(p_uid uuid, p_name text, p_incident uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform ichido.owned_case(p_uid, p_incident);
  delete from ichido.binding where incident = p_incident;
  delete from ichido.pair_code where incident = p_incident;
  update public.caller_card set confirmed_rev = null, choice = null, teachback = null, teachback_ja = null,
         teachback_reply = null, teachback_result = null, needs_human = false where id = p_incident;
  update public.draft set rev = rev + 1, card_back = 'unknown', cash_received = 'unknown', words = null, needs_clarification = false
    where incident = p_incident;
  update public.desk set confirmed_rev = null, clarifying = false where id = p_incident;
  perform ichido.event(p_incident, 'operator', 'caller_reset', '{}', p_name);
end $$;

-- Close a case nobody can finish (caller gone). Any job not yet started is cancelled.
create function public.cmd_abandon(p_uid uuid, p_name text, p_incident uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.desk;
begin
  d := ichido.owned_case(p_uid, p_incident);
  update public.desk set finished_at = now(), abandoned = true where id = d.id;
  update public.field_job set case_closed = true where incident = d.id and state in ('requested', 'done');
  delete from ichido.binding where incident = d.id;
  delete from ichido.pair_code where incident = d.id;
  perform ichido.set_light(d.station, d.id, 'idle');
  perform ichido.event(d.id, 'operator', 'abandoned', '{}', p_name);
end $$;

-- Pairing attempts are recorded in their own transaction so failed guesses still count.
create function public.note_pair_attempt(p_uid uuid, p_station text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  delete from ichido.pair_attempt where at < now() - interval '1 hour';
  insert into ichido.pair_attempt (uid, station) values (p_uid, p_station);
  return (select count(*) from ichido.pair_attempt where uid = p_uid and at > now() - interval '5 minutes') <= 5
     and (select count(*) from ichido.pair_attempt where station = p_station and at > now() - interval '5 minutes') <= 30;
end $$;

create or replace function public.redeem_pair(p_uid uuid, p_station text, p_digest text, p_lang text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare i uuid;
begin
  if not exists (select 1 from auth.users where id = p_uid and is_anonymous)
     or exists (select 1 from ichido.staff where uid = p_uid) then
    perform ichido.fail('forbidden');
  end if;
  delete from ichido.binding where uid = p_uid and expires <= now();   -- an expired phone may pair again
  select d.id into i from public.desk d join ichido.pair_code c on c.incident = d.id
    where d.station = p_station and d.finished_at is null and c.digest = p_digest and c.expires > now()
    for update of d, c;
  if i is null or exists (select 1 from ichido.binding where incident = i) then perform ichido.fail('forbidden'); end if;
  delete from ichido.pair_code where incident = i;
  insert into ichido.binding (incident, uid, lang, expires) values (i, p_uid, p_lang, now() + interval '2 hours');
  update public.desk set lang = p_lang where id = i;
  update public.caller_card set lang = p_lang where id = i;
  perform ichido.event(i, 'caller', 'paired', jsonb_build_object('lang', p_lang));
  return i;
end $$;

-- Insights in Japan time, over a supported period, with a cumulative funnel (each stage only counts
-- cases that passed the previous one), so a conversion rate can never exceed 100%.
create or replace function public.insights(p_days int default 14)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  tz constant text := 'Asia/Tokyo';
  since timestamptz;
begin
  if not (ichido.has_role('operator') or ichido.has_role('manager')) then perform ichido.fail('forbidden'); end if;
  if p_days not in (7, 14, 30) then perform ichido.fail('bad_request'); end if;
  since := (date_trunc('day', now() at time zone tz) - make_interval(days => p_days - 1)) at time zone tz;
  return (
    with c as (
      select d.*,
        exists (select 1 from public.case_event e where e.incident = d.id and e.kind = 'claimed') as claimed,
        exists (select 1 from public.reply r where r.incident = d.id) as replied,
        exists (select 1 from public.field_job f where f.incident = d.id) as dispatched
      from public.desk d where d.created_at >= since
    )
    select jsonb_build_object(
      'since', since,
      'funnel', jsonb_build_object(
        'received', count(*),
        'claimed', count(*) filter (where claimed),
        'confirmed', count(*) filter (where claimed and confirmed_rev is not null),
        'replied', count(*) filter (where claimed and confirmed_rev is not null and replied),
        'guided', count(*) filter (where claimed and confirmed_rev is not null and replied and status = 'guided')),
      'dispatched', count(*) filter (where dispatched),
      'abandoned', count(*) filter (where abandoned),
      'per_day', (
        select coalesce(jsonb_agg(jsonb_build_object('day', g::date, 'n',
          (select count(*) from c where (c.created_at at time zone tz)::date = g::date)) order by g), '[]')
        from generate_series((since at time zone tz)::date, (now() at time zone tz)::date, interval '1 day') g),
      'per_hour', (
        select jsonb_agg(jsonb_build_object('hour', h, 'n',
          (select count(*) from c where extract(hour from c.created_at at time zone tz) = h)) order by h)
        from generate_series(0, 23) h),
      'languages', (
        select coalesce(jsonb_object_agg(lang, n), '{}')
        from (select coalesce(lang, 'none') as lang, count(*) as n from c group by 1) x),
      'median_first_reply_s', (
        select percentile_cont(0.5) within group (order by extract(epoch from r.first - c.created_at))
        from c join (select incident, min(sent_at) as first from public.reply group by incident) r on r.incident = c.id),
      'choices', (
        select coalesce(jsonb_object_agg(choice, n), '{}')
        from (select cc.choice, count(*) as n from public.caller_card cc join c on c.id = cc.id
              where cc.choice is not null group by 1) x)
    ) from c
  );
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'cmd_claim(uuid,text,uuid)', 'cmd_remote_release(uuid,text,uuid,text)', 'cmd_send(uuid,text,uuid,text,text,boolean)',
    'cmd_assign(uuid,text,uuid,uuid)', 'cmd_field(uuid,text,uuid,int,text,text)',
    'cmd_draft(uuid,int,public.fact,public.fact,text,boolean)', 'cmd_confirm(uuid,int)', 'cmd_choose(uuid,text,text[])',
    'cmd_teachback(uuid,text,text)', 'cmd_human(uuid)', 'cmd_outcome(uuid,text,uuid,uuid,text)',
    'cmd_reset_caller(uuid,text,uuid)', 'cmd_abandon(uuid,text,uuid)', 'note_pair_attempt(uuid,text)', 'redeem_pair(uuid,text,text,text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
revoke all on function public.insights(int) from public, anon;
grant execute on function public.insights(int) to authenticated;
revoke all on all functions in schema ichido from public, anon;
grant execute on function ichido.has_role(public.staff_role), ichido.is_staff(), ichido.owns(uuid),
  ichido.owns_station(text), ichido.guards_station(text) to authenticated;
