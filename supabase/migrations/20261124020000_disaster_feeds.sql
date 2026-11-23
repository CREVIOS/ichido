-- Automatic disaster intelligence. Idempotent: safe to run again on a database that already has it.
-- 1. Official alerts (JMA 防災情報XML, P2PQuake) for Nagasaki are stored as ichido.hazard_alert, deduped by source id.
-- 2. An alert that reaches our ATM stations creates a disaster PROPOSAL. Nothing changes for callers until an operator
--    or manager confirms it, which runs the same cmd_disaster as setting disaster mode by hand. Proposals expire.
-- 3. GSI designated evacuation sites (指定緊急避難場所) as public.shelter_site: staff read the table; a caller gets only
--    the nearest few for their own station and its active hazard, through caller_shelters().
-- Wording lives in web/content/access.ts; rows hold codes and official place data only.

-- Which JMA areas a station is in, as "<type>:<official name>": pref:長崎県, eq:長崎県南西部 (地震情報／細分区域),
-- city:長崎市 (市町村等), tsunami:長崎県西方 (津波予報区; coastal stations only). Set by staff; empty = never matched.
alter table public.station add column if not exists jma_areas text[] not null default '{}';
-- The local demo stations are all in Nagasaki City, on the west coast (supabase/seed.sql sets the same after a reset).
update public.station set jma_areas = array['pref:長崎県', 'eq:長崎県南西部', 'city:長崎市', 'tsunami:長崎県西方']
  where id in ('TABLE-A', 'HOSP-A', 'CITY-A', 'RAIL-A', 'SHELTER-A') and jma_areas = '{}';

-- Feed cursors (If-Modified-Since) and bulletins already read, so each bulletin is fetched once.
create table if not exists ichido.feed_state (
  source text primary key check (source ~ '^[a-z0-9_]{1,32}$'),
  last_modified text,
  checked_at timestamptz not null default now()
);
create table if not exists ichido.feed_seen (
  source text not null,
  source_id text not null check (length(source_id) <= 200),
  at timestamptz not null default now(),
  primary key (source, source_id)
);
create index if not exists feed_seen_at on ichido.feed_seen (at);

-- kind: earthquake (intensity report), eew (緊急地震速報 forecast), tsunami, warning (特別警報).
-- severity: shindo '4'..'7' for earthquake/eew; 'advisory' | 'warning' | 'major_warning' for tsunami; 'emergency' for warning.
-- areas: only the Nagasaki areas that reached the severity, in the station jma_areas format.
create table if not exists ichido.hazard_alert (
  id bigint generated always as identity primary key,
  source text not null check (source in ('jma', 'p2pquake')),
  source_id text not null check (length(source_id) <= 200),
  kind text not null check (kind in ('earthquake', 'eew', 'tsunami', 'warning')),
  severity text not null check (severity ~ '^[a-z0-9_+-]{1,16}$'),
  areas text[] not null check (cardinality(areas) between 1 and 200),
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (source, source_id)
);

create table if not exists public.disaster_proposal (
  id bigint generated always as identity primary key,
  notice text not null check (notice ~ '^[a-z_]{1,32}$'),
  stations text[] not null check (cardinality(stations) between 1 and 500),
  alerts bigint[] not null,
  kind text not null,
  severity text not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'dismissed', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  decided_by text,
  decided_at timestamptz
);
create index if not exists disaster_proposal_open on public.disaster_proposal (expires_at) where status = 'pending';

