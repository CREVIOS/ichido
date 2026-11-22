-- Optional, local only: 20 days of synthetic past cases so the insights page has something to show.
-- Needs seed.sql first (it uses the local demo operator and guard). Load with:
--   docker exec -i supabase_db_ichido psql -U postgres < supabase/seed-local-history.sql
-- Rows are marked source = 'simulator'. Never apply to a hosted project.

-- Each past case walks the same funnel as a live one, with realistic drop-off between stages.
do $$
declare
  op uuid := (select s.uid from ichido.staff s join auth.users u on u.id = s.uid where u.email = 'operator@ichido.demo');
  guard uuid := (select s.uid from ichido.staff s join auth.users u on u.id = s.uid where u.email = 'guard1@ichido.demo');
  langs text[] := array['bn', 'bn', 'bn', 'en', 'ja', 'ja'];
  d int; k int; i uuid; t timestamptz; pick_lang text;
begin
  -- Refuses to run anywhere the local demo accounts do not exist, i.e. any hosted project.
  if op is null or guard is null then raise exception 'local demo accounts missing: run on the local stack after seed.sql'; end if;
  for d in 1..20 loop
    for k in 1..(2 + floor(random() * 6))::int loop
      -- busier in the evening, like real ATM trouble calls
      t := (date_trunc('day', now() at time zone 'Asia/Tokyo') - make_interval(days => d)
            + make_interval(hours => (8 + floor(random() * 15))::int, mins => floor(random() * 60)::int)) at time zone 'Asia/Tokyo';
      pick_lang := langs[1 + floor(random() * array_length(langs, 1))::int];
      insert into public.desk (station, source, fault, status, operator_id, lang, card_back, cash_received,
                               confirmed_rev, remote_release, created_at, finished_at)
      values ('TABLE-A', 'simulator', 'card_retained', 'received', null, null, 'unknown', 'unknown', null, null, t, t + interval '40 minutes')
      returning id into i;
      insert into public.caller_card (id, station, fault) values (i, 'TABLE-A', 'card_retained');
      insert into public.case_event (incident, actor, kind, data, at) values (i, 'system', 'fault', '{"fault":"card_retained","source":"simulator"}', t);
      if random() < 0.93 then
        update public.desk set operator_id = op, status = 'review' where id = i;
        insert into public.case_event (incident, actor, kind, at) values (i, 'operator', 'claimed', t + interval '1 minute');
        if random() < 0.85 then
          update public.desk set lang = pick_lang, card_back = 'no', cash_received = 'yes', confirmed_rev = 2, remote_release = 'failed' where id = i;
          update public.caller_card set lang = pick_lang, confirmed_rev = 2 where id = i;
          if random() < 0.95 then
            insert into public.reply (incident, intent, manual_version, operator_id, sent_at)
              values (i, 'HELD_WAIT_OR_LEAVE', 'retained-card/v1', op, t + make_interval(secs => 120 + floor(random() * 360)::int));
            update public.caller_card set choice = case when random() < 0.62 then 'leave' else 'wait' end,
              reply_id = (select id from public.reply where incident = i) where id = i;
            if random() < 0.8 then
              insert into public.field_job (incident, station, fault, assignee, state, case_closed, updated_at)
                values (i, 'TABLE-A', 'card_retained', guard, 'done', true, t + interval '30 minutes');
              update public.desk set status = 'field' where id = i;
            end if;
            if random() < 0.82 then
              update public.desk set status = 'guided', guided_at = t + interval '20 minutes' where id = i;
              update public.caller_card set status = 'guided', teachback_result = 'understood' where id = i;
            end if;
          end if;
        end if;
      end if;
    end loop;
  end loop;
end $$;

-- Past cases that never reached guidance were closed without contact.
update public.desk set abandoned = true where source = 'simulator' and status <> 'guided' and finished_at is not null;
