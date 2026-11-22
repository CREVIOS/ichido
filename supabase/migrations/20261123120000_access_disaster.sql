-- Two gaps found in real cases.
-- 1. A path with no voice: a deaf or speech-impaired caller raises a silent text alert from the sticker page,
--    and the operator shows the single-use code on the Help Point's own display instead of saying it.
-- 2. Disaster / outage mode: stations inside a disaster area show it on the map, and callers paired there see
--    the bank's approved emergency notice plus the nearest working Help Point or mobile branch.
-- Wording lives in web/content/access.ts; rows hold codes only.

-- 1. Text-only cases.

alter table public.desk add column text_only boolean not null default false;
alter table public.caller_card add column text_only boolean not null default false;
alter table public.desk drop constraint desk_source_check,
  add constraint desk_source_check check (source in ('device', 'simulator', 'caller'));

-- Silent alerts per anonymous caller and station, for the rate limit. No personal data: an anonymous id only.
create table ichido.silent_alert (
  uid uuid not null,
  station text not null,
  at timestamptz not null default now()
);
create index silent_alert_recent on ichido.silent_alert (at);

-- The plaintext code the Help Point may show, kept only while the operator has asked for it. It goes with the
-- pairing code (redeemed, reset, case closed) and is served only while its digest still matches that code.
create table ichido.device_code (
  incident uuid primary key references ichido.pair_code on delete cascade,
  code text not null check (code ~ '^[A-Z0-9]{6}$'),
  digest text not null
);

alter table ichido.silent_alert enable row level security;
alter table ichido.device_code enable row level security;
revoke all on ichido.silent_alert, ichido.device_code from public, anon, authenticated;
grant all on ichido.silent_alert, ichido.device_code to service_role;

-- "I can't hear / I can't speak" from /s/<station>: opens (or flags) the station's case as text-only.
create function public.cmd_silent_alert(p_uid uuid, p_station text, p_fault text) returns void
language plpgsql security definer set search_path = '' as $$
declare i uuid; flagged boolean;
begin
  if not exists (select 1 from auth.users where id = p_uid and is_anonymous)
     or exists (select 1 from ichido.staff where uid = p_uid) then
    perform ichido.fail('forbidden');
  end if;
  if not exists (select 1 from public.station where id = p_station) then perform ichido.fail('not_found'); end if;
  delete from ichido.silent_alert where at < now() - interval '1 hour';
  if (select count(*) from ichido.silent_alert where uid = p_uid and at > now() - interval '10 minutes') >= 3
     or (select count(*) from ichido.silent_alert where station = p_station and at > now() - interval '10 minutes') >= 10 then
    perform ichido.fail('rate_limited');
  end if;
  insert into ichido.silent_alert (uid, station) values (p_uid, p_station);
  i := public.record_fault(p_station, md5(gen_random_uuid()::text), 'caller', p_fault);
  update public.desk set text_only = true where id = i and not text_only returning true into flagged;
  if flagged then
    update public.caller_card set text_only = true where id = i;
    perform ichido.event(i, 'caller', 'text_only', '{}');
  end if;
end $$;

-- What the Help Point display shows for its station: the code while the operator shows it, and the guard's state.
create function public.device_display(p_station text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'code', dc.code,
    'ttl', case when dc.code is not null then greatest(0, floor(extract(epoch from pc.expires - now())))::int end,
    'guard', nullif(cc.field_state, 'none')))
  from public.desk d
  join public.caller_card cc on cc.id = d.id
  left join ichido.pair_code pc on pc.incident = d.id and pc.expires > now()
  left join ichido.device_code dc on dc.incident = pc.incident and dc.digest = pc.digest
  where d.station = p_station and d.finished_at is null
$$;

-- 2. Disaster / outage mode.

-- kind: an ATM with a Help Point, or a mobile branch (移動店舗) parked for the emergency, which has no device.
-- disaster: key of the approved notice in web/content/access.ts while the station is inside a disaster area.
alter table public.station
  add column kind text not null default 'atm' check (kind in ('atm', 'mobile_branch')),
  add column disaster text check (disaster ~ '^[a-z_]{1,32}$'),
  add column disaster_since timestamptz;

-- Station-level timeline of entering and leaving disaster mode. Append-only, like case_event.
create table public.disaster_event (
  id bigint generated always as identity primary key,
  station text not null references public.station on delete cascade,
  kind text not null check (kind in ('entered', 'left')),
  notice text not null,
  actor_name text not null,
  at timestamptz not null default now()
);
create index disaster_event_station on public.disaster_event (station, id);
create function ichido.disaster_event_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- A delete is allowed only as part of removing the station itself (ON DELETE CASCADE).
  if tg_op = 'DELETE' and not exists (select 1 from public.station where id = old.station) then return old; end if;
  raise exception 'disaster_event is append-only' using errcode = 'P0001', detail = 'forbidden';
end $$;
create trigger disaster_event_append_only before update or delete on public.disaster_event
  for each row execute function ichido.disaster_event_append_only();

alter table public.disaster_event enable row level security;
revoke all on public.disaster_event from public, anon, authenticated;
grant select on public.disaster_event to authenticated;
grant all on public.disaster_event to service_role;
create policy disaster_event_read on public.disaster_event for select to authenticated
  using (ichido.has_role('operator') or ichido.has_role('manager'));
-- Managers set disaster areas too, so they read the station list.
create policy station_read_manager on public.station for select to authenticated using (ichido.has_role('manager'));

-- Callers see their station enter or leave disaster mode live; operators see the map change.
alter publication supabase_realtime add table public.station, public.disaster_event;

-- Enter (p_notice set) or leave (p_notice null) disaster mode for a list of stations. Only stations whose state
-- changes are written, each with a station event and a case event on its open case.
create function public.cmd_disaster(p_uid uuid, p_name text, p_stations text[], p_notice text) returns text[]
language plpgsql security definer set search_path = '' as $$
declare s public.station; changed text[] := '{}'; i uuid;
begin
  if not exists (select 1 from ichido.staff where uid = p_uid and role in ('operator', 'manager')) then perform ichido.fail('forbidden'); end if;
  if coalesce(cardinality(p_stations), 0) = 0 or cardinality(p_stations) > 500 then perform ichido.fail('bad_request'); end if;
  if (select count(*) from public.station where id = any (p_stations)) <> (select count(distinct x) from unnest(p_stations) x) then
    perform ichido.fail('not_found');
  end if;
  for s in select * from public.station where id = any (p_stations) order by id for update loop
    continue when s.disaster is not distinct from p_notice;
    update public.station set disaster = p_notice, disaster_since = case when p_notice is null then null else now() end where id = s.id;
    insert into public.disaster_event (station, kind, notice, actor_name)
      values (s.id, case when p_notice is null then 'left' else 'entered' end, coalesce(p_notice, s.disaster), p_name);
    select id into i from public.desk where station = s.id and finished_at is null;
    if i is not null then
      perform ichido.event(i, 'operator', case when p_notice is null then 'disaster_left' else 'disaster_entered' end,
                           jsonb_build_object('notice', coalesce(p_notice, s.disaster)), p_name);
    end if;
    changed := changed || s.id;
  end loop;
  return changed;
end $$;

do $$
declare f text;
begin
  foreach f in array array['cmd_silent_alert(uuid,text,text)', 'device_display(text)', 'cmd_disaster(uuid,text,text[],text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
