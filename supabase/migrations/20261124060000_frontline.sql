begin;
alter table public.desk
  add column if not exists handler text not null default 'legacy' check (handler in ('legacy','ai','queued','human')),
  add column if not exists handler_epoch integer not null default 0,
  add column if not exists priority smallint check (priority between 0 and 2),
  add column if not exists transfer_reason text,
  add column if not exists queued_at timestamptz,
  add column if not exists human_connected_at timestamptz,
  add column if not exists resolved_by text check (resolved_by in ('ai','human'));
alter table public.caller_card add column if not exists handler text not null default 'legacy';

create or replace function ichido.frontline_owner() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.handler <> 'legacy' then
    if new.operator_id is distinct from old.operator_id and new.operator_id is not null then
      new.handler := 'human';
      new.queued_at := coalesce(old.queued_at, now());
      new.human_connected_at := coalesce(old.human_connected_at, now());
    end if;
    if new.handler <> old.handler or new.operator_id is distinct from old.operator_id then
      new.handler_epoch := old.handler_epoch + 1;
    end if;
    if new.status = 'guided' and old.status <> 'guided' then new.resolved_by := 'human'; end if;
  end if;
  return new;
end $$;
create or replace trigger frontline_owner before update on public.desk
for each row execute function ichido.frontline_owner();

create or replace function ichido.frontline_card() returns trigger
language plpgsql set search_path = '' as $$
begin
  update public.caller_card set handler = new.handler where id = new.id;
  return null;
end $$;
create or replace trigger frontline_card after update on public.desk for each row
when (old.handler <> new.handler) execute function ichido.frontline_card();

create or replace function ichido.queue_frontline(i uuid, severity integer, reason text) returns void
language plpgsql set search_path = '' as $$
begin
  update public.desk set handler = case when operator_id is null then 'queued' else 'human' end,
    priority = severity, transfer_reason = reason, queued_at = coalesce(queued_at, now())
    where id = i and finished_at is null and handler <> 'legacy'
      and (priority is null or severity < priority);
  if found then
    update public.caller_card set needs_human = true where id = i;
    perform ichido.event(i, 'system', 'frontline_transfer', jsonb_build_object('priority',severity,'reason',reason));
  end if;
end $$;

