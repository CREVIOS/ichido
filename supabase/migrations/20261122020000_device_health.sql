-- Latest heartbeat from each Help Point device (POST /api/device/heartbeat, every 60 s).
-- Written by the server with the service role; operators and managers read it to see which devices are alive.
create table public.device_health (
  station text primary key references public.station on delete cascade,
  last_seen timestamptz not null default now(),
  uptime_s bigint not null check (uptime_s >= 0),
  free_heap int not null check (free_heap >= 0),
  rssi int not null check (rssi between -127 and 0),
  firmware text not null check (firmware ~ '^[A-Za-z0-9._+-]{1,32}$'),
  ack_ms int check (ack_ms >= 0),      -- round trip of the last acknowledged fault report; null = none since boot
  poll_ms int check (poll_ms >= 0)     -- round trip of the last successful status poll
);

alter table public.device_health enable row level security;
revoke all on public.device_health from public, anon, authenticated;
grant select on public.device_health to authenticated;
grant all on public.device_health to service_role;

create policy device_health_read on public.device_health for select to authenticated
  using (ichido.has_role('operator') or ichido.has_role('manager'));

alter publication supabase_realtime add table public.device_health;
