begin;

alter table public.desk add column if not exists binding_expires timestamptz,
  add column if not exists caller_words_lang text,
  add column if not exists assisted_source text check (assisted_source in ('handset','in_person'));
alter table public.draft add column if not exists words_lang text;
alter table public.caller_card add column if not exists teachback_lang text, add column if not exists eta_at timestamptz,
  add column if not exists callback_channel text check (callback_channel in ('phone','email'));
alter table public.station add column if not exists host_org text, add column if not exists short_address text,
  add column if not exists public_contact_url text check(public_contact_url ~ '^https://[^/[:space:]@]+(/[^[:space:]]*)?$'),
  add column if not exists contact_verified_at timestamptz;
alter table public.field_job add column if not exists allergy_flags text[] not null default '{}',
  add column if not exists allergy_ack_at timestamptz;

-- Only the five matching fictional fixtures receive demo identification on an existing installation.
update public.station s set host_org=coalesce(s.host_org,v.host),short_address=coalesce(s.short_address,v.place)
from (values
  ('TABLE-A','長崎駅前 店舗外ATM','出島銀行','長崎駅前 店舗外ATM'),
  ('HOSP-A','浦上みなと病院 外来受付 Help Point','浦上みなと病院','浦上みなと病院 1階 外来受付'),
  ('CITY-A','出島市役所 多言語窓口 Help Point','出島市役所','本館1階 市民課'),
  ('RAIL-A','みなと線 浦上駅 改札 Help Point','みなと鉄道','浦上駅 改札横'),
  ('SHELTER-A','稲佐小学校 体育館 避難所 Help Point','稲佐小学校 避難所受付','稲佐小学校 体育館入口')
) v(id,label,host,place)
where s.id=v.id and s.label->>'ja'=v.label and (s.host_org is null or s.short_address is null);

create table if not exists ichido.pair_end (
  uid uuid primary key references auth.users on delete cascade,
  reason text not null check (reason in ('expired','replaced','abandoned')),
  lang text not null, until_at timestamptz not null
);
alter table ichido.pair_end enable row level security;
revoke all on ichido.pair_end from public, anon, authenticated;
grant select on ichido.pair_end to service_role;

create or replace function ichido.binding_state() returns trigger
language plpgsql security definer set search_path='' as $$
declare d public.desk;
begin
  if tg_op <> 'DELETE' then
    update public.desk set binding_expires=new.expires where id=new.incident;
    delete from ichido.pair_end where uid=new.uid;
    return null;
  end if;
  select * into d from public.desk where id=old.incident;
  if not found then return null; end if;
  insert into ichido.pair_end select old.uid,case when d.abandoned then 'abandoned' when old.expires<=now() then 'expired' else 'replaced' end,old.lang,now()+interval '30 days' where (d.finished_at is null or d.abandoned) and exists(select from auth.users where id=old.uid)
    on conflict(uid) do update set reason=excluded.reason,lang=excluded.lang,until_at=excluded.until_at;
  update public.desk set binding_expires=null where id=d.id;
  if d.finished_at is null then
    -- A replacement phone must confirm its own intake. Operational work stays with the same incident.
    update public.draft set words=null, words_lang=null, triage=null, card_back='unknown',cash_received='unknown',
      needs_clarification=false,rev=rev+1 where incident=d.id;
    update public.desk set confirmed_rev=null,caller_words=null,caller_words_ja=null,caller_words_lang=null,
      card_back='unknown',cash_received='unknown',triage=null,lang=null,clarifying=false,assisted_source=null,
      stated_amount=null,ai_summary=null,ai_summary_at=null,ai_summary_by=null where id=d.id;
    update public.caller_card set reply_id=null,confirmed_rev=null,flags='{}',confirmed_flags='{}',lang=null,
      choice=null,teachback=null,teachback_ja=null,teachback_reply=null,teachback_result=null,needs_human=false,
      rating=null,bank_status=null,bank_due=null,callback_channel=null where id=d.id;
  end if;
  return null;
