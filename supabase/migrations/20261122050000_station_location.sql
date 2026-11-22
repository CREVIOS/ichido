-- Where each station is, for the operator's live map. Optional: a station without coordinates is simply not on the map.
alter table public.station
  add column lat double precision check (lat between -90 and 90),
  add column lng double precision check (lng between -180 and 180);