create or replace function public.cmd_display_press(p_station text, p_key text, p_fault text, p_code text, p_digest text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare i uuid; previous uuid;
begin
  perform 1 from public.station where id = p_station for update;
  select incident into i from ichido.device_event where station = p_station and event_key = p_key;
  if found then return i; end if;
  select id into previous from public.desk where station = p_station and finished_at is null;
  i := public.record_fault(p_station, p_key, 'device', p_fault);
  if previous is null then
    update public.desk set handler = 'ai' where id = i;
    -- The insert and transition share the station lock and transaction.
    delete from ichido.alert_outbox where kind = 'new_case' and incident = i;
  end if;
  perform 1 from public.desk where id = i and handler = 'ai' and lang is null and finished_at is null for update;
  if not found or exists (select from ichido.binding where incident = i)
    or exists (select from ichido.pair_code where incident = i and expires > clock_timestamp()) then return i; end if;
  insert into ichido.pair_code (incident,digest,expires) values (i,p_digest,clock_timestamp() + interval '5 minutes')
    on conflict (incident) do update set digest = excluded.digest, expires = excluded.expires;
  insert into ichido.device_code(incident,code,digest) values (i,p_code,p_digest)
    on conflict (incident) do update set code = excluded.code, digest = excluded.digest;
  return i;
end $$;

create or replace function public.frontline_pair(p_uid uuid,p_station text,p_digest text,p_lang text,p_frontline boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare i uuid;
begin
  i := public.redeem_pair(p_uid,p_station,p_digest,p_lang);
  if not p_frontline then perform ichido.queue_frontline(i,1,'staffed_entry'); end if;
  return i;
end $$;

create or replace function public.cmd_human(p_uid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.desk;
begin
  d := ichido.caller_case(p_uid);
  perform ichido.queue_frontline(d.id,1,'human_request');
  update public.caller_card set needs_human = true where id = d.id and not needs_human;
  if found then perform ichido.event(d.id,'caller','human','{}'); end if;
end $$;

create or replace function public.frontline_takeover(p_uid uuid,p_name text,p_incident uuid,p_epoch integer)
returns void language plpgsql security definer set search_path = '' as $$
declare d public.desk;
begin
  if not exists (select from ichido.staff where uid=p_uid and role='operator') then perform ichido.fail('forbidden'); end if;
  select * into d from public.desk where id=p_incident for update;
  if not found then perform ichido.fail('not_found'); end if;
  if d.handler <> 'legacy' then
    if d.finished_at is not null or (p_epoch is not null and d.handler_epoch <> p_epoch) then perform ichido.fail('conflict'); end if;
    if d.operator_id is null then
      perform public.cmd_claim(p_uid,p_name,p_incident);
      return;
    end if;
    if p_epoch is null then perform ichido.fail('conflict'); end if;
  end if;
  perform public.cmd_takeover(p_uid,p_name,p_incident);
end $$;
create or replace function public.cmd_silent_alert(p_uid uuid, p_station text, p_fault text) returns void
language plpgsql security definer set search_path = '' as $$
declare i uuid; since timestamptz;
begin
  if not exists (select from auth.users where id = p_uid and is_anonymous)
     or exists (select from ichido.staff where uid = p_uid) then perform ichido.fail('forbidden'); end if;
  if not exists (select from public.station where id = p_station) then perform ichido.fail('not_found'); end if;
  perform pg_advisory_xact_lock(1, hashtext(p_uid::text));
  perform pg_advisory_xact_lock(3, hashtext(p_station));
  if exists (select from ichido.binding where uid = p_uid and expires > now()) then perform ichido.fail('conflict'); end if;
  since := clock_timestamp() - interval '10 minutes';
  if (select count(*) from ichido.silent_alert where uid = p_uid and at > since) >= 3
     or (select count(*) from ichido.silent_alert where station = p_station and at > since) >= 10 then
    perform ichido.fail('rate_limited');
  end if;
  insert into ichido.silent_alert (uid, station, at) values (p_uid, p_station, clock_timestamp());
  i := public.record_fault(p_station, md5(gen_random_uuid()::text), 'caller', p_fault);
  perform ichido.queue_frontline(i,1,'human_request');
  update public.desk set text_only = true where id = i and not text_only;
  if found then
    update public.caller_card set text_only = true where id = i;
    perform ichido.event(i, 'caller', 'text_only', '{}');
  end if;
end $$;

revoke all on function ichido.frontline_owner(), ichido.frontline_card(), ichido.queue_frontline(uuid,integer,text),
  public.cmd_display_press(text,text,text,text,text), public.frontline_pair(uuid,text,text,text,boolean),
  public.frontline_takeover(uuid,text,uuid,integer) from public, anon, authenticated;
grant execute on function public.cmd_display_press(text,text,text,text,text), public.frontline_pair(uuid,text,text,text,boolean),
  public.frontline_takeover(uuid,text,uuid,integer) to service_role;

alter table ichido.binding add column if not exists frontline_started boolean not null default false;
alter table ichido.reply_rule add column if not exists autonomous boolean not null default false;
update ichido.reply_rule set autonomous = true where intent = 'SHELTER_INFO' and pack = 'shelter' and not autonomous;
alter table public.reply alter column operator_id drop not null,
  add column if not exists author text not null default 'human' check (author in ('ai','human'));
do $$ begin
  if not exists (select from pg_constraint where conrelid='public.reply'::regclass and conname='reply_author_owner') then
    alter table public.reply add constraint reply_author_owner check ((author = 'ai') = (operator_id is null));
  end if;
end $$;

create table if not exists public.frontline_turn (
  seq bigint generated always as identity primary key,
  incident uuid not null references public.desk on delete cascade,
  generation uuid not null,
  request_id uuid not null,
  speaker text not null check (speaker in ('caller','ai','human')),
  locale text not null check (locale in ('bn','vi','id','ne','en','ja')),
  channel text not null default 'text' check (channel in ('text','tap','voice')),
  words text check (length(words) <= 500 and speaker='caller'),
  wording text not null,
  facts jsonb not null default '{}',
  rev integer not null, epoch integer not null,
  reply_id uuid references public.reply on delete cascade,
  delivery text not null default 'committed',
  policy_version text not null default 'frontline-1',
  at timestamptz not null default now(),
  unique (incident,generation,request_id,speaker)
);
create index if not exists frontline_session on public.frontline_turn(incident,generation,seq);
alter table public.frontline_turn enable row level security;
revoke all on public.frontline_turn from public, anon, authenticated, service_role;
grant select on public.frontline_turn to authenticated, service_role;
create or replace trigger frontline_immutable before update or delete on public.frontline_turn
for each row execute function ichido.case_event_append_only();

create or replace function ichido.owns_generation(i uuid,g uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select ichido.owns(i) and exists (select from ichido.binding where incident=i and uid=auth.uid() and voice_room=g and expires>now())
$$;
revoke all on function ichido.owns_generation(uuid,uuid) from public,anon;
grant execute on function ichido.owns_generation(uuid,uuid) to authenticated;
drop policy if exists frontline_caller on public.frontline_turn;
create policy frontline_caller on public.frontline_turn for select to authenticated using (ichido.owns_generation(incident,generation));

create or replace function ichido.frontline_greeting() returns trigger
language plpgsql set search_path = '' as $$
begin
  insert into public.frontline_turn(incident,generation,request_id,speaker,locale,wording,rev,epoch)
    select d.id,new.voice_room,gen_random_uuid(),'ai',new.lang,'greeting',dr.rev,d.handler_epoch
    from public.desk d join public.draft dr on dr.incident=d.id where d.id=new.incident and d.handler='ai';
  return null;
end $$;
create or replace trigger frontline_greeting after insert on ichido.binding for each row execute function ichido.frontline_greeting();

-- Reserve the submitted revision before inference. A second submission invalidates the first candidate.
create or replace function public.frontline_submit(p_uid uuid,p_generation uuid,p_request uuid,p_rev int,
  p_act text,p_words text,p_facts jsonb,p_priority int,p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d public.desk; b ichido.binding; dr public.draft; prior public.frontline_turn; n bigint; flags_now text[];
begin
  d := ichido.caller_case(p_uid);
  select * into strict b from ichido.binding where incident=d.id and uid=p_uid;
  if b.voice_room <> p_generation or d.handler='legacy' then perform ichido.fail('forbidden'); end if;
  select * into strict dr from public.draft where incident=d.id;
  select * into prior from public.frontline_turn where incident=d.id and generation=p_generation and request_id=p_request and speaker='caller';
  if found then
    return jsonb_build_object('rev',prior.rev,'epoch',prior.epoch,'replay',true,'act',prior.wording);
  end if;
  if p_act='start' then
    update ichido.binding set frontline_started=true where incident=d.id;
  elsif not b.frontline_started then perform ichido.fail('forbidden');
  end if;
  if p_act not in ('start','text','withheld','facts','tap','confirm','change','unsure') then perform ichido.fail('bad_request'); end if;
  if p_priority is null and p_act <> 'start' and p_rev is distinct from dr.rev then perform ichido.fail('conflict'); end if;
  if p_act not in ('start','text','withheld') and d.handler <> 'ai' and d.confirmed_rev is not null then perform ichido.fail('conflict'); end if;
  if p_act in ('change','text','tap','facts','unsure') and d.handler='ai' and d.confirmed_rev is not null then
    update public.desk set confirmed_rev=null,caller_words=null,caller_words_ja=null,triage=null,card_back='unknown',cash_received='unknown' where id=d.id;
    update public.caller_card set confirmed_rev=null,reply_id=null,teachback=null,teachback_ja=null,teachback_result=null where id=d.id;
  end if;
  if p_act in ('text','facts','tap','change','unsure') and (d.handler='ai' or d.confirmed_rev is null) then
    update public.draft set rev=rev+1, words=case when p_act='text' then p_words else words end,
      card_back=coalesce((p_facts->>'card_back')::public.fact,card_back),
      cash_received=coalesce((p_facts->>'cash_received')::public.fact,cash_received),
      needs_clarification=false,triage=null where incident=d.id returning * into dr;
    if p_act='tap' then
      perform public.cmd_flag(p_uid,other,false) from jsonb_array_elements_text(p_facts->'off') as x(other);
      perform public.cmd_flag(p_uid,p_facts->>'flag',(p_facts->>'on')::boolean);
    end if;
  elsif p_act='confirm' then
    select flags into flags_now from public.caller_card where id=d.id;
    if flags_now = array['need_news'] and exists(select from ichido.situation where code=d.fault and pack='shelter') then
      update public.desk set fault='shelter_info' where id=d.id returning * into d;
      update public.caller_card set fault=d.fault where id=d.id;
    end if;
    perform public.cmd_confirm(p_uid,p_rev);
  end if;
  insert into public.frontline_turn(incident,generation,request_id,speaker,locale,channel,words,wording,facts,rev,epoch)
    values(d.id,p_generation,p_request,'caller',b.lang,case when p_act in ('text','withheld') then 'text' else 'tap' end,
      p_words,p_act,p_facts,dr.rev,d.handler_epoch) returning seq into n;
  if d.handler='ai' and p_priority is null then
    if (select count(*) from public.frontline_turn where incident=d.id and generation=p_generation and speaker='ai') >= 6 then
      p_priority:=2; p_reason:='limit';
    elsif p_act in ('change','unsure') and (select count(*) from public.frontline_turn where incident=d.id and generation=p_generation and wording in ('change','unsure')) >= 2 then
      p_priority:=2; p_reason:='unclear';
    end if;
  end if;
  if p_priority is not null then perform ichido.queue_frontline(d.id,p_priority,p_reason); end if;
  select flags into flags_now from public.caller_card where id=d.id;
  return jsonb_build_object('seq',n,'rev',dr.rev,'epoch',d.handler_epoch,'locale',b.lang,'fault',d.fault,
    'handler',(select handler from public.desk where id=d.id),'flags',flags_now,'card_back',dr.card_back,'cash_received',dr.cash_received);
end $$;

-- Only the caller's current, confirmed notice-board request has an autonomous manual entry.
create or replace function ichido.autonomous_allowed() returns trigger
language plpgsql set search_path = '' as $$
declare d public.desk; fl text[];
begin
  if new.author='ai' then
    select * into strict d from public.desk where id=new.incident for update;
    select flags into fl from public.caller_card where id=d.id;
    if d.handler <> 'ai' or d.finished_at is not null or d.confirmed_rev is null or d.clarifying or
       d.fraud_at is not null or d.priority is not null or new.intent <> 'SHELTER_INFO' or
       fl is distinct from array['need_news'] or
       not exists (select from ichido.reply_rule where intent=new.intent and autonomous and pack='shelter') or
       not ichido.reply_ok(new.intent,d.fault,fl) then perform ichido.fail('conflict'); end if;
  end if;
  return new;
end $$;
create or replace trigger frontline_eligible before insert on public.reply for each row execute function ichido.autonomous_allowed();

create or replace function public.frontline_finish(p_uid uuid,p_generation uuid,p_request uuid,p_wording text,p_patch jsonb,
  p_triage jsonb,p_priority int,p_reason text,p_manual text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare d public.desk; t public.frontline_turn; dr public.draft; r uuid;
begin
  d:=ichido.caller_case(p_uid);
  if not exists(select from ichido.binding where incident=d.id and uid=p_uid and voice_room=p_generation) then perform ichido.fail('forbidden'); end if;
  select * into strict t from public.frontline_turn where incident=d.id and generation=p_generation and request_id=p_request and speaker='caller';
  if exists(select from public.frontline_turn where incident=d.id and generation=p_generation and request_id=p_request and speaker='ai') then return false; end if;
  if p_priority is not null then perform ichido.queue_frontline(d.id,p_priority,p_reason); return false; end if;
  select * into dr from public.draft where incident=d.id;
  if d.handler <> 'ai' or d.handler_epoch <> t.epoch or dr.rev <> t.rev or d.lang <> t.locale then return false; end if;
  if p_wording not in ('readback','SHELTER_INFO','withheld') then perform ichido.fail('bad_request'); end if;
  if p_wording='SHELTER_INFO' then
    if t.wording <> 'confirm' or d.confirmed_rev is distinct from t.rev then perform ichido.fail('conflict'); end if;
    insert into public.reply(incident,intent,manual_version,author) values(d.id,p_wording,p_manual,'ai') returning id into r;
    update public.caller_card set reply_id=r where id=d.id;
  else
    if d.confirmed_rev is not null then return false; end if;
    update public.draft set rev=rev+1,card_back=coalesce((p_patch->>'card_back')::public.fact,card_back),
      cash_received=coalesce((p_patch->>'cash_received')::public.fact,cash_received),
      triage=p_triage where incident=d.id returning * into dr;
  end if;
  insert into public.frontline_turn(incident,generation,request_id,speaker,locale,wording,facts,rev,epoch,reply_id)
    values(d.id,p_generation,p_request,'ai',t.locale,p_wording,
      jsonb_strip_nulls(jsonb_build_object('triage',p_triage,'card_back',dr.card_back,'cash_received',dr.cash_received)),dr.rev,t.epoch,r);
  return true;
end $$;
revoke all on function ichido.frontline_greeting(),ichido.autonomous_allowed(),
  public.frontline_submit(uuid,uuid,uuid,int,text,text,jsonb,int,text),
  public.frontline_finish(uuid,uuid,uuid,text,jsonb,jsonb,int,text,text) from public,anon,authenticated;
grant execute on function public.frontline_submit(uuid,uuid,uuid,int,text,text,jsonb,int,text),
  public.frontline_finish(uuid,uuid,uuid,text,jsonb,jsonb,int,text,text) to service_role;


create table if not exists public.frontline_translation (
  seq bigint primary key references public.frontline_turn on delete cascade, ja text not null check (length(ja)<=1000)
);
alter table public.frontline_translation enable row level security;
revoke all on public.frontline_translation from public,anon,authenticated,service_role;
grant select,insert on public.frontline_translation to service_role;

create table if not exists ichido.frontline_monitor (
  incident uuid not null references public.desk on delete cascade,
  generation uuid not null, staff_id uuid not null, session_id uuid not null, at timestamptz not null default now(),
  primary key(incident,generation,staff_id,session_id)
);
alter table ichido.frontline_monitor enable row level security;
revoke all on ichido.frontline_monitor from public,anon,authenticated,service_role;

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
    'words',t.words,'ja',j.ja,'wording',t.wording,'facts',t.facts,'rev',t.rev,'at',t.at) order by t.seq),'[]')
    from public.frontline_turn t left join public.frontline_translation j using(seq)
    where t.incident=p_incident and t.generation=g);
end $$;

create or replace function ichido.frontline_transition() returns trigger
language plpgsql set search_path='' as $$
begin
  insert into public.frontline_turn(incident,generation,request_id,speaker,locale,wording,rev,epoch)
    select new.id,b.voice_room,gen_random_uuid(),case new.handler when 'human' then 'human' else 'ai' end,b.lang,
      case new.handler when 'human' then 'connected' else 'queued' end,dr.rev,new.handler_epoch
    from ichido.binding b join public.draft dr using(incident) where b.incident=new.id and b.expires>now();
  return null;
end $$;
create or replace trigger frontline_transition after update on public.desk for each row
when (new.handler in ('human','queued') and new.handler<>old.handler) execute function ichido.frontline_transition();

create or replace function ichido.frontline_human_reply() returns trigger
language plpgsql set search_path='' as $$
begin
  insert into public.frontline_turn(incident,generation,request_id,speaker,locale,wording,rev,epoch,reply_id)
    select d.id,b.voice_room,new.id,'human',b.lang,new.intent,d.confirmed_rev,d.handler_epoch,new.id
    from public.desk d join ichido.binding b on b.incident=d.id
    where d.id=new.incident and d.handler='human' and b.expires>now();
  return null;
end $$;
create or replace trigger frontline_human_reply after insert on public.reply for each row
when (new.author='human') execute function ichido.frontline_human_reply();

revoke all on function public.frontline_monitor(uuid,uuid,uuid), ichido.frontline_transition(),ichido.frontline_human_reply()
  from public,anon,authenticated;
grant execute on function public.frontline_monitor(uuid,uuid,uuid) to service_role;
create or replace trigger live_insert after insert on public.frontline_turn referencing new table as new_rows
  for each statement execute function ichido.live_send('incident','incident');
create or replace trigger live_insert after insert on public.frontline_translation referencing new table as new_rows
  for each statement execute function ichido.live_send();
drop policy if exists frontline_staff_topic on realtime.messages;
create policy frontline_staff_topic on realtime.messages for select to authenticated
  using (extension='broadcast' and realtime.topic() in ('live:frontline_turn','live:frontline_translation') and ichido.has_role('operator'));

notify pgrst, 'reload schema';
commit;
