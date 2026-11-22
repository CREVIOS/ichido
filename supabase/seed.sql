-- Local stack and tests only (`supabase db reset`). Never apply to a hosted project: `supabase db push`
-- does not run seeds, and must never be given --include-seed. Production staff and stations come from
-- scripts/create-staff.mjs and the station SQL in docs/DEPLOY.md.

insert into public.station (id, label, branch, counter_hours, security_company, lat, lng) values (
  'TABLE-A',
  '{"ja": "長崎駅前 店舗外ATM（架空）", "bn": "নাগাসাকি স্টেশনের সামনের এটিএম (কাল্পনিক)", "en": "Nagasaki Station front ATM (fictional)", "vi": "Cây ATM trước ga Nagasaki (hư cấu)", "id": "ATM depan Stasiun Nagasaki (fiktif)", "ne": "नागासाकी स्टेसन अगाडिको एटीएम (काल्पनिक)"}',
  '{"ja": "出島銀行 駅前支店（架空）", "bn": "দেজিমা ব্যাংক স্টেশন শাখা (কাল্পনিক)", "en": "Dejima Bank Station branch (fictional)", "vi": "Ngân hàng Dejima, chi nhánh Nhà ga (hư cấu)", "id": "Bank Dejima Cabang Stasiun (fiktif)", "ne": "देजिमा बैंक स्टेसन शाखा (काल्पनिक)"}',
  '{"ja": "平日 9:00〜15:00", "bn": "সোম–শুক্র, ৯:০০–১৫:০০", "en": "weekdays 9:00–15:00", "vi": "Thứ Hai–thứ Sáu, 9:00–15:00", "id": "Senin–Jumat, 9:00–15:00", "ne": "सोम–शुक्र, ९:००–१५:००"}',
  '架空警備株式会社',
  32.7522, 129.8702
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
    ('operator2@ichido.demo', 'operator', '佐藤'),
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

-- Local only: the test suite pairs at TABLE-A many times within five minutes. Production keeps the default of 30.
update ichido.ops_setting set value = 500 where key = 'pair_station_limit';
