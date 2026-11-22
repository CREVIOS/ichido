-- The per-station pairing limit (guesses at a station's single-use codes) becomes a setting: 30 per 5 minutes
-- in production by default. The local seed raises it so the full test suite, which pairs often, stays deterministic.
alter table ichido.ops_setting drop constraint ops_setting_key_check;
alter table ichido.ops_setting add constraint ops_setting_key_check
  check (key in ('mass_stations', 'mass_window_s', 'arrived_open_s', 'pair_station_limit', 'pair_phone_limit'));
insert into ichido.ops_setting values ('pair_station_limit', 30), ('pair_phone_limit', 5) on conflict (key) do nothing;

create or replace function public.note_pair_attempt(p_uid uuid, p_station text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  per_phone int := coalesce((select value from ichido.ops_setting where key = 'pair_phone_limit'), 5);
  per_station int := coalesce((select value from ichido.ops_setting where key = 'pair_station_limit'), 30);
begin
  delete from ichido.pair_attempt where at < now() - interval '1 hour';
  insert into ichido.pair_attempt (uid, station) values (p_uid, p_station);
  return (select count(*) from ichido.pair_attempt where uid = p_uid and at > now() - interval '5 minutes') <= per_phone
     and (select count(*) from ichido.pair_attempt where station = p_station and at > now() - interval '5 minutes') <= per_station;
end $$;
