-- Live updates by Realtime Broadcast from the database (web/lib/live.ts, mobile/lib/live.ts) in place of
-- postgres_changes. Each insert or update statement on a live table sends one message per topic, with no row data:
-- clients refetch through RLS. Topics, all private (authorised by the policies on realtime.messages below):
--   live:<table>             any change to the table; staff only
--   live:incident:<uuid>     a change to that case's caller_card, draft or reply; its paired caller, or staff
--   live:station:<id>        a change to that station (disaster notice); its paired caller, or staff
--   live:feed                bot_remind / promise_due case events for the operator's toasts: {id, incident, reason|kind}
-- The supabase_realtime publication is left as it was.

create or replace function ichido.live_send() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  k text;
  e record;
  msg jsonb := jsonb_build_object('table', tg_table_name);
begin
  if not exists (select from new_rows) then return null; end if;
  perform realtime.send(msg, 'change', 'live:' || tg_table_name, true);
  -- Arguments: the caller topic kind ('incident' or 'station') and the column that names it.
  if tg_nargs = 2 then
    for k in execute format('select distinct %1$I::text from new_rows where %1$I is not null', tg_argv[1]) loop
      perform realtime.send(msg, 'change', format('live:%s:%s', tg_argv[0], k), true);
    end loop;
  end if;
  if tg_table_name = 'case_event' and tg_op = 'INSERT' then
    for e in select n.id, n.incident, n.kind, n.data from new_rows n where n.kind in ('bot_remind', 'promise_due') order by n.id loop
      perform realtime.send(jsonb_strip_nulls(jsonb_build_object('id', e.id, 'incident', e.incident,
        case e.kind when 'bot_remind' then 'reason' else 'kind' end,
        e.data ->> case e.kind when 'bot_remind' then 'reason' else 'kind' end)), e.kind, 'live:feed', true);
    end loop;
  end if;
  return null;
end $$;
revoke all on function ichido.live_send() from public, anon, authenticated, service_role;

-- A trigger with a transition table takes one event, so inserts and updates each get one.
do $$
declare r record;
begin
  for r in select * from (values
    ('bot_step', null, null), ('bot_suggestion', null, null), ('caller_card', 'incident', 'id'),
    ('case_event', null, null), ('case_record', null, null), ('desk', null, null), ('device_health', null, null),
    ('disaster_event', null, null), ('draft', 'incident', 'incident'), ('escalation', null, null),
    ('field_job', null, null), ('light', null, null), ('mass_incident', null, null), ('promise', null, null),
    ('reply', 'incident', 'incident'), ('review_state', null, null), ('station', 'station', 'id')
  ) as t(tbl, kind, col) loop
    execute format('drop trigger if exists live_insert on public.%I', r.tbl);
    execute format('drop trigger if exists live_update on public.%I', r.tbl);
    execute format('create trigger live_insert after insert on public.%I referencing new table as new_rows '
                   'for each statement execute function ichido.live_send(%s)', r.tbl,
                   case when r.kind is null then '' else format('%L, %L', r.kind, r.col) end);
    execute format('create trigger live_update after update on public.%I referencing new table as new_rows '
                   'for each statement execute function ichido.live_send(%s)', r.tbl,
                   case when r.kind is null then '' else format('%L, %L', r.kind, r.col) end);
  end loop;
end $$;

-- Reading only: clients never send on live:* topics, so there is no insert policy for them.
drop policy if exists live_staff_read on realtime.messages;
create policy live_staff_read on realtime.messages for select to authenticated
  using (extension = 'broadcast' and realtime.topic() = any (array[
    'live:bot_step', 'live:bot_suggestion', 'live:caller_card', 'live:case_event', 'live:case_record', 'live:desk',
    'live:device_health', 'live:disaster_event', 'live:draft', 'live:escalation', 'live:field_job', 'live:light',
    'live:mass_incident', 'live:promise', 'live:reply', 'live:review_state', 'live:station'])
    and ichido.is_staff());

drop policy if exists live_feed_read on realtime.messages;
create policy live_feed_read on realtime.messages for select to authenticated
  using (extension = 'broadcast' and realtime.topic() = 'live:feed' and ichido.has_role('operator'));

-- The case keeps the cast from ever seeing a malformed topic.
drop policy if exists live_incident_read on realtime.messages;
create policy live_incident_read on realtime.messages for select to authenticated
  using (extension = 'broadcast' and realtime.topic() like 'live:incident:%' and (ichido.is_staff() or ichido.owns(
    case when realtime.topic() ~ '^live:incident:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         then substr(realtime.topic(), 15)::uuid end)));

drop policy if exists live_station_read on realtime.messages;
create policy live_station_read on realtime.messages for select to authenticated
  using (extension = 'broadcast' and realtime.topic() like 'live:station:%'
    and (ichido.is_staff() or ichido.owns_station(substr(realtime.topic(), 14))));
