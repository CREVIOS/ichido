-- Ichido schema. Clients only ever SELECT, through row-level security.
-- Every write goes through server route handlers (service role) that check the actor first.
-- No display text lives here: rows hold codes and data; wording comes from web/content/catalogue.ts.

create schema if not exists ichido;
revoke all on schema ichido from public, anon, authenticated;
grant usage on schema ichido to authenticated;

create type public.staff_role as enum ('operator', 'field', 'manager');
create type public.case_status as enum ('received', 'review', 'field', 'guided');
create type public.fact as enum ('unknown', 'yes', 'no');

-- Staff accounts (seeded). Callers are anonymous Auth users and never appear here.
create table ichido.staff (
  uid uuid primary key references auth.users on delete cascade,
  role public.staff_role not null,
  display_name text not null
);

-- A machine location. Labels, branch and counter hours are per language: {"ja": …, "bn": …, "en": …}.
create table public.station (
  id text primary key,
  label jsonb not null,
  branch jsonb not null,
  counter_hours jsonb not null,
  security_company text not null
);

-- One incident per open station.
create table public.desk (
  id uuid primary key default gen_random_uuid(),
  station text not null references public.station,
  source text not null check (source in ('device', 'simulator')),
  fault text not null,                 -- key into FAULTS in the catalogue
  status public.case_status not null default 'received',
  operator_id uuid references ichido.staff,
  lang text check (lang in ('bn', 'en', 'ja')),
  card_back public.fact not null default 'unknown',       -- the caller's own statement
  cash_received public.fact not null default 'unknown',   -- the caller's own statement
  confirmed_rev int,
  caller_words text,                   -- caller's original wording, shared only after confirmation
  remote_release text check (remote_release in ('failed', 'released')),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create unique index one_open_case_per_station on public.desk (station) where finished_at is null;

create table ichido.device_event (
  station text not null references public.station,
  event_key text not null check (event_key ~ '^[0-9a-f]{32}$'),
  incident uuid not null references public.desk on delete cascade,
  primary key (station, event_key)
);

create table ichido.pair_code (
  incident uuid primary key references public.desk on delete cascade,
  digest text unique not null,
  expires timestamptz not null
);

-- A caller (anonymous user) is bound to exactly one incident, and an incident to one caller.
create table ichido.binding (
  incident uuid primary key references public.desk on delete cascade,
  uid uuid unique not null references auth.users on delete cascade,
  lang text not null check (lang in ('bn', 'en', 'ja')),
  expires timestamptz not null
);

-- The caller's working draft: what the assistant understood, before the caller confirms it.
create table public.draft (
  incident uuid primary key references public.desk on delete cascade,
  rev int not null default 0,
  card_back public.fact not null default 'unknown',
  cash_received public.fact not null default 'unknown',
  words text,
  needs_clarification boolean not null default false
);

-- What the caller's phone shows.
create table public.caller_card (
  id uuid primary key references public.desk on delete cascade,
  station text not null references public.station,
  fault text not null,
  lang text check (lang in ('bn', 'en', 'ja')),
  confirmed_rev int,
  status public.case_status not null default 'received',
  field_state text not null default 'none' check (field_state in ('none', 'requested', 'on_way', 'arrived', 'done')),
  eta text,                            -- the guard's own estimate, e.g. '30-45'; null = unknown
  choice text check (choice in ('wait', 'leave')),
  teachback text,
  teachback_result text check (teachback_result in ('understood', 'clarify')),
  needs_human boolean not null default false
);

-- Replies are chosen from the reviewed catalogue only; slots are filled from station data on the server.
create table public.reply (
  id uuid primary key default gen_random_uuid(),
  incident uuid not null references public.desk on delete cascade,
  intent text not null,
  slots jsonb not null default '{}',
  manual_version text not null,
  operator_id uuid not null references ichido.staff,
  sent_at timestamptz not null default now()
);

create table public.field_job (
  incident uuid primary key references public.desk on delete cascade,
  station text not null references public.station,
  fault text not null,
  assignee uuid not null references ichido.staff,
  state text not null default 'requested' check (state in ('requested', 'on_way', 'arrived', 'done')),
  eta text,
  case_closed boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Timeline for staff: event codes plus data; never free speech.
create table public.case_event (
  id bigint generated always as identity primary key,
  incident uuid not null references public.desk on delete cascade,
  actor text not null check (actor in ('device', 'caller', 'agent', 'operator', 'field', 'system')),
  actor_name text,
  kind text not null,
  data jsonb not null default '{}',
  at timestamptz not null default now()
);
create index case_event_incident on public.case_event (incident, id);

create table public.light (
  station text primary key references public.station,
  state text not null default 'idle' check (state in ('idle', 'received', 'review', 'field', 'guided')),
  updated_at timestamptz not null default now()
);

-- Helper checks used by policies.
create function ichido.has_role(r public.staff_role) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from ichido.staff s where s.uid = auth.uid() and s.role = r)
$$;
create function ichido.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from ichido.staff s where s.uid = auth.uid())
$$;
create function ichido.owns(i uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from ichido.binding b where b.incident = i and b.uid = auth.uid() and b.expires > now())
$$;
create function ichido.owns_station(s text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from ichido.binding b join public.desk d on d.id = b.incident
                 where d.station = s and b.uid = auth.uid() and b.expires > now())
