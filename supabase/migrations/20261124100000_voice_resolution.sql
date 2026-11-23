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
  update ichido.binding set voice_session=coalesce(voice_session,gen_random_uuid())
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
  if p_seq is null or p_seq is distinct from t.seq then perform ichido.fail('conflict'); end if;
  if p_action='play' and v.state='pending' then
    update ichido.turn_delivery set mode='voice',state='playing' where seq=t.seq;
  elsif p_action in ('partial','full') and v.state='playing' then
    update ichido.turn_delivery set state=p_action,delivered_at=case when p_action='full' then clock_timestamp() end where seq=t.seq;
  else perform ichido.fail('conflict'); end if;
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
commit;
