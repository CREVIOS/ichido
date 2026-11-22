-- Ichido Bot: a durable per-case workflow (web/workflows/case-bot.ts) that routes, prepares, reminds and records.
-- It never claims, replies, dispatches or closes: every function here writes the bot's own rows and timeline events only.

alter table public.case_event drop constraint case_event_actor_check,
  add constraint case_event_actor_check check (actor in ('device', 'caller', 'agent', 'operator', 'field', 'system', 'bot'));

-- One row per workflow step, for the console's Ichido Bot panel. Codes and numbers only.
create table public.bot_step (
  incident uuid not null references public.desk on delete cascade,
  step text not null check (step in ('route', 'claim', 'prepare', 'remind_reply', 'remind_guard', 'record')),
  status text not null default 'waiting' check (status in ('waiting', 'done', 'skipped')),
  code text check (code ~ '^[a-z_]{1,32}$'),   -- why: no_key, replied, moved, closed …
  due_at timestamptz,                         -- when a reminder is scheduled
  data jsonb not null default '{}',
  at timestamptz not null default now(),
  primary key (incident, step)
);

-- The Gemini suggestion the bot precomputed when the caller confirmed (or the operator's latest refresh).
create table public.bot_suggestion (
  incident uuid primary key references public.desk on delete cascade,
  rev int not null,
  suggestion jsonb not null,
  at timestamptz not null default now()
);

-- The after-call record written at close: the catalogue's summary sentence (guided cases) and durations in seconds.
create table public.case_record (
  incident uuid primary key references public.desk on delete cascade,
  summary text,
  claim_s int,
  first_reply_s int,
  guard_arrival_s int,
  total_s int not null,
  at timestamptz not null default now()
);

-- Which job generation the guard was reminded about (the field screen shows a banner while it matches).
alter table public.field_job add column reminded_gen int;

do $$
declare t text;
begin
  foreach t in array array['bot_step', 'bot_suggestion', 'case_record'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('create policy operator_read on public.%I for select to authenticated using (ichido.has_role(''operator''))', t);
  end loop;
end $$;
alter publication supabase_realtime add table public.bot_step, public.bot_suggestion, public.case_record;

create function public.bot_mark(p_incident uuid, p_step text, p_status text, p_code text default null,
                                p_data jsonb default '{}', p_due timestamptz default null) returns void
language sql security definer set search_path = '' as $$
  insert into public.bot_step (incident, step, status, code, data, due_at) values (p_incident, p_step, p_status, p_code, coalesce(p_data, '{}'), p_due)
  on conflict (incident, step) do update set status = excluded.status, code = excluded.code, data = excluded.data,
    due_at = excluded.due_at, at = now()
$$;

-- A reminder, only if it is still needed. Locks the desk (and job) like the commands do, so a reply or a guard
-- update in flight either lands first (no reminder) or after (reminder stands). Returns the outcome code.
create function public.bot_remind(p_incident uuid, p_reason text, p_gen int default null) returns text
language plpgsql security definer set search_path = '' as $$
declare d public.desk; j public.field_job; target int;
begin
  select * into d from public.desk where id = p_incident for update;
  if not found or d.finished_at is not null then return 'closed'; end if;
  select seconds into target from ichido.sla_target where reason = p_reason;
  if p_reason = 'no_reply' then
    if exists (select 1 from public.reply where incident = d.id) then
      perform public.bot_mark(d.id, 'remind_reply', 'skipped', 'replied');
      return 'replied';
    end if;
    perform ichido.event(d.id, 'bot', 'bot_remind', jsonb_build_object('reason', p_reason, 'target_s', target));
    perform public.bot_mark(d.id, 'remind_reply', 'done', 'reminded', jsonb_build_object('target_s', target));
    return 'reminded';
  elsif p_reason = 'guard_late' then
    select * into j from public.field_job where incident = d.id for update;
    if not found or j.generation <> p_gen then return 'moved'; end if;   -- a newer dispatch has its own schedule
    if j.state <> 'requested' or j.case_closed then
      perform public.bot_mark(d.id, 'remind_guard', 'skipped', 'moved', jsonb_build_object('generation', p_gen));
      return 'moved';
    end if;
    update public.field_job set reminded_gen = p_gen where incident = d.id;
    perform ichido.event(d.id, 'bot', 'bot_remind', jsonb_build_object('reason', p_reason, 'target_s', target,
      'assignee', (select display_name from ichido.staff where uid = j.assignee)));
    perform public.bot_mark(d.id, 'remind_guard', 'done', 'reminded', jsonb_build_object('generation', p_gen, 'target_s', target));
    return 'reminded';
  end if;
  perform ichido.fail('bad_request');
end $$;

-- The after-call record of a closed case, once. Durations come from the audit trail; nothing is free text.
create function public.bot_close(p_incident uuid, p_summary text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d public.desk; r public.case_record; secs jsonb;
begin
  select * into d from public.desk where id = p_incident for update;
  if not found or d.finished_at is null then perform ichido.fail('conflict'); end if;
  insert into public.case_record (incident, summary, claim_s, first_reply_s, guard_arrival_s, total_s)
  select d.id, case when d.status = 'guided' then p_summary end,
    (select extract(epoch from min(at) - d.created_at)::int from public.case_event where incident = d.id and kind = 'claimed'),
    (select extract(epoch from min(sent_at) - d.created_at)::int from public.reply where incident = d.id),
    (select extract(epoch from min(a.at) - min(s.at))::int
       from public.case_event a, public.case_event s
       where a.incident = d.id and a.kind = 'field' and a.data->>'state' = 'arrived'
         and s.incident = d.id and s.kind = 'dispatch'),
    extract(epoch from d.finished_at - d.created_at)::int
  on conflict (incident) do nothing
  returning * into r;
  if r.incident is null then select * into r from public.case_record where incident = d.id;
  else
    secs := jsonb_strip_nulls(jsonb_build_object('claim_s', r.claim_s, 'first_reply_s', r.first_reply_s,
      'guard_arrival_s', r.guard_arrival_s, 'total_s', r.total_s));
    perform ichido.event(d.id, 'bot', 'bot_closed', secs);
    update public.bot_step set status = 'skipped', code = 'closed', due_at = null, at = now()
      where incident = d.id and status = 'waiting' and step <> 'record';
    perform public.bot_mark(d.id, 'record', 'done', null, secs);
  end if;
  return to_jsonb(r) - 'summary' - 'incident';
end $$;

-- Medians of the recorded durations for insights: operators and managers, counts and seconds only.
create function public.insights_bot(p_days int default 14) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  tz constant text := 'Asia/Tokyo';
  since timestamptz;
begin
  if not (ichido.has_role('operator') or ichido.has_role('manager')) then perform ichido.fail('forbidden'); end if;
  if p_days not in (7, 14, 30) then perform ichido.fail('bad_request'); end if;
  since := (date_trunc('day', now() at time zone tz) - make_interval(days => p_days - 1)) at time zone tz;
  return (
    select jsonb_build_object(
      'records', count(*),
      'claim_s', percentile_cont(0.5) within group (order by r.claim_s),
      'first_reply_s', percentile_cont(0.5) within group (order by r.first_reply_s),
      'guard_arrival_s', percentile_cont(0.5) within group (order by r.guard_arrival_s),
      'total_s', percentile_cont(0.5) within group (order by r.total_s))
    from public.case_record r join public.desk d on d.id = r.incident where d.created_at >= since
  );
end $$;

revoke all on function public.bot_mark(uuid, text, text, text, jsonb, timestamptz), public.bot_remind(uuid, text, int),
  public.bot_close(uuid, text) from public, anon, authenticated;
grant execute on function public.bot_mark(uuid, text, text, text, jsonb, timestamptz), public.bot_remind(uuid, text, int),
  public.bot_close(uuid, text) to service_role;
revoke all on function public.insights_bot(int) from public, anon;
grant execute on function public.insights_bot(int) to authenticated;
