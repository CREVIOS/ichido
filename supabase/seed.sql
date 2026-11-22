-- Synthetic demo data only. Passwords here are for the local stack; set different ones in the hosted project.

insert into public.station (id, label, branch, counter_hours, security_company) values (
  'TABLE-A',
  '{"ja": "長崎駅前 店舗外ATM（架空）", "bn": "নাগাসাকি স্টেশনের সামনের এটিএম (কাল্পনিক)", "en": "Nagasaki Station front ATM (fictional)"}',
  '{"ja": "長崎駅前支店", "bn": "নাগাসাকি একিমায়ে শাখা", "en": "Nagasaki Ekimae branch"}',
  '{"ja": "平日 9:00〜15:00", "bn": "সোম–শুক্র, ৯:০০–১৫:০০", "en": "weekdays 9:00–15:00"}',
  '架空警備株式会社'
);
insert into public.light (station) values ('TABLE-A');

-- Staff accounts: operator, two guards, manager.
do $$
declare
  acct record;
  uid uuid;
begin
  for acct in select * from (values
    ('operator@ichido.demo', 'operator', '伊藤'),
    ('guard1@ichido.demo', 'field', '山口'),
    ('guard2@ichido.demo', 'field', '中村'),
    ('manager@ichido.demo', 'manager', '管理者')
  ) as t(email, role, name) loop
    uid := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                            confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', acct.email,
            crypt('ichido-demo', gen_salt('bf')), now(), now(), now(),
            '{"provider":"email","providers":["email"]}', '{}', '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', acct.email),
            'email', now(), now(), now());
    insert into ichido.staff (uid, role, display_name) values (uid, acct.role::public.staff_role, acct.name);
  end loop;
end $$;

-- Synthetic history for the insights page (clearly demo data: source = 'simulator').
-- Each past case walks the same funnel as a live one, with realistic drop-off between stages.
do $$
declare
  op uuid := (select uid from ichido.staff where role = 'operator' limit 1);
  guard uuid := (select uid from ichido.staff where role = 'field' limit 1);
  langs text[] := array['bn', 'bn', 'bn', 'en', 'ja', 'ja'];
  d int; k int; i uuid; t timestamptz; pick_lang text;
begin
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
            update public.caller_card set choice = case when random() < 0.62 then 'leave' else 'wait' end where id = i;
            if random() < 0.8 then
              insert into public.field_job (incident, station, fault, assignee, state, case_closed, updated_at)
                values (i, 'TABLE-A', 'card_retained', guard, 'done', true, t + interval '30 minutes');
              update public.desk set status = 'field' where id = i;
            end if;
            if random() < 0.82 then
              update public.desk set status = 'guided' where id = i;
              update public.caller_card set status = 'guided', teachback_result = 'understood' where id = i;
            end if;
          end if;
        end if;
      end if;
    end loop;
  end loop;
end $$;
