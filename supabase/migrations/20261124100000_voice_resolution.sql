begin;

alter table ichido.binding add column if not exists voice_session uuid,
  add column if not exists voice_job text;
create table if not exists ichido.turn_delivery (
  seq bigint primary key references public.frontline_turn on delete cascade,
  mode text not null check (mode in ('screen','voice')),
  state text not null default 'pending' check (state in ('pending','playing','partial','full')),
  delivered_at timestamptz
);
alter table ichido.turn_delivery enable row level security;
revoke all on ichido.turn_delivery from public,anon,authenticated,service_role;

create or replace function ichido.turn_channel() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.speaker='caller' and new.wording<>'start' then
    update ichido.turn_delivery v set state='partial' from public.frontline_turn t where t.seq=v.seq
      and t.generation=new.generation and v.mode='voice' and v.state in ('playing','pending');
  end if;
  if new.speaker='caller' and current_setting('ichido.voice_input',true)='1' then new.channel:='voice'; end if;
  return new;
end $$;
create or replace trigger turn_channel before insert on public.frontline_turn for each row execute function ichido.turn_channel();
create or replace function ichido.track_delivery() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into ichido.turn_delivery(seq,mode)
    select new.seq,case when b.voice_session is null then 'screen' else 'voice' end
    from ichido.binding b where b.voice_room=new.generation and b.incident=new.incident;
  return null;
end $$;
create or replace trigger track_delivery after insert on public.frontline_turn for each row
  when(new.speaker='ai') execute function ichido.track_delivery();

