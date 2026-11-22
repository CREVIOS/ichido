-- 20261123180000 replaced note_pair_attempt after the security migration. Keep its setting-driven limits
-- (ichido.ops_setting pair_phone_limit / pair_station_limit) and restore the serialized, check-before-insert
-- limiter: per-UID and per-station advisory locks, unknown stations share one bucket, expiry stays in cron.
create or replace function public.note_pair_attempt(p_uid uuid, p_station text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  per_phone int := coalesce((select value from ichido.ops_setting where key = 'pair_phone_limit'), 5);
  per_station int := coalesce((select value from ichido.ops_setting where key = 'pair_station_limit'), 30);
  station_key text := coalesce((select id from public.station where id = p_station), '');
  since timestamptz;
begin
  perform pg_advisory_xact_lock(1, hashtext(p_uid::text));
  perform pg_advisory_xact_lock(2, hashtext(station_key));
  since := clock_timestamp() - interval '5 minutes';
  if (select count(*) from ichido.pair_attempt where uid = p_uid and at > since) >= per_phone
     or (select count(*) from ichido.pair_attempt where station = station_key and at > since) >= per_station then
    return false;
  end if;
  insert into ichido.pair_attempt (uid, station, at) values (p_uid, station_key, clock_timestamp());
  return true;
end $$;