-- Official place data from 国土地理院 (GSI), loaded by scripts/import-gsi-shelters.mjs.
-- hazards: flood, landslide, storm_surge, earthquake, tsunami, fire, inland_flood, volcano (GSI's eight categories).
create table if not exists public.shelter_site (
  id text primary key check (length(id) <= 64),
  name text not null,
  address text,
  municipality text,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  hazards text[] not null default '{}'
    check (hazards <@ array['flood', 'landslide', 'storm_surge', 'earthquake', 'tsunami', 'fire', 'inland_flood', 'volcano']),
  designated_shelter boolean not null default false,   -- also a 指定避難所 (a place to stay), not only a place to flee to
  source text not null,
  source_date date
);
create index if not exists shelter_site_lat on public.shelter_site (lat, lng);

alter table ichido.feed_state enable row level security;
alter table ichido.feed_seen enable row level security;
alter table ichido.hazard_alert enable row level security;
alter table public.disaster_proposal enable row level security;
alter table public.shelter_site enable row level security;
revoke all on ichido.feed_state, ichido.feed_seen, ichido.hazard_alert, public.disaster_proposal, public.shelter_site
  from public, anon, authenticated;
grant all on ichido.feed_state, ichido.feed_seen, ichido.hazard_alert, public.disaster_proposal, public.shelter_site to service_role;
grant select on ichido.hazard_alert, public.disaster_proposal, public.shelter_site to authenticated;
-- Those who decide disaster areas (and the manager-level readers: admin, auditor) see alerts and proposals.
drop policy if exists hazard_alert_read on ichido.hazard_alert;
create policy hazard_alert_read on ichido.hazard_alert for select to authenticated
  using (ichido.has_role('operator') or ichido.has_role('manager'));
drop policy if exists disaster_proposal_read on public.disaster_proposal;
create policy disaster_proposal_read on public.disaster_proposal for select to authenticated
  using (ichido.has_role('operator') or ichido.has_role('manager'));
drop policy if exists shelter_site_read on public.shelter_site;
create policy shelter_site_read on public.shelter_site for select to authenticated using (ichido.is_staff());

-- Store one alert (deduped) and propose disaster mode for the ATM stations in its areas. Mobile branches and other
-- packs' stations are never proposed: the bank notices are for ATMs, and a mobile branch in an area would drop out of
-- "nearest working". Stations already showing the notice, or in a live proposal for it (pending or dismissed), are
-- left out; a pending proposal for the same notice grows instead of a second one appearing.
create or replace function public.ingest_hazard(
  p_source text, p_source_id text, p_kind text, p_severity text, p_areas text[], p_issued timestamptz,
  p_expires timestamptz, p_notice text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a bigint; p bigint; hit text[];
begin
  insert into ichido.hazard_alert (source, source_id, kind, severity, areas, issued_at, expires_at)
    values (p_source, p_source_id, p_kind, p_severity, p_areas, p_issued, p_expires)
    on conflict (source, source_id) do nothing returning id into a;
  if a is null then return jsonb_build_object('alert', null, 'proposal', null); end if;
  if p_notice is null or p_expires <= now() then return jsonb_build_object('alert', a, 'proposal', null); end if;
  perform pg_advisory_xact_lock(hashtext('ichido.disaster_proposal'));
  select coalesce(array_agg(s.id order by s.id), '{}') into hit from public.station s
    where s.kind = 'atm' and s.jma_areas && p_areas and s.disaster is distinct from p_notice
      and not exists (select from public.disaster_proposal x where x.notice = p_notice and x.expires_at > now()
                        and x.status in ('pending', 'dismissed') and s.id = any (x.stations));
  select id into p from public.disaster_proposal where notice = p_notice and status = 'pending' and expires_at > now()
    order by id desc limit 1 for update;
  if p is not null then
    update public.disaster_proposal set alerts = alerts || a, expires_at = greatest(expires_at, p_expires),
      stations = (select array_agg(distinct x order by x) from unnest(stations || hit) x)
      where id = p;
  elsif cardinality(hit) > 0 then
    insert into public.disaster_proposal (notice, stations, alerts, kind, severity, expires_at)
      values (p_notice, hit, array[a], p_kind, p_severity, p_expires) returning id into p;
  end if;
  return jsonb_build_object('alert', a, 'proposal', p, 'stations', to_jsonb(hit));
end $$;

-- Confirm (runs cmd_disaster for the proposal's stations that still exist) or dismiss a pending, unexpired proposal.
create or replace function public.cmd_disaster_proposal(p_uid uuid, p_name text, p_id bigint, p_confirm boolean) returns text[]
language plpgsql security definer set search_path = '' as $$
declare r public.disaster_proposal; changed text[] := '{}'; live text[];
begin
  if not exists (select 1 from ichido.staff where uid = p_uid and role in ('operator', 'manager', 'admin')) then perform ichido.fail('forbidden'); end if;
  select * into r from public.disaster_proposal where id = p_id for update;
  if not found then perform ichido.fail('not_found'); end if;
  if r.status <> 'pending' or r.expires_at <= now() then perform ichido.fail('conflict'); end if;
  if p_confirm then
    select coalesce(array_agg(id), '{}') into live from public.station where id = any (r.stations);
    if cardinality(live) > 0 then changed := public.cmd_disaster(p_uid, p_name, live, r.notice); end if;
  end if;
  update public.disaster_proposal set status = case when p_confirm then 'confirmed' else 'dismissed' end,
    decided_by = p_name, decided_at = now() where id = p_id;
  return changed;
end $$;

-- Cron housekeeping: expire old proposals (the banner goes) and forget bulletins read more than a week ago.
create or replace function public.expire_disaster_proposals() returns int
language sql security definer set search_path = '' as $$
  with gone as (delete from ichido.feed_seen where at < now() - interval '7 days')
  , done as (update public.disaster_proposal set status = 'expired' where status = 'pending' and expires_at <= now() returning 1)
  select count(*)::int from done
$$;

-- A caller's nearest designated evacuation sites for their own station's active notice (none outside disaster mode,
-- and none for notices with no evacuation hazard). Only public place data and a distance leave the function.
create or replace function public.caller_shelters(p_limit int default 3)
returns table (name text, address text, distance_m int, designated_shelter boolean)
language sql stable security definer set search_path = '' as $$
  with here as (
    select s.lat, s.lng, case s.disaster when 'earthquake' then 'earthquake' when 'tsunami_warning' then 'tsunami'
                                          when 'tsunami_advisory' then 'tsunami' when 'typhoon' then 'flood' end as hazard
    from public.station s
    join public.desk d on d.station = s.id and d.finished_at is null
    join ichido.binding b on b.incident = d.id
    where b.uid = auth.uid() and ichido.owns(b.incident) and s.lat is not null and s.lng is not null
    limit 1
  )
  select x.name, x.address, round(2 * 6371000 * asin(sqrt(
           sin(radians(x.lat - h.lat) / 2) ^ 2 + cos(radians(h.lat)) * cos(radians(x.lat)) * sin(radians(x.lng - h.lng) / 2) ^ 2)))::int,
         x.designated_shelter
  from here h join public.shelter_site x on h.hazard = any (x.hazards)
    and x.lat between h.lat - 0.1 and h.lat + 0.1 and x.lng between h.lng - 0.12 and h.lng + 0.12
  order by 3 limit least(greatest(coalesce(p_limit, 3), 1), 5)
$$;

do $$
declare f text;
begin
  foreach f in array array['ingest_hazard(text,text,text,text,text[],timestamptz,timestamptz,text)',
                           'cmd_disaster_proposal(uuid,text,bigint,boolean)', 'expire_disaster_proposals()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
revoke all on function public.caller_shelters(int) from public, anon;
grant execute on function public.caller_shelters(int) to authenticated, service_role;

-- Live updates (20261124010000_live_broadcast.sql style): staff hear live:disaster_proposal. A separate policy, so the
-- shared live_staff_read topic list stays as it is.
do $$
begin
  execute 'drop trigger if exists live_insert on public.disaster_proposal';
  execute 'drop trigger if exists live_update on public.disaster_proposal';
  execute 'create trigger live_insert after insert on public.disaster_proposal referencing new table as new_rows '
          'for each statement execute function ichido.live_send()';
  execute 'create trigger live_update after update on public.disaster_proposal referencing new table as new_rows '
          'for each statement execute function ichido.live_send()';
end $$;
drop policy if exists live_disaster_proposal_read on realtime.messages;
create policy live_disaster_proposal_read on realtime.messages for select to authenticated
  using (extension = 'broadcast' and realtime.topic() = 'live:disaster_proposal'
    and (ichido.has_role('operator') or ichido.has_role('manager')));
