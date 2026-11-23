begin;

alter table public.desk add column if not exists binding_expires timestamptz,
  add column if not exists caller_words_lang text,
  add column if not exists assisted_source text check (assisted_source in ('handset','in_person'));
alter table public.draft add column if not exists words_lang text;
alter table public.caller_card add column if not exists teachback_lang text, add column if not exists eta_at timestamptz,
  add column if not exists callback_channel text check (callback_channel in ('phone','email'));
alter table public.station add column if not exists host_org text, add column if not exists short_address text;
alter table public.field_job add column if not exists allergy_flags text[] not null default '{}',
  add column if not exists allergy_ack_at timestamptz;

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
  select ichido.allergy_choices(c.confirmed_flags) into new.allergy_flags from public.caller_card c where c.id=new.incident;
  new.allergy_ack_at:=null;
  return new;
end $$;
create or replace trigger job_allergy before insert or update of generation on public.field_job for each row execute function ichido.job_allergy();
create or replace function ichido.refresh_job_allergy() returns trigger language plpgsql security definer set search_path='' as $$
begin
  update public.field_job set allergy_flags=ichido.allergy_choices(new.confirmed_flags),allergy_ack_at=null
    where incident=new.id and allergy_flags<>ichido.allergy_choices(new.confirmed_flags);
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
  select jsonb_build_object('card',to_jsonb(c),'draft',to_jsonb(dr),'station',jsonb_build_object('label',s.label,'branch',s.branch,'hours',s.counter_hours),
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

commit;
