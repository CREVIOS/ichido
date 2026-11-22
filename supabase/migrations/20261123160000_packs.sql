-- Scenario packs (web/content/packs): Ichido at any staffed service point, the ATM still the flagship.
-- A station's kind picks its pack; a pack's situations are the desk's fault codes; every approved reply has a rule
-- naming its pack. The database refuses a situation from another pack and a reply that crosses packs or does not fit
-- the caller's taps (a red-flag tap allows only the urgent reply). Codes only; wording lives in the catalogue.
-- tests/packs.test.mjs checks these tables equal the catalogue.

-- 1. Station kinds and the pack each belongs to (a mobile branch is part of the ATM pack).
alter table public.station drop constraint station_kind_check,
  add constraint station_kind_check check (kind in ('atm', 'mobile_branch', 'hospital', 'city_office', 'transit', 'shelter'));

create function ichido.pack_of(p_kind text) returns text
language sql immutable set search_path = '' as $$
  select case when p_kind = 'mobile_branch' then 'atm' else p_kind end
$$;

-- 2. Every situation (desk.fault code) and its pack. Keep in step with FAULTS in web/content/catalogue.ts.
create table ichido.situation (
  code text primary key check (code ~ '^[a-z_]{1,32}$'),
  pack text not null check (pack in ('atm', 'hospital', 'city_office', 'transit', 'shelter'))
);
alter table ichido.situation enable row level security;
revoke all on ichido.situation from public, anon, authenticated;
grant select on ichido.situation to service_role;
insert into ichido.situation values
  ('card_retained', 'atm'), ('card_forgotten', 'atm'), ('card_kept', 'atm'), ('card_unreadable', 'atm'),
  ('passbook_stuck', 'atm'), ('cash_jam', 'atm'), ('cash_left', 'atm'), ('debited_no_cash', 'atm'),
  ('limit_refused', 'atm'), ('phone_fraud', 'atm'), ('hosp_first_visit', 'hospital'), ('hosp_department', 'hospital'), ('hosp_symptoms', 'hospital'),
  ('hosp_payment', 'hospital'), ('city_residence', 'city_office'), ('city_moving', 'city_office'), ('city_mynumber', 'city_office'),
  ('city_letter', 'city_office'), ('transit_way', 'transit'), ('transit_last_train', 'transit'), ('transit_lost_item', 'transit'),
  ('transit_access', 'transit'), ('shelter_checkin', 'shelter'), ('shelter_needs', 'shelter'), ('shelter_family', 'shelter'),
  ('shelter_info', 'shelter');

-- A case's situation must belong to its station's pack, whoever writes it (device, simulator, silent alert, the
-- operator's correction). Existing rows are not rechecked.
create function ichido.situation_fits() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from ichido.situation s join public.station st on st.id = new.station
                 where s.code = new.fault and s.pack = ichido.pack_of(st.kind)) then
    perform ichido.fail('bad_request');
  end if;
  return new;
end $$;
create trigger situation_fits before insert or update of fault, station on public.desk
  for each row execute function ichido.situation_fits();

-- 3. Reply rules, generalised: each rule names its pack; faults null = any situation of that pack.
--    An intent with no rule is now refused (it used to be allowed for any fault).
alter table ichido.reply_rule
  add column pack text not null default 'atm' check (pack in ('atm', 'hospital', 'city_office', 'transit', 'shelter')),
  alter column faults drop not null;
insert into ichido.reply_rule (intent, pack, faults, needs_flags, blocked_by) values
  ('HANDSET', 'atm', null, null, null),
  ('OFFICIAL_CHANNEL', 'atm', null, null, null),
  ('HOSP_URGENT', 'hospital', null, '{red_chest,red_breath,red_bleed,red_faint,red_stroke}', null),
  ('HOSP_FIRST_VISIT', 'hospital', '{hosp_first_visit}', null, '{red_chest,red_breath,red_bleed,red_faint,red_stroke}'),
  ('HOSP_WHERE', 'hospital', '{hosp_department,hosp_symptoms}', null, '{red_chest,red_breath,red_bleed,red_faint,red_stroke}'),
  ('HOSP_INTERPRETER', 'hospital', null, '{need_interpreter,need_explain}', '{red_chest,red_breath,red_bleed,red_faint,red_stroke}'),
  ('HOSP_PAYMENT', 'hospital', '{hosp_payment}', null, '{red_chest,red_breath,red_bleed,red_faint,red_stroke}'),
  ('HOSP_NO_CARD', 'hospital', '{hosp_first_visit,hosp_payment}', '{ins_not_with_me,ins_none}', '{red_chest,red_breath,red_bleed,red_faint,red_stroke}'),
  ('HOSP_STAFF_COMING', 'hospital', null, null, '{red_chest,red_breath,red_bleed,red_faint,red_stroke}'),
  ('CITY_IMMIGRATION', 'city_office', '{city_residence}', '{card_expiring}', null),
  ('CITY_MOVING', 'city_office', '{city_moving}', null, null),
  ('CITY_MYNUMBER', 'city_office', '{city_mynumber}', null, null),
  ('CITY_LETTER', 'city_office', '{city_letter}', null, null),
  ('CITY_APPOINTMENT', 'city_office', null, null, null),
  ('CITY_STAFF_COMING', 'city_office', null, null, null),
  ('TRANSIT_GUIDE', 'transit', '{transit_way,transit_access}', null, null),
  ('TRANSIT_LAST_TRAIN', 'transit', '{transit_last_train}', null, null),
  ('TRANSIT_LOST_ITEM', 'transit', '{transit_lost_item}', null, null),
  ('TRANSIT_LOST_ID', 'transit', '{transit_lost_item}', '{item_card}', null),
  ('TRANSIT_ACCESS', 'transit', '{transit_access}', null, null),
  ('SHELTER_TELL_NOW', 'shelter', null, '{red_hurt,family_child}', null),
  ('SHELTER_CHECKIN', 'shelter', '{shelter_checkin}', null, '{red_hurt,family_child}'),
  ('SHELTER_NEEDS', 'shelter', '{shelter_needs}', null, '{red_hurt,family_child}'),
  ('SHELTER_MEDICINE', 'shelter', '{shelter_needs,shelter_checkin}', '{need_medicine}', '{red_hurt,family_child}'),
  ('SHELTER_FAMILY', 'shelter', '{shelter_family}', null, '{red_hurt,family_child}'),
  ('SHELTER_INFO', 'shelter', '{shelter_info}', null, '{red_hurt,family_child}'),
  ('SHELTER_STAFF_COMING', 'shelter', null, null, '{red_hurt,family_child}');