end $$;
create or replace trigger binding_state after insert or update of expires or delete on ichido.binding
for each row execute function ichido.binding_state();
update public.desk d set binding_expires=b.expires from ichido.binding b where b.incident=d.id and d.binding_expires is distinct from b.expires;

-- A new visit can retire a finished binding only if the new station code redeems in this transaction.
create or replace function public.frontline_pair(p_uid uuid,p_station text,p_digest text,p_lang text,p_frontline boolean)
returns uuid language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(1,hashtext(p_uid::text));
  delete from ichido.binding b using public.desk d where b.uid=p_uid and d.id=b.incident and d.finished_at is not null;
  if exists(select from ichido.binding where uid=p_uid and expires>now()) then perform ichido.fail('conflict'); end if;
  if exists(select from public.desk where station=p_station and finished_at is null and assisted_source is not null for update) then perform ichido.fail('conflict'); end if;
  perform set_config('ichido.frontline_client',case when p_frontline then '1' else '0' end,true);
  return public.redeem_pair(p_uid,p_station,p_digest,p_lang);
end $$;

create or replace function ichido.words_language() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='draft' then
    if new.words is null then new.words_lang:=null;
    elsif new.words is distinct from old.words then
      select lang into new.words_lang from public.desk where id=new.incident;
    end if;
  elsif tg_table_name='caller_card' then
    if new.teachback is distinct from old.teachback then
      new.teachback_lang:=case when new.teachback is not null then new.lang end;
    end if;
  else
    select words_lang into new.caller_words_lang from public.draft where incident=new.id and words=new.caller_words;
  end if;
  return new;
end $$;
create or replace trigger words_language before update of words on public.draft for each row execute function ichido.words_language();
create or replace trigger teachback_language before update of teachback on public.caller_card for each row execute function ichido.words_language();
create or replace trigger confirmed_language before update of caller_words on public.desk for each row execute function ichido.words_language();

-- Recover old text locales only from matching submitted words or an unchanged, recorded pairing.
update public.draft dr set words_lang=coalesce(
  (select t.locale from public.frontline_turn t join ichido.binding b on b.incident=t.incident and b.voice_room=t.generation
    where t.incident=dr.incident and t.words=dr.words order by t.seq desc limit 1),
  (select d.lang from public.desk d where d.id=dr.incident and not exists
    (select from public.case_event e where e.incident=d.id and e.kind in ('lang_changed','caller_reset'))))
where dr.words is not null and dr.words_lang is null;
update public.desk d set caller_words_lang=dr.words_lang from public.draft dr
 where dr.incident=d.id and d.caller_words=dr.words and d.caller_words_lang is null and dr.words_lang is not null;
update public.caller_card c set teachback_lang=(
  select coalesce(e.data->>'to',e.data->>'lang') from public.case_event e where e.incident=c.id
  and e.kind in ('paired','lang_changed') and e.id<(select max(last.id) from public.case_event last
    where last.incident=c.id and last.kind='teachback') order by e.id desc limit 1)
where c.teachback is not null and c.teachback_lang is null;

create or replace function ichido.eta_timestamp() returns trigger language plpgsql set search_path='' as $$
begin
  new.eta_at:=case when new.eta is not null then now() end;
  return new;
end $$;
create or replace trigger eta_timestamp before update of eta on public.caller_card for each row when(old.eta is distinct from new.eta or old.field_state is distinct from new.field_state) execute function ichido.eta_timestamp();
update public.caller_card c set eta_at=j.updated_at from public.field_job j where j.incident=c.id and c.eta is not null and c.eta_at is null;

-- Only the confirmed food-planning choices are carried onto the worker's existing assignment.
create or replace function ichido.allergy_choices(flags text[]) returns text[] language sql immutable set search_path='' as $$
  select case when 'diet_allergy'=any(flags) then array(select f from unnest(array['diet_allergy','allergy_me','allergy_child','allergy_other']) f where f=any(flags)) else '{}'::text[] end
