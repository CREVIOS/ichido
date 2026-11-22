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

-- packs:begin — one fictional station per scenario pack (web/content/packs), around Nagasaki City. branch is where the
-- caller is sent and counter_hours its hours; both fill the pack's approved replies.
insert into public.station (id, kind, label, branch, counter_hours, security_company, lat, lng) values
  ('HOSP-A', 'hospital',
   '{"ja": "浦上みなと病院 外来受付 Help Point（架空）", "en": "Urakami Minato Hospital outpatient Help Point (fictional)", "bn": "উরাকামি মিনাতো হাসপাতাল বহির্বিভাগ Help Point (কাল্পনিক)", "vi": "Help Point khu khám ngoại trú, Bệnh viện Urakami Minato (hư cấu)", "id": "Help Point rawat jalan RS Urakami Minato (fiktif)", "ne": "उराकामी मिनातो अस्पताल बहिरङ्ग Help Point (काल्पनिक)"}',
   '{"ja": "初診受付（1階）", "en": "first-visit reception (1st floor)", "bn": "প্রথমবারের রিসেপশন (১ম তলা)", "vi": "quầy tiếp nhận khám lần đầu (tầng 1)", "id": "loket pendaftaran pasien baru (lantai 1)", "ne": "पहिलो पटकको दर्ता काउन्टर (भुइँतला)"}',
   '{"ja": "平日 8:30〜11:30", "en": "weekdays 8:30–11:30", "bn": "সোম–শুক্র, ৮:৩০–১১:৩০", "vi": "Thứ Hai–thứ Sáu, 8:30–11:30", "id": "Senin–Jumat, 8:30–11:30", "ne": "सोम–शुक्र, ८:३०–११:३०"}',
   '浦上みなと病院 医療事務課（架空）', 32.7768, 129.8652),
  ('CITY-A', 'city_office',
   '{"ja": "出島市役所 多言語窓口 Help Point（架空）", "en": "Dejima City Hall multilingual desk Help Point (fictional)", "bn": "দেজিমা সিটি হল বহুভাষিক ডেস্ক Help Point (কাল্পনিক)", "vi": "Help Point quầy đa ngôn ngữ, Tòa thị chính Dejima (hư cấu)", "id": "Help Point meja multibahasa Balai Kota Dejima (fiktif)", "ne": "देजिमा सिटी हल बहुभाषिक डेस्क Help Point (काल्पनिक)"}',
   '{"ja": "市民課 多言語窓口（本館1階）", "en": "multilingual desk, Residents Section (main building, 1st floor)", "bn": "বাসিন্দা বিভাগের বহুভাষিক ডেস্ক (মূল ভবন, ১ম তলা)", "vi": "quầy đa ngôn ngữ, Phòng Cư dân (tòa chính, tầng 1)", "id": "meja multibahasa Bagian Kependudukan (gedung utama, lantai 1)", "ne": "बासिन्दा शाखाको बहुभाषिक डेस्क (मुख्य भवन, भुइँतला)"}',
   '{"ja": "平日 9:00〜16:00", "en": "weekdays 9:00–16:00", "bn": "সোম–শুক্র, ৯:০০–১৬:০০", "vi": "Thứ Hai–thứ Sáu, 9:00–16:00", "id": "Senin–Jumat, 9:00–16:00", "ne": "सोम–शुक्र, ९:००–१६:००"}',
   '出島市 市民課（架空）', 32.7503, 129.8779),
  ('RAIL-A', 'transit',
   '{"ja": "みなと線 浦上駅 改札 Help Point（架空）", "en": "Minato Line Urakami Station ticket gate Help Point (fictional)", "bn": "মিনাতো লাইন উরাকামি স্টেশন টিকিট গেট Help Point (কাল্পনিক)", "vi": "Help Point cửa soát vé ga Urakami, tuyến Minato (hư cấu)", "id": "Help Point gerbang tiket Stasiun Urakami, Jalur Minato (fiktif)", "ne": "मिनातो लाइन उराकामी स्टेसन टिकट गेट Help Point (काल्पनिक)"}',
   '{"ja": "駅事務室（改札横）", "en": "station office (beside the ticket gate)", "bn": "স্টেশন অফিস (টিকিট গেটের পাশে)", "vi": "văn phòng nhà ga (cạnh cửa soát vé)", "id": "kantor stasiun (di samping gerbang tiket)", "ne": "स्टेसन कार्यालय (टिकट गेटछेउ)"}',
   '{"ja": "始発〜終電", "en": "first train to last train", "bn": "প্রথম ট্রেন থেকে শেষ ট্রেন পর্যন্ত", "vi": "từ chuyến tàu đầu đến chuyến cuối", "id": "dari kereta pertama sampai kereta terakhir", "ne": "पहिलो रेलदेखि अन्तिम रेलसम्म"}',
   'みなと鉄道（架空）', 32.7700, 129.8668),
  ('SHELTER-A', 'shelter',
   '{"ja": "稲佐小学校 体育館 避難所 Help Point（架空）", "en": "Inasa Elementary School gym shelter Help Point (fictional)", "bn": "ইনাসা প্রাথমিক বিদ্যালয় জিমনেসিয়াম আশ্রয়কেন্দ্র Help Point (কাল্পনিক)", "vi": "Help Point nơi sơ tán nhà thể chất Trường tiểu học Inasa (hư cấu)", "id": "Help Point pengungsian aula SD Inasa (fiktif)", "ne": "इनासा प्राथमिक विद्यालय व्यायामशाला आश्रयस्थल Help Point (काल्पनिक)"}',
   '{"ja": "避難所受付（体育館入口）", "en": "shelter reception (gym entrance)", "bn": "আশ্রয়কেন্দ্রের রিসেপশন (জিমের প্রবেশপথ)", "vi": "quầy tiếp nhận (lối vào nhà thể chất)", "id": "meja penerimaan (pintu masuk aula)", "ne": "आश्रयस्थल रिसेप्सन (व्यायामशालाको प्रवेशद्वार)"}',
   '{"ja": "開設中は24時間", "en": "24 hours while open", "bn": "খোলা থাকাকালীন ২৪ ঘণ্টা", "vi": "24 giờ khi đang mở", "id": "24 jam selama dibuka", "ne": "खुला रहँदा २४ घण्टा"}',
   '出島市 災害対策本部（架空）', 32.7537, 129.8573)
on conflict (id) do nothing;
insert into public.light (station) values ('HOSP-A'), ('CITY-A'), ('RAIL-A'), ('SHELTER-A') on conflict (station) do nothing;
-- packs:end

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