$$;
revoke all on all functions in schema ichido from public, anon, authenticated;
grant execute on function ichido.has_role(public.staff_role), ichido.is_staff(), ichido.owns(uuid),
  ichido.owns_station(text) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['station','desk','draft','caller_card','reply','field_job','case_event','light'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

create policy station_read on public.station for select to authenticated
  using (ichido.is_staff() or ichido.owns_station(id));
create policy operator_desk on public.desk for select to authenticated
  using (ichido.has_role('operator'));
create policy caller_draft on public.draft for select to authenticated
  using (ichido.owns(incident) or ichido.has_role('operator'));
create policy caller_card_read on public.caller_card for select to authenticated
  using (ichido.owns(id) or ichido.has_role('operator'));
create policy reply_read on public.reply for select to authenticated
  using (ichido.owns(incident) or ichido.has_role('operator'));
create policy field_job_read on public.field_job for select to authenticated
  using (ichido.has_role('operator') or (ichido.has_role('field') and assignee = auth.uid()));
create policy events_read on public.case_event for select to authenticated
  using (ichido.has_role('operator'));
create policy light_read on public.light for select to authenticated
  using (ichido.is_staff());

alter publication supabase_realtime add table
  public.desk, public.draft, public.caller_card, public.reply, public.field_job, public.case_event, public.light;

-- Race-sensitive commands live in SQL so each runs in one transaction.

-- A machine fault: idempotent per (station, event_key); one open case per station.
create function public.record_fault(p_station text, p_key text, p_source text, p_fault text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare i uuid;
begin
  perform 1 from public.station where id = p_station for update;
  if not found then raise exception 'unknown station'; end if;
  select incident into i from ichido.device_event where station = p_station and event_key = p_key;
  if found then return i; end if;
  select id into i from public.desk where station = p_station and finished_at is null;
  if i is null then
    insert into public.desk (station, source, fault) values (p_station, p_source, p_fault) returning id into i;
    insert into public.draft (incident) values (i);
    insert into public.caller_card (id, station, fault) values (i, p_station, p_fault);
    insert into public.case_event (incident, actor, kind, data)
      values (i, case when p_source = 'device' then 'device' else 'system' end, 'fault',
              jsonb_build_object('fault', p_fault, 'source', p_source));
    insert into public.light (station, state) values (p_station, 'received')
      on conflict (station) do update set state = 'received', updated_at = now();
  end if;
  insert into ichido.device_event values (p_station, p_key, i);
  return i;
end $$;

-- Redeem a single-use pairing code: binds one anonymous caller to one incident.
create function public.redeem_pair(p_uid uuid, p_station text, p_digest text, p_lang text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare i uuid;
begin
  if not exists (select 1 from auth.users where id = p_uid and is_anonymous)
     or exists (select 1 from ichido.staff where uid = p_uid) then
    raise exception 'unavailable';
  end if;
  select d.id into i from public.desk d join ichido.pair_code c on c.incident = d.id
    where d.station = p_station and d.finished_at is null and c.digest = p_digest and c.expires > now()
    for update of d, c;
  if i is null then raise exception 'unavailable'; end if;
  delete from ichido.pair_code where incident = i;
  insert into ichido.binding (incident, uid, lang, expires) values (i, p_uid, p_lang, now() + interval '2 hours');
  update public.desk set lang = p_lang where id = i;
  update public.caller_card set lang = p_lang where id = i;
  insert into public.case_event (incident, actor, kind, data)
    values (i, 'caller', 'paired', jsonb_build_object('lang', p_lang));
  return i;
end $$;

-- Aggregates for the insights page: counts only, no caller text. Operators and managers only.
create function public.insights(p_days int default 14)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare since timestamptz := date_trunc('day', now()) - make_interval(days => p_days - 1);
begin
  if not (ichido.has_role('operator') or ichido.has_role('manager')) then
    raise exception 'forbidden';
  end if;
  return jsonb_build_object(
    'since', since,
    'funnel', (
      select jsonb_build_object(
        'received', count(*),
        'claimed', count(*) filter (where exists (select 1 from public.case_event e where e.incident = d.id and e.kind = 'claimed')),
        'confirmed', count(*) filter (where d.confirmed_rev is not null),
        'replied', count(*) filter (where exists (select 1 from public.reply r where r.incident = d.id)),
        'dispatched', count(*) filter (where exists (select 1 from public.field_job f where f.incident = d.id)),
        'guided', count(*) filter (where d.status = 'guided'))
      from public.desk d where d.created_at >= since),
    'per_day', (
      select coalesce(jsonb_agg(jsonb_build_object('day', day, 'n', n) order by day), '[]')
      from (select g::date as day, count(d.id) as n
            from generate_series(since, date_trunc('day', now()), interval '1 day') g
            left join public.desk d on d.created_at >= g and d.created_at < g + interval '1 day'
            group by g) x),
    'per_hour', (
      select coalesce(jsonb_agg(jsonb_build_object('hour', h, 'n', n) order by h), '[]')
      from (select h, count(d.id) as n
            from generate_series(0, 23) h
            left join public.desk d on d.created_at >= since
              and extract(hour from d.created_at at time zone 'Asia/Tokyo') = h
            group by h) x),
    'languages', (
      select coalesce(jsonb_object_agg(lang, n), '{}')
      from (select coalesce(lang, 'none') as lang, count(*) as n from public.desk
            where created_at >= since group by 1) x),
    'median_first_reply_s', (
      select percentile_cont(0.5) within group (order by extract(epoch from r.first - d.created_at))
      from public.desk d
      join (select incident, min(sent_at) as first from public.reply group by incident) r on r.incident = d.id
      where d.created_at >= since),
    'choices', (
      select coalesce(jsonb_object_agg(choice, n), '{}')
      from (select c.choice, count(*) as n from public.caller_card c join public.desk d on d.id = c.id
            where d.created_at >= since and c.choice is not null group by 1) x)
  );
end $$;

revoke all on function public.record_fault(text, text, text, text), public.redeem_pair(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_fault(text, text, text, text), public.redeem_pair(uuid, text, text, text)
  to service_role;
revoke all on function public.insights(int) from public, anon;
grant execute on function public.insights(int) to authenticated;

-- Server-only lookups for the command layer.
grant usage on schema ichido to service_role;
grant all on all tables in schema ichido to service_role;
grant usage, select on all sequences in schema public, ichido to service_role;