$$;
create or replace function ichido.prune_allergy() returns trigger language plpgsql set search_path='' as $$
begin
  if not ('diet_allergy'=any(new.flags)) then new.flags:=array(select f from unnest(new.flags) f where f not in ('allergy_me','allergy_child','allergy_other')); end if;
  return new;
end $$;
create or replace trigger allergy_dependents before update of flags on public.caller_card for each row execute function ichido.prune_allergy();
create or replace function ichido.require_allergy_ack() returns trigger language plpgsql set search_path='' as $$
begin
  if cardinality(new.allergy_flags)>0 and new.allergy_ack_at is null then perform ichido.fail('conflict'); end if;
  return new;
end $$;
create or replace trigger require_allergy_ack before update of state on public.field_job for each row when(new.state='done') execute function ichido.require_allergy_ack();
create or replace function ichido.job_allergy() returns trigger language plpgsql security definer set search_path='' as $$
begin
  -- A job without a confirmed caller card (staff-opened, assisted before intake) has no allergy choices.
  new.allergy_flags := coalesce((select ichido.allergy_choices(c.confirmed_flags) from public.caller_card c where c.id=new.incident), '{}');
  new.allergy_ack_at:=null;
  return new;
end $$;
create or replace trigger job_allergy before insert or update of generation on public.field_job for each row execute function ichido.job_allergy();
create or replace function ichido.refresh_job_allergy() returns trigger language plpgsql security definer set search_path='' as $$
begin
  update public.field_job set allergy_flags=coalesce(ichido.allergy_choices(new.confirmed_flags),'{}'),allergy_ack_at=null
    where incident=new.id and allergy_flags<>coalesce(ichido.allergy_choices(new.confirmed_flags),'{}');
  return null;
end $$;
create or replace trigger refresh_job_allergy after update on public.caller_card for each row
  when(old.confirmed_flags is distinct from new.confirmed_flags) execute function ichido.refresh_job_allergy();
update public.field_job j set allergy_flags=ichido.allergy_choices(c.confirmed_flags),allergy_ack_at=null
 from public.caller_card c where c.id=j.incident and j.allergy_flags<>ichido.allergy_choices(c.confirmed_flags);
create or replace function public.ack_allergy(p_uid uuid,p_incident uuid,p_generation integer,p_flags text[]) returns void
language plpgsql security definer set search_path='' as $$
begin
  update public.field_job set allergy_ack_at=coalesce(allergy_ack_at,now()) where incident=p_incident and assignee=p_uid
    and generation=p_generation and not case_closed and declined_at is null and cardinality(allergy_flags)>0 and allergy_flags=p_flags
    and exists(select from ichido.staff where uid=p_uid and role='field');
  if not found then perform ichido.fail('conflict'); end if;
end $$;

-- One MVCC snapshot prevents a changed binding or a partial refresh from mixing two people's data.
create or replace function public.caller_screen(p_uid uuid) returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('card',to_jsonb(c),'draft',to_jsonb(dr),'station',jsonb_build_object('label',s.label,'branch',s.branch,'hours',s.counter_hours,
    'contact',case when s.contact_verified_at<=now() then s.public_contact_url end),
    'generation',b.voice_room,'reply',(select to_jsonb(r)-'operator_id' from public.reply r where r.id=c.reply_id),
    'turns',coalesce((select jsonb_agg(jsonb_build_object('seq',t.seq,'rev',t.rev,'speaker',t.speaker,'words',t.words,'wording',t.wording,'locale',t.locale) order by t.seq)
      from public.frontline_turn t where t.incident=c.id and t.generation=b.voice_room),'[]'::jsonb))
    from ichido.binding b join public.caller_card c on c.id=b.incident join public.draft dr on dr.incident=c.id
    join public.station s on s.id=c.station where b.uid=p_uid and b.expires>now()
$$;
alter policy reply_read on public.reply using (ichido.has_role('operator') or
  (ichido.owns(incident) and exists(select from public.caller_card c where c.id=incident and c.reply_id=reply.id)));

