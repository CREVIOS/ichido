-- Indexes for the queries every screen runs on each live update.
create index if not exists desk_open_by_time on public.desk (created_at) where finished_at is null;   -- operator queue
create index if not exists desk_recent_closed on public.desk (finished_at desc) where finished_at is not null;  -- history, case list
create index if not exists desk_created on public.desk (created_at);                                   -- insights ranges, CSV export
create index if not exists desk_station_created on public.desk (station, created_at);                  -- station stats, routing
create index if not exists field_job_open_by_assignee on public.field_job (assignee, assigned_at) where state <> 'done';  -- guard screen