-- Same signature, so the reply trigger and withdraw_unfit_reply keep calling it. No caller card yet = no taps.
-- A desk whose fault has no situation row (an older or test desk) is treated as an ATM, as before packs; an intent
-- with no rule is allowed only for an ATM case (the base behaviour), never for another pack's case.
create or replace function ichido.reply_ok(p_intent text, p_fault text, p_flags text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  with here as (select coalesce((select pack from ichido.situation where code = p_fault), 'atm') as pack)
  select coalesce((
    select r.pack = here.pack
       and (r.faults is null or p_fault = any (r.faults))
       and (r.needs_flags is null or coalesce(p_flags, '{}') && r.needs_flags)
       and not (coalesce(p_flags, '{}') && coalesce(r.blocked_by, '{}'))
    from ichido.reply_rule r, here
    where r.intent = p_intent), (select pack = 'atm' from here))
$$;

-- The trigger reads the fault from the desk even before a caller card exists (a left join), now that a reply
-- without a matching situation is refused.
create or replace function ichido.reply_allowed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare f text; fl text[];
begin
  select d.fault, c.flags into f, fl from public.desk d left join public.caller_card c on c.id = d.id where d.id = new.incident;
  if not ichido.reply_ok(new.intent, f, fl) then perform ichido.fail('conflict'); end if;
  return new;
end $$;

-- 4. Confirming: an ATM caller confirms the read-back of two facts; any other pack's caller confirms their taps.
create or replace function public.cmd_confirm(p_uid uuid, p_rev int) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.desk; dr public.draft; atm boolean; tapped boolean;
begin
  d := ichido.caller_case(p_uid);
  select * into dr from public.draft where incident = d.id for update;
  atm := coalesce((select pack = 'atm' from ichido.situation where code = d.fault), true);
  select cardinality(flags) > 0 into tapped from public.caller_card where id = d.id;
  if dr.rev <> p_rev or dr.needs_clarification
     or (atm and dr.card_back = 'unknown' and dr.cash_received = 'unknown')
     or (not atm and not tapped) then
    perform ichido.fail('conflict');
  end if;
  if exists (select 1 from public.caller_card where id = d.id and confirmed_rev is not null) then perform ichido.fail('conflict'); end if;
  update public.desk set card_back = dr.card_back, cash_received = dr.cash_received, confirmed_rev = dr.rev,
                         caller_words = dr.words, clarifying = false where id = d.id;
  update public.caller_card set confirmed_rev = dr.rev where id = d.id;
  perform ichido.event(d.id, 'caller', 'confirmed', jsonb_build_object('card_back', dr.card_back, 'cash_received', dr.cash_received));
end $$;

-- 5. Hand-off recipients per pack (the server checks the recipient belongs to the case's pack).
alter table ichido.handoff drop constraint handoff_recipient_check,
  add constraint handoff_recipient_check check (recipient in ('bank', 'police', 'security', 'department', 'medical_interpreter',
    'city_section', 'consult_desk', 'railway', 'disaster_hq', 'health_team'));

-- 6. Insights by pack: received and guided per pack, counts only. Operators and managers only.
create function public.insights_packs(p_days int default 14) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare tz constant text := 'Asia/Tokyo'; since timestamptz;
begin
  if not (ichido.has_role('operator') or ichido.has_role('manager')) then perform ichido.fail('forbidden'); end if;
  if p_days not in (7, 14, 30) then perform ichido.fail('bad_request'); end if;
  since := (date_trunc('day', now() at time zone tz) - make_interval(days => p_days - 1)) at time zone tz;
  return (
    select coalesce(jsonb_object_agg(pack, jsonb_build_object('received', n, 'guided', g)), '{}')
    from (select ichido.pack_of(st.kind) as pack, count(*) as n, count(*) filter (where d.status = 'guided') as g
          from public.desk d join public.station st on st.id = d.station
          where d.created_at >= since group by 1) x
  );
end $$;

revoke all on function ichido.pack_of(text), ichido.situation_fits() from public, anon, authenticated;
revoke all on function public.insights_packs(int) from public, anon;
grant execute on function public.insights_packs(int) to authenticated;