revoke all on function public.caller_screen(uuid),public.ack_allergy(uuid,uuid,integer,text[]),ichido.binding_state(),
  ichido.prune_allergy(),ichido.require_allergy_ack(),ichido.words_language(),ichido.eta_timestamp(),ichido.allergy_choices(text[]),ichido.job_allergy(),ichido.refresh_job_allergy() from public,anon,authenticated;
grant execute on function public.caller_screen(uuid),public.ack_allergy(uuid,uuid,integer,text[]) to service_role;
create or replace function public.assisted_intake(p_uid uuid,p_name text,p_incident uuid,p_fault text,p_lang text,p_source text,
  p_consent boolean,p_card public.fact,p_cash public.fact,p_flags text[]) returns void
language plpgsql security definer set search_path='' as $$
declare d public.desk; revision int;
begin
  d:=ichido.owned_case(p_uid,p_incident);
  delete from ichido.binding where incident=d.id and expires<=now();
  select * into d from public.desk where id=p_incident;
  if d.fault<>p_fault or d.confirmed_rev is not null or exists(select from ichido.binding where incident=d.id) then perform ichido.fail('conflict'); end if;
  if p_consent is not true or p_source not in ('handset','in_person') or p_lang not in ('bn','en','vi','ja','ne','id')
    or (d.text_only and p_source='handset') then perform ichido.fail('bad_request'); end if;
  if (select pack='atm' from ichido.situation where code=d.fault) then
    if p_card='unknown' and p_cash='unknown' then perform ichido.fail('conflict'); end if;
  elsif cardinality(p_flags)=0 then perform ichido.fail('conflict'); end if;
  delete from ichido.pair_code where incident=d.id;
  update public.draft set rev=rev+1 where incident=d.id returning rev into revision;
  update public.desk set assisted_source=p_source,lang=p_lang,confirmed_rev=revision,card_back=p_card,cash_received=p_cash,clarifying=false where id=d.id;
  update public.caller_card set flags=p_flags,lang=p_lang where id=d.id;
  update public.caller_card set confirmed_rev=revision where id=d.id;
  perform ichido.event(d.id,'operator','assisted_intake',jsonb_build_object('source',p_source,'consent',true,'lang',p_lang,'rev',revision),p_name);
end $$;

create or replace function public.assisted_delivery(p_uid uuid,p_name text,p_incident uuid,p_reply uuid,p_source text,p_teach text) returns void
language plpgsql security definer set search_path='' as $$
declare d public.desk;
begin
  d:=ichido.owned_case(p_uid,p_incident);
  if d.assisted_source is null or exists(select from ichido.binding where incident=d.id) then perform ichido.fail('conflict'); end if;
  if p_source not in ('handset','in_person') or (d.text_only and p_source='handset') or length(trim(p_teach)) not between 1 and 500 then perform ichido.fail('bad_request'); end if;
  update public.caller_card set teachback=p_teach,teachback_reply=p_reply where id=d.id and reply_id=p_reply;
  if not found then perform ichido.fail('conflict'); end if;
  perform ichido.event(d.id,'operator','assisted_delivery',jsonb_build_object('source',p_source,'reply',p_reply),p_name);
  perform public.cmd_outcome(p_uid,p_name,d.id,p_reply,'understood');
end $$;