create or replace function public.voice_begin(p_uid uuid,p_generation uuid,p_lang text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.desk; s uuid;
begin
  d:=ichido.caller_case(p_uid);
  if d.lang is distinct from p_lang or d.lang='ne' or d.text_only or d.handler='legacy' then perform ichido.fail('forbidden'); end if;
  perform public.voice_end(p_uid,p_generation,b.voice_session) from ichido.binding b
    where b.uid=p_uid and b.voice_room=p_generation and b.voice_session is not null;
  update ichido.binding set voice_session=gen_random_uuid(),voice_job=null
    where uid=p_uid and voice_room=p_generation and frontline_started returning voice_session into s;
  if not found then perform ichido.fail('forbidden'); end if;
  return jsonb_build_object('session',s,'epoch',d.handler_epoch,'handler',d.handler);
end $$;

create or replace function public.voice_end(p_uid uuid,p_generation uuid,p_session uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.desk d join ichido.binding b on b.incident=d.id
    where b.uid=p_uid and b.voice_room=p_generation for update of d;
  update ichido.binding set voice_session=null,voice_job=null where uid=p_uid and voice_room=p_generation and voice_session=p_session;
  if found then
    update ichido.turn_delivery v set state='partial' from public.frontline_turn t
      where t.seq=v.seq and t.generation=p_generation and v.mode='voice' and v.state in ('pending','playing');
  end if;
end $$;

create or replace function ichido.voice_owner(p_scope jsonb) returns public.desk
language plpgsql security definer set search_path='' as $$
declare d public.desk; b ichido.binding;
begin
  d:=ichido.caller_case((p_scope->>'uid')::uuid);
  select * into strict b from ichido.binding where incident=d.id;
  if d.handler<>'ai' or d.text_only or not b.frontline_started or d.lang='ne'
    or d.id is distinct from (p_scope->>'incident')::uuid or d.lang is distinct from p_scope->>'lang'
    or d.handler_epoch is distinct from (p_scope->>'epoch')::int or b.voice_room is distinct from (p_scope->>'generation')::uuid
    or b.voice_session is null or b.voice_session is distinct from (p_scope->>'session')::uuid
    or nullif(p_scope->>'job','') is null or (b.voice_job is not null and b.voice_job<>p_scope->>'job')
    then perform ichido.fail('forbidden'); end if;
  if b.voice_job is null then update ichido.binding set voice_job=p_scope->>'job' where incident=d.id; end if;
  return d;
end $$;
create or replace function public.voice_submit(p_scope jsonb,p_uid uuid,p_generation uuid,p_request uuid,p_rev int,
  p_act text,p_words text,p_facts jsonb,p_priority int,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.desk;
begin
  d:=ichido.voice_owner(p_scope);
  if p_uid is distinct from (p_scope->>'uid')::uuid or p_generation is distinct from (p_scope->>'generation')::uuid
    then perform ichido.fail('forbidden'); end if;
  perform set_config('ichido.voice_input','1',true);
  return public.frontline_submit(p_uid,p_generation,p_request,p_rev,p_act,p_words,p_facts,p_priority,p_reason);
end $$;
create or replace function public.voice_finish(p_scope jsonb,p_uid uuid,p_generation uuid,p_request uuid,p_wording text,
 p_patch jsonb,p_triage jsonb,p_priority int,p_reason text,p_manual text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  perform ichido.voice_owner(p_scope);
  if p_uid is distinct from (p_scope->>'uid')::uuid or p_generation is distinct from (p_scope->>'generation')::uuid
    then perform ichido.fail('forbidden'); end if;
  return public.frontline_finish(p_uid,p_generation,p_request,p_wording,p_patch,p_triage,p_priority,p_reason,p_manual);
end $$;
revoke all on function public.voice_finish(jsonb,uuid,uuid,uuid,text,jsonb,jsonb,int,text,text) from public,anon,authenticated;
grant execute on function public.voice_finish(jsonb,uuid,uuid,uuid,text,jsonb,jsonb,int,text,text) to service_role;

create or replace function public.voice_step(p_scope jsonb,p_action text,p_seq bigint default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.desk; dr public.draft; t public.frontline_turn; v ichido.turn_delivery; c public.caller_card;
begin
  d:=ichido.voice_owner(p_scope);
  select * into strict dr from public.draft where incident=d.id;
  if p_action='failure' then perform ichido.queue_frontline(d.id,2,'provider'); return '{}'; end if;
  select * into c from public.caller_card where id=d.id;
  select a.* into t from public.frontline_turn a where a.incident=d.id and a.generation=(p_scope->>'generation')::uuid
    and a.speaker='ai' and a.epoch=d.handler_epoch and a.locale=d.lang and a.rev=dr.rev
    and (a.reply_id is null or a.reply_id=c.reply_id) order by a.seq desc limit 1;
  select * into v from ichido.turn_delivery where seq=t.seq;
  if p_action='state' then
    return jsonb_build_object('rev',dr.rev,'seq',t.seq,'pending',v.state='pending','wording',t.wording,
      'facts',t.facts,'fault',d.fault,'flags',c.flags,'confirmed',d.confirmed_rev=dr.rev);
  end if;
  if p_action='partial' then
    update ichido.turn_delivery v set state='partial' from public.frontline_turn a where a.seq=p_seq and a.seq=v.seq
      and a.incident=d.id and a.generation=(p_scope->>'generation')::uuid and v.state in ('playing','partial');
    if not found then perform ichido.fail('conflict'); end if;
    return '{}';
  end if;
  if p_seq is null or p_seq is distinct from t.seq then perform ichido.fail('conflict'); end if;
  if p_action='play' and v.state='pending' then
    update ichido.turn_delivery set mode='voice',state='playing' where seq=t.seq;
  elsif p_action='full' and v.state='playing' then
    update ichido.turn_delivery set state=p_action,delivered_at=case when p_action='full' then clock_timestamp() end where seq=t.seq;
  else perform ichido.fail('conflict'); end if;
  perform realtime.send(jsonb_build_object('table','frontline_turn'),'change','live:incident:'||d.id,true);
  return '{}';
end $$;

create or replace function ichido.cancel_voice() returns trigger language plpgsql security definer set search_path='' as $$
begin
  update ichido.turn_delivery v set state='partial' from public.frontline_turn t
    where t.seq=v.seq and t.incident=new.id and v.mode='voice' and v.state in ('pending','playing');
  update ichido.binding set voice_session=null,voice_job=null where incident=new.id;
  return null;
end $$;
create or replace trigger cancel_voice after update on public.desk for each row
  when(old.handler_epoch<>new.handler_epoch or (old.finished_at is null and new.finished_at is not null))
  execute function ichido.cancel_voice();

revoke all on function ichido.turn_channel(),ichido.track_delivery(),ichido.cancel_voice(),ichido.voice_owner(jsonb),
 public.voice_begin(uuid,uuid,text),public.voice_end(uuid,uuid,uuid),public.voice_step(jsonb,text,bigint),
 public.voice_submit(jsonb,uuid,uuid,uuid,int,text,text,jsonb,int,text) from public,anon,authenticated;
grant execute on function public.voice_begin(uuid,uuid,text),public.voice_end(uuid,uuid,uuid),public.voice_step(jsonb,text,bigint),
 public.voice_submit(jsonb,uuid,uuid,uuid,int,text,text,jsonb,int,text) to service_role;

create or replace function public.voice_failure(p_uid uuid,p_generation uuid) returns void
language plpgsql security definer set search_path='' as $$
declare d public.desk;
begin
  d:=ichido.caller_case(p_uid);
  if not exists(select from ichido.binding where uid=p_uid and voice_room=p_generation and frontline_started)
    then perform ichido.fail('forbidden'); end if;
  if d.handler='ai' then perform ichido.queue_frontline(d.id,2,'provider'); end if;
end $$;
revoke all on function public.voice_failure(uuid,uuid) from public,anon,authenticated;
grant execute on function public.voice_failure(uuid,uuid) to service_role;

create or replace function ichido.frontline_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.handler <> 'legacy' then
    if new.operator_id is distinct from old.operator_id and new.operator_id is not null then
      new.handler := 'human';
      new.queued_at := coalesce(old.queued_at, now());
      new.human_connected_at := coalesce(old.human_connected_at, now());
    end if;
    if new.handler <> old.handler or new.operator_id is distinct from old.operator_id or
       (old.lang is not null and new.lang is distinct from old.lang) then
      new.handler_epoch := old.handler_epoch + 1;
    end if;
    if new.status = 'guided' and old.status <> 'guided' then new.resolved_by := case when new.handler='ai' then 'ai' else 'human' end; end if;
  end if;
  return new;
end $$;
alter table ichido.ops_setting drop constraint if exists ops_setting_key_check, drop constraint if exists ops_setting_value_check;
alter table ichido.ops_setting add constraint ops_setting_key_check check (key in
  ('mass_stations','mass_window_s','arrived_open_s','pair_station_limit','pair_phone_limit','ai_closure','qa_sample')),
  add constraint ops_setting_value_check check (case when key in ('ai_closure','qa_sample') then value in (0,1) else value>0 end);
insert into ichido.ops_setting(key,value) values('ai_closure',0),('qa_sample',0) on conflict do nothing;

create table if not exists ichido.ai_resolution (
 incident uuid primary key references public.desk on delete cascade, seq bigint not null references public.frontline_turn on delete cascade,
 reply_id uuid not null, rev int not null, locale text not null, pack text not null, manual text not null, policy text not null,
 delivered_at timestamptz not null, acknowledged_at timestamptz not null default clock_timestamp(),
 linked_until timestamptz not null, recontact_at timestamptz, next_incident uuid references public.desk on delete set null
);
create table if not exists ichido.frontline_qa (
 incident uuid primary key references public.desk on delete cascade, reason text not null,
 flagged_at timestamptz not null default clock_timestamp(), reviewed_at timestamptz, reviewer uuid
);
create table if not exists ichido.qa_stratum (
 locale text not null, pack text not null, n int not null, slot int not null, primary key(locale,pack)
);
alter table ichido.ai_resolution enable row level security;
alter table ichido.frontline_qa enable row level security;
alter table ichido.qa_stratum enable row level security;
revoke all on ichido.ai_resolution,ichido.frontline_qa,ichido.qa_stratum from public,anon,authenticated,service_role;

create or replace function ichido.flag_qa(i uuid,why text) returns void language sql security definer set search_path='' as $$
 insert into ichido.frontline_qa(incident,reason) values(i,why)
 on conflict(incident) do update set reason=excluded.reason,flagged_at=clock_timestamp(),reviewed_at=null,reviewer=null
$$;
create or replace function public.info_delivery(p_uid uuid,p_reply uuid,p_rev int,p_lang text,p_manual text) returns boolean
language plpgsql security definer set search_path='' as $$
declare d public.desk; t public.frontline_turn;
begin
 d:=ichido.caller_case(p_uid);
 select a.* into t from public.frontline_turn a join ichido.binding b on b.voice_room=a.generation and b.uid=p_uid
 join public.caller_card c on c.id=a.incident and c.reply_id=a.reply_id
 join public.reply r on r.id=c.reply_id and r.manual_version=p_manual
 where a.incident=d.id and a.speaker='ai' and a.reply_id=p_reply and a.rev=p_rev and d.confirmed_rev=p_rev
   and a.epoch=d.handler_epoch and d.handler='ai' and a.locale=p_lang and d.lang=p_lang;
 if not found then return false; end if;
 update ichido.turn_delivery set state='full',delivered_at=clock_timestamp() where seq=t.seq and mode='screen' and state='pending';
 return exists(select from ichido.turn_delivery where seq=t.seq and state='full')
   and exists(select from ichido.ops_setting where key='ai_closure' and value=1);
end $$;

create or replace function public.resolve_info(p_uid uuid,p_reply uuid,p_rev int,p_lang text,p_ack boolean,p_manual text) returns uuid
language plpgsql security definer set search_path='' as $$
declare d public.desk; t public.frontline_turn; b ichido.binding; delivered timestamptz; chosen boolean;
begin
 d:=ichido.caller_case(p_uid);
 if p_ack is not true or not exists(select from ichido.ops_setting where key='ai_closure' and value=1 for share)
   or d.handler<>'ai' or d.operator_id is not null or d.priority is not null or d.queued_at is not null
   or d.fraud_at is not null or d.clarifying or d.abandoned or d.mass_incident is not null
   or d.confirmed_rev is distinct from p_rev or d.lang is distinct from p_lang or d.fault<>'shelter_info'
   or exists(select from public.field_job where incident=d.id and not case_closed)
   or exists(select from public.promise where incident=d.id and settled_at is null)
   or exists(select from public.partner_work where incident=d.id)
   or exists(select from ichido.frontline_qa where incident=d.id and reason in ('safety_miss','dispute'))
   then perform ichido.fail('conflict'); end if;
 select * into strict b from ichido.binding where uid=p_uid and incident=d.id and expires>clock_timestamp();
 select a.* into t from public.frontline_turn a join public.reply r on r.id=a.reply_id and r.author='ai'
   join public.caller_card c on c.id=d.id and c.reply_id=r.id and c.confirmed_rev=p_rev
   join public.draft dr on dr.incident=d.id and dr.rev=p_rev and not dr.needs_clarification
   join ichido.reply_rule rule on rule.intent=r.intent and rule.pack='shelter' and rule.autonomous
   where a.incident=d.id and a.speaker='ai' and a.generation=b.voice_room and a.locale=b.lang and a.rev=p_rev and a.epoch=d.handler_epoch
     and r.id=p_reply and r.intent='SHELTER_INFO' and r.manual_version=p_manual and a.wording=r.intent
     and ichido.reply_ok(r.intent,d.fault,c.flags) and c.flags=array['need_news'] and c.confirmed_flags=c.flags
     and not c.needs_human and c.choice is null and c.teachback is null and c.bank_status is null
     and c.field_state='none' and c.notice is null for share of rule;
 select delivered_at into delivered from ichido.turn_delivery where seq=t.seq and state='full';
 if delivered is null then perform ichido.fail('conflict'); end if;

 update public.caller_card set status='guided' where id=d.id;
 update public.desk set status='guided',resolved_by='ai',guided_at=clock_timestamp(),finished_at=clock_timestamp() where id=d.id;
 insert into ichido.ai_resolution(incident,seq,reply_id,rev,locale,pack,manual,policy,delivered_at,linked_until)
 select d.id,t.seq,p_reply,p_rev,b.lang,'shelter',p_manual,t.policy_version,delivered,f.expires from ichido.follow_up f where f.incident=d.id and f.uid=p_uid;
 if not found then perform ichido.fail('conflict'); end if;
 chosen:=true;
 if exists(select from ichido.ops_setting where key='qa_sample' and value=1) then
   insert into ichido.qa_stratum as q(locale,pack,n,slot) values(b.lang,'shelter',1,floor(random()*10)::int)
   on conflict(locale,pack) do update set n=q.n+1,slot=case when q.n%10=0 then excluded.slot else q.slot end
   returning (n-1)%10=slot into chosen;
 end if;
 if chosen then perform ichido.flag_qa(d.id,'closure'); end if;
 perform ichido.event(d.id,'caller','ai_resolved',jsonb_build_object('reply',p_reply,'rev',p_rev,'turn',t.seq,'manual',p_manual,'policy',t.policy_version));
 perform ichido.set_light(d.station,d.id,'guided');
 delete from ichido.binding where uid=p_uid and incident=d.id;
 return b.voice_room;
end $$;

-- A busy station may already serve a different caller. Keep the request until a new, private incident can start.
create or replace function ichido.start_recontact(previous uuid) returns void language plpgsql security definer set search_path='' as $$
declare d public.desk; f ichido.follow_up; i uuid;
begin
 select * into f from ichido.follow_up where incident=previous and expires>clock_timestamp();
 if not found then return; end if;
 perform pg_advisory_xact_lock(1,hashtext(f.uid::text));
 select * into strict d from public.desk where id=previous for update;
 if not exists(select from ichido.ai_resolution where incident=d.id and recontact_at is not null and next_incident is null)
   or exists(select from ichido.binding where uid=f.uid and expires>now()) then return; end if;
 perform 1 from public.station where id=d.station for update;
 if exists(select from public.desk where station=d.station and finished_at is null) then return; end if;
 i:=public.record_fault(d.station,md5(gen_random_uuid()::text),'caller',d.fault);
 update public.desk set handler='queued',text_only=true,lang=d.lang where id=i;
 update public.caller_card set text_only=true,lang=d.lang where id=i;
 perform set_config('ichido.frontline_client','1',true);
 delete from ichido.binding where uid=f.uid and expires<=now();
 insert into ichido.binding(incident,uid,lang,expires) values(i,f.uid,d.lang,least(f.expires,now()+interval '2 hours'));
 perform ichido.queue_frontline(i,1,'human_request');
 update ichido.ai_resolution set next_incident=i where incident=d.id;
 perform ichido.event(i,'caller','follow_up_request',jsonb_build_object('previous',d.id));
end $$;
revoke all on function ichido.start_recontact(uuid) from public,anon,authenticated;
select cron.schedule('ichido-start-recontacts','* * * * *',
 'select ichido.start_recontact(incident) from ichido.ai_resolution where recontact_at is not null and next_incident is null and linked_until>now() order by recontact_at');

create or replace function public.recontact(p_uid uuid,p_receipt uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(1,hashtext(p_uid::text));
 if not exists(select from ichido.follow_up f join ichido.ai_resolution r using(incident)
   where f.uid=p_uid and f.incident=p_receipt and f.expires>clock_timestamp()) then perform ichido.fail('forbidden'); end if;
 update ichido.ai_resolution set recontact_at=clock_timestamp() where incident=p_receipt and recontact_at is null;
 if found then
   perform ichido.event(p_receipt,'caller','recontact','{}');
   perform ichido.flag_qa(p_receipt,'recontact');
 end if;
 perform ichido.start_recontact(p_receipt);
end $$;
create or replace function public.followup_rate(p_uid uuid,p_receipt uuid,p_rating int) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_rating is null or p_rating not between 1 and 3 then perform ichido.fail('bad_request'); end if;
 if not exists(select from ichido.follow_up where uid=p_uid and incident=p_receipt and expires>clock_timestamp())
 then perform ichido.fail('forbidden'); end if;
 update public.caller_card set rating=p_rating where id=p_receipt and status='guided' and rating is null;
 if not found then perform ichido.fail('conflict'); end if;
 perform ichido.event(p_receipt,'caller','rated',jsonb_build_object('rating',p_rating));
 if p_rating=1 and exists(select from ichido.ai_resolution where incident=p_receipt) then perform ichido.flag_qa(p_receipt,'dispute'); end if;
end $$;
revoke all on function ichido.flag_qa(uuid,text),public.resolve_info(uuid,uuid,int,text,boolean,text),public.recontact(uuid,uuid),
 public.info_delivery(uuid,uuid,int,text,text),public.followup_rate(uuid,uuid,int) from public,anon,authenticated;
grant execute on function public.resolve_info(uuid,uuid,int,text,boolean,text),public.recontact(uuid,uuid),
 public.info_delivery(uuid,uuid,int,text,text),public.followup_rate(uuid,uuid,int) to service_role;

create or replace function public.frontline_qa(p_uid uuid,p_session uuid,p_action text,p_incident uuid default null,p_flagged_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare role_name text;
begin
 select st.role::text into role_name from ichido.staff st join auth_ba."user" u on u.id=st.uid
   join auth_ba."session" s on s."userId"=u.id where u.id=p_uid and not u.banned and s.aal='aal2'
     and s.id=p_session and s."expiresAt">clock_timestamp();
 if p_action='safety_miss' then
   if role_name is null or role_name not in ('manager','operator') or not exists(select from public.frontline_turn where incident=p_incident)
     then perform ichido.fail('forbidden'); end if;
   perform 1 from public.desk where id=p_incident for update;
   perform ichido.flag_qa(p_incident,p_action);
   perform ichido.queue_frontline(p_incident,0,'suspected_risk');
   perform ichido.event(p_incident,'system','qa_safety_miss','{}');
   return '{}';
 end if;
 if role_name is distinct from 'manager' then perform ichido.fail('forbidden'); end if;
 if p_action='reviewed' then
   update ichido.frontline_qa set reviewed_at=clock_timestamp(),reviewer=p_uid where incident=p_incident and reviewed_at is null and flagged_at=p_flagged_at;
   if not found then perform ichido.fail('conflict'); end if;
   perform ichido.event(p_incident,'system','qa_reviewed','{}');
   return '{}';
 end if;
 if p_action<>'list' then perform ichido.fail('bad_request'); end if;
 -- Free text can contain identifying details in any language. Project only catalogue acts, verified slots and coded facts.
 return (select coalesce(jsonb_agg(to_jsonb(x) order by x.flagged_at),'[]') from (
   select q.incident,q.reason,q.flagged_at,d.fault,d.lang,
     (select jsonb_agg(jsonb_build_object('seq',t.seq,'speaker',t.speaker,'wording',t.wording,'locale',t.locale,
       'flag',t.facts->>'flag','rev',t.rev,'manual',r.manual_version,'delivery',v.state) order by t.seq)
      from public.frontline_turn t left join public.reply r on r.id=t.reply_id left join ichido.turn_delivery v using(seq)
      where t.incident=q.incident) as turns
   from ichido.frontline_qa q join public.desk d on d.id=q.incident where q.reviewed_at is null order by q.flagged_at limit 100
 ) x);
end $$;
revoke all on function public.frontline_qa(uuid,uuid,text,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.frontline_qa(uuid,uuid,text,uuid,timestamptz) to service_role;

create or replace function public.frontline_insights(p_days int) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not (ichido.has_role('manager') or ichido.has_role('operator')) then perform ichido.fail('forbidden'); end if;
 if p_days is null or p_days not in (0,7,14,30) then perform ichido.fail('bad_request'); end if;
 return (with cohort as (
   select d.*,r.acknowledged_at,r.recontact_at,r.linked_until,
     extract(epoch from (select min(sent_at) from public.reply where incident=d.id and author='human' and sent_at>=d.queued_at)-d.queued_at) as contact_s
   from public.desk d left join ichido.ai_resolution r on r.incident=d.id cross join ichido.report_bounds(p_days) w
   where d.created_at>=w.start_at and d.created_at<w.end_at and exists
     (select from public.frontline_turn t where t.incident=d.id and t.wording='greeting' and t.speaker='ai')
 ), mature as (select * from cohort where acknowledged_at<=now()-interval '24 hours')
 select jsonb_build_object('started',count(*),'resolved',count(acknowledged_at),'open',count(*) filter(where finished_at is null),
   'abandoned',count(*) filter(where abandoned),'contact_p50',percentile_cont(0.5) within group(order by contact_s),
   'contact_p95',percentile_cont(0.95) within group(order by contact_s),'contact_n',count(contact_s),
   'escalations',(select coalesce(jsonb_object_agg(reason,n),'{}') from
     (select transfer_reason as reason,count(*) n from cohort where transfer_reason is not null group by transfer_reason) e),
   'mature',(select count(*) from mature),'covered',(select count(*) from mature where linked_until>=acknowledged_at+interval '24 hours'),
   'recontact',(select count(*) from mature where linked_until>=acknowledged_at+interval '24 hours' and recontact_at<=acknowledged_at+interval '24 hours'))
 from cohort);
end $$;
revoke all on function public.frontline_insights(int) from public,anon,authenticated;
grant execute on function public.frontline_insights(int) to authenticated;
create or replace function public.shift_insights(p_days int) returns jsonb language sql stable security invoker set search_path='' as $$
 select public.insights(p_days) || jsonb_build_object('ratings',public.insights_ratings(p_days),'bot',public.insights_bot(p_days),
   'ops',public.insights_ops(p_days),'packs',public.insights_packs(p_days),'frontline',public.frontline_insights(p_days))
$$;

-- Erasure is the only permitted edit to a submitted turn. The sequence and coded audit survive.
create or replace trigger frontline_immutable before update on public.frontline_turn for each row
 when (old.words is null or new.words is not null or (to_jsonb(old)-'words')<>(to_jsonb(new)-'words'))
 execute function ichido.case_event_append_only();
create or replace trigger frontline_immutable_delete before delete on public.frontline_turn for each row execute function ichido.case_event_append_only();

create or replace function ichido.translation_current() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select from public.frontline_turn where seq=new.seq and words is not null and at>now()-interval '7 days' for share)
 then return null; end if;
 return new;
end $$;
create or replace trigger translation_current before insert or update on public.frontline_translation for each row execute function ichido.translation_current();

create or replace function ichido.purge_frontline_words() returns void language plpgsql security definer set search_path='' as $$
declare cutoff timestamptz:=now()-interval '7 days'; i uuid;
begin
 for i in select d.id from public.desk d where exists(select from public.frontline_turn t where t.incident=d.id and t.at<=cutoff)
 order by d.id for update skip locked loop
   update public.draft dr set words=null where dr.incident=i and dr.words is not null and not exists
     (select from public.frontline_turn t where t.incident=i and t.words=dr.words and t.at>cutoff);
   update public.desk d set caller_words=null,caller_words_ja=null where id=i and (caller_words is not null or caller_words_ja is not null)
     and not exists(select from public.frontline_turn t where t.incident=i and t.words=d.caller_words and t.at>cutoff);
   update public.caller_card set teachback=null,teachback_ja=null where id=i and (teachback is not null or teachback_ja is not null)
     and not exists(select from public.case_event where incident=i and kind='teachback' and at>cutoff);
   update public.desk set ai_summary=null where id=i and ai_summary is not null and ai_summary_at<=cutoff;
   update public.case_record set summary=null where incident=i and at<=cutoff and summary is not null;
   update public.review_state set note=null where incident=i and reviewed_at<=cutoff and note is not null;
   update public.frontline_turn set words=null where incident=i and words is not null and at<=cutoff;
   delete from public.frontline_translation j using public.frontline_turn t where t.incident=i and j.seq=t.seq and t.at<=cutoff;
 end loop;
end $$;
revoke all on function ichido.translation_current(),ichido.purge_frontline_words() from public,anon,authenticated;
select cron.schedule('ichido-purge-frontline-words','17 * * * *','select ichido.purge_frontline_words()');
create or replace function public.caller_screen(p_uid uuid) returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('card',to_jsonb(c),'draft',to_jsonb(dr),'station',jsonb_build_object('label',s.label,'branch',s.branch,'hours',s.counter_hours,
    'contact',case when s.contact_verified_at<=now() then s.public_contact_url end),
    'generation',b.voice_room,'reply',(select to_jsonb(r)-'operator_id' from public.reply r where r.id=c.reply_id),
    'turns',coalesce((select jsonb_agg(jsonb_build_object('seq',t.seq,'rev',t.rev,'speaker',t.speaker,'words',t.words,'wording',t.wording,'locale',t.locale,'facts',case when t.speaker='ai' then t.facts end) order by t.seq)
      from public.frontline_turn t where t.incident=c.id and t.generation=b.voice_room),'[]'::jsonb))
    from ichido.binding b join public.caller_card c on c.id=b.incident join public.draft dr on dr.incident=c.id
    join public.station s on s.id=c.station where b.uid=p_uid and b.expires>now()
$$;

commit;