create or replace function public.bank_update(p_uid uuid,p_name text,p_incident uuid,p_status text,p_due date,p_channel text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_status in ('contact_by','contacted') and (p_channel is null or p_channel not in ('email','phone')) then perform ichido.fail('bad_request'); end if;
  perform public.cmd_bank_status(p_uid,p_name,p_incident,p_status,p_due);
  update public.caller_card set callback_channel=p_channel where id=p_incident;
end $$;

revoke all on function public.assisted_intake(uuid,text,uuid,text,text,text,boolean,public.fact,public.fact,text[]),
  public.assisted_delivery(uuid,text,uuid,uuid,text,text),public.bank_update(uuid,text,uuid,text,date,text) from public,anon,authenticated;
grant execute on function public.assisted_intake(uuid,text,uuid,text,text,text,boolean,public.fact,public.fact,text[]),
  public.assisted_delivery(uuid,text,uuid,uuid,text,text),public.bank_update(uuid,text,uuid,text,date,text) to service_role;

-- Other needs reach a person without asserting an ATM fact. Held-card instructions still require the confirmed card fact.
create or replace function public.cmd_confirm(p_uid uuid, p_rev int) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.desk; dr public.draft; atm boolean; tapped boolean;
begin
  d := ichido.caller_case(p_uid);
  select * into dr from public.draft where incident = d.id for update;
  atm := coalesce((select pack = 'atm' from ichido.situation where code = d.fault), true);
  select case when atm then 'need_other'=any(flags) else cardinality(flags)>0 end into tapped from public.caller_card where id = d.id;
  if dr.rev <> p_rev or dr.needs_clarification
     or (atm and not tapped and dr.card_back = 'unknown' and dr.cash_received = 'unknown')
     or (not atm and not tapped) then
    perform ichido.fail('conflict');
  end if;
  if exists (select 1 from public.caller_card where id = d.id and confirmed_rev is not null) then perform ichido.fail('conflict'); end if;
  update public.desk set card_back = dr.card_back, cash_received = dr.cash_received, confirmed_rev = dr.rev,
                         caller_words = dr.words, clarifying = false where id = d.id;
  update public.caller_card set confirmed_rev = dr.rev where id = d.id;
  perform ichido.event(d.id, 'caller', 'confirmed', jsonb_build_object('card_back', dr.card_back, 'cash_received', dr.cash_received));
end $$;

create or replace function public.frontline_monitor(p_uid uuid,p_session uuid,p_incident uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g uuid;
begin
  if not exists(select from auth_ba."session" s join auth_ba."user" u on u.id=s."userId"
    join ichido.staff st on st.uid=u.id where s.id=p_session and u.id=p_uid and not u.banned
      and st.role='operator' and s.aal='aal2' and s."expiresAt">now()) then perform ichido.fail('forbidden'); end if;
  select b.voice_room into g from ichido.binding b join public.desk d on d.id=b.incident
    where b.incident=p_incident and b.expires>now() and d.handler<>'legacy' and d.finished_at is null;
  if not found then return '[]'::jsonb; end if;
  insert into ichido.frontline_monitor(incident,generation,staff_id,session_id) values(p_incident,g,p_uid,p_session)
    on conflict do nothing;
  return (select coalesce(jsonb_agg(jsonb_build_object('seq',t.seq,'speaker',t.speaker,'locale',t.locale,
    'words',t.words,'ja',j.ja,'slots',r.slots,'manual_version',r.manual_version,'wording',t.wording,'facts',t.facts,'rev',t.rev,'at',t.at) order by t.seq),'[]')
    from public.frontline_turn t left join public.frontline_translation j using(seq) left join public.reply r on r.id=t.reply_id
    where t.incident=p_incident and t.generation=g);
end $$;

create or replace function ichido.work_fits(i uuid,intent text) returns boolean language sql stable security definer set search_path='' as $$
 select case
 when intent in ('HOSP_STAFF_COMING','CITY_STAFF_COMING','SHELTER_STAFF_COMING','TRANSIT_ACCESS')
   then exists(select from public.field_job where incident=i and state='on_way' and declined_at is null and not case_closed)
 when intent in ('SHELTER_NEEDS','SHELTER_FAMILY')
   then exists(select from public.field_job where incident=i and accepted_at is not null and declined_at is null and not case_closed
     and (intent<>'SHELTER_NEEDS' or cardinality(allergy_flags)=0 or allergy_ack_at is not null))
 when intent in ('HOSP_INTERPRETER','CITY_APPOINTMENT')
   then exists(select from public.partner_work where incident=i and recipient=case intent when 'HOSP_INTERPRETER' then 'medical_interpreter' else 'consult_desk' end and requested_at is not null)
 when intent='TRANSIT_LEAVE' then exists(select from public.partner_work where incident=i and recipient='railway' and accepted_at is not null and railway_ref is not null)
 else true end
$$;

commit;
