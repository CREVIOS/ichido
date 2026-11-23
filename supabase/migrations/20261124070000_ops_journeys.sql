create or replace function ichido.group_mass() returns trigger
language plpgsql security definer set search_path = '' as $$
declare m uuid; need int; win int;
begin
  if not exists (select from public.desk where id = new.incident and station in (select id from public.station where ichido.pack_of(kind) = 'atm')) then return null; end if;
  perform pg_advisory_xact_lock(hashtext('ichido.mass_incident'));
  select d.mass_incident into m from public.desk d
    where d.station in (select id from public.station where ichido.pack_of(kind) = 'atm') and d.finished_at is null and d.mass_incident is not null and d.id <> new.incident limit 1;
  if m is not null then
    update public.desk set mass_incident = m where id = new.incident and mass_incident is null;
    if found then perform ichido.event(new.incident, 'system', 'mass_grouped', '{}'); end if;
    return null;
  end if;
  select value into need from ichido.ops_setting where key = 'mass_stations';
  select value into win from ichido.ops_setting where key = 'mass_window_s';
  if (select count(distinct station) from public.desk
      where station in (select id from public.station where ichido.pack_of(kind) = 'atm') and finished_at is null and created_at > now() - make_interval(secs => win)) < need then
    return null;
  end if;
  insert into public.mass_incident default values returning id into m;
  with grouped as (
    update public.desk set mass_incident = m
      where station in (select id from public.station where ichido.pack_of(kind) = 'atm') and finished_at is null and created_at > now() - make_interval(secs => win) returning id
  )
  insert into public.case_event (incident, actor, kind, data) select id, 'system', 'mass_grouped', '{}' from grouped;
  return null;
end $$;

create or replace function ichido.mass_recipients(p_mass uuid)
returns table (incident uuid, kind text) language sql stable security definer set search_path = '' as $$
  select d.id, s.kind from public.desk d join public.station s on s.id=d.station
    join public.caller_card c on c.id=d.id
    where d.mass_incident=p_mass and d.finished_at is null and d.fraud_at is null and not c.fraud
      and ichido.pack_of(s.kind)='atm' and exists
      (select from ichido.binding b where b.incident=d.id and b.expires>now())
$$;
create or replace function public.mass_preview(p_mass uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('eligible',count(*),'kinds',coalesce(jsonb_agg(distinct kind),'[]'::jsonb))
  from ichido.mass_recipients(p_mass) where ichido.has_role('operator')
$$;
revoke all on function ichido.mass_recipients(uuid), public.mass_preview(uuid) from public, anon, authenticated;
grant execute on function public.mass_preview(uuid) to authenticated;


create or replace function public.cmd_broadcast(p_uid uuid, p_name text, p_mass uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare m public.mass_incident; n int;
begin
  if not exists (select 1 from ichido.staff where uid = p_uid and role = 'operator') then perform ichido.fail('forbidden'); end if;
  select * into m from public.mass_incident where id = p_mass for update;
  if not found then perform ichido.fail('not_found'); end if;
  if m.broadcast_at is not null then perform ichido.fail('conflict'); end if;
  perform 1 from public.desk where mass_incident = p_mass and finished_at is null order by id for update;
  if not found then perform ichido.fail('conflict'); end if;
  with sent as (
    update public.caller_card c set notice = 'mass_leave', notice_at = now()
      from ichido.mass_recipients(p_mass) r where c.id=r.incident
      returning c.id
  ), logged as (
    insert into public.case_event (incident, actor, kind, data, actor_name)
      select id, 'operator', 'broadcast', '{}', p_name from sent returning 1
  )
  select count(*) into n from logged;
  update public.mass_incident set broadcast_at = now(), broadcast_by = p_name, recipients = n where id = p_mass;
  return n;
end $$;

create or replace function public.cmd_disaster(p_uid uuid, p_name text, p_stations text[], p_notice text) returns text[]
language plpgsql security definer set search_path = '' as $$
declare s public.station; changed text[] := '{}'; i uuid;
begin
  if not exists (select 1 from ichido.staff where uid = p_uid and role in ('operator', 'manager', 'admin')) then perform ichido.fail('forbidden'); end if;
  if coalesce(cardinality(p_stations), 0) = 0 or cardinality(p_stations) > 500 then perform ichido.fail('bad_request'); end if;
  if (select count(*) from public.station where id = any (p_stations)) <> (select count(distinct x) from unnest(p_stations) x) then
    perform ichido.fail('not_found');
  end if;
  for s in select * from public.station where id = any (p_stations) order by id for update loop
    if p_notice is not null and ichido.pack_of(s.kind) <> 'atm' then perform ichido.fail('bad_request'); end if;
    continue when s.disaster is not distinct from p_notice;
    update public.station set disaster = p_notice, disaster_since = case when p_notice is null then null else now() end where id = s.id;
    insert into public.disaster_event (station, kind, notice, actor_name)
      values (s.id, case when p_notice is null then 'left' else 'entered' end, coalesce(p_notice, s.disaster), p_name);
    select id into i from public.desk where station = s.id and finished_at is null;
    if i is not null then
      perform ichido.event(i, 'operator', case when p_notice is null then 'disaster_left' else 'disaster_entered' end,
                           jsonb_build_object('notice', coalesce(p_notice, s.disaster)), p_name);
    end if;
    changed := changed || s.id;
  end loop;
  return changed;
end $$;

alter table public.caller_card drop constraint if exists caller_card_notice_check, add constraint caller_card_notice_check check (notice in ('mass_leave','still_working','guidance_changed'));

create or replace function ichido.withdraw_unfit_reply(p_incident uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.caller_card; i text; f text; released boolean;
begin
  select * into c from public.caller_card where id = p_incident for update;
  select intent into i from public.reply where id = c.reply_id;
  select fault, remote_release is not distinct from 'released' into f, released from public.desk where id = p_incident;
  if i is null or (ichido.reply_ok(i, f, c.flags) and not (released and i = 'HELD_WAIT_OR_LEAVE')) then return; end if;
  update public.caller_card set notice = 'guidance_changed', notice_at = now(), reply_id = null, choice = null, teachback = null, teachback_ja = null,
         teachback_reply = null, teachback_result = null where id = p_incident;
  perform ichido.event(p_incident, 'system', 'reply_withdrawn', jsonb_build_object('intent', i));
end $$;

create or replace function public.cmd_remote_release(p_uid uuid, p_name text, p_incident uuid, p_result text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select from ichido.owned_case(p_uid, p_incident) d join public.station s on s.id=d.station
    where ichido.pack_of(s.kind)='atm' and d.remote_release is distinct from 'released') then perform ichido.fail('conflict'); end if;
  if p_result not in ('failed', 'released') then perform ichido.fail('bad_request'); end if;
  update public.desk set remote_release = p_result where id = p_incident;
  if p_result='released' then perform ichido.withdraw_unfit_reply(p_incident); end if;
  perform ichido.event(p_incident, 'operator', 'remote_release', jsonb_build_object('result', p_result), p_name);
end $$;

create or replace function public.cmd_send(p_uid uuid, p_name text, p_incident uuid, p_intent text, p_manual text, p_needs_held boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare d public.desk; st public.station; r uuid;
begin
  d := ichido.owned_case(p_uid, p_incident);
  if d.confirmed_rev is null or d.clarifying then perform ichido.fail('conflict'); end if;
  if p_needs_held and (d.card_back <> 'no' or d.remote_release = 'released') then perform ichido.fail('conflict'); end if;
  select * into st from public.station where id = d.station;
  insert into public.reply (incident, intent, slots, manual_version, operator_id)
    values (d.id, p_intent, jsonb_build_object('branch', st.branch, 'hours', st.counter_hours), p_manual, p_uid)
    returning id into r;
  -- New guidance supersedes any earlier choice and teach-back.
  update public.caller_card set notice = case when notice <> 'guidance_changed' then notice end, reply_id = r, choice = null, teachback = null, teachback_ja = null, teachback_reply = null, teachback_result = null
    where id = d.id;
  perform ichido.event(d.id, 'operator', 'reply', jsonb_build_object('intent', p_intent), p_name);
  return r;
end $$;

create or replace function public.cmd_fraud(p_uid uuid, p_name text, p_incident uuid, p_assignee uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.desk;
begin
  d := ichido.owned_case(p_uid, p_incident);
  if not exists (select from public.station where id=d.station and ichido.pack_of(kind)='atm') then perform ichido.fail('bad_request'); end if;
  if d.fraud_at is not null then perform ichido.fail('conflict'); end if;
  update public.desk set fraud_at = now() where id = d.id;
  update public.caller_card set fraud = true, notice = null, notice_at = null where id = d.id;
  perform ichido.event(d.id, 'operator', 'fraud',
    jsonb_build_object('company', (select security_company from public.station where id = d.station)), p_name);
  if p_assignee is not null then perform public.cmd_assign(p_uid, p_name, d.id, p_assignee); end if;   -- a no-op when this guard already has the job
  perform ichido.set_light(d.station, d.id, 'fraud');
end $$;

create or replace function public.cmd_fraud_safe(p_uid uuid, p_name text, p_incident uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.desk;
begin
  d := ichido.owned_case(p_uid,p_incident);
  if d.fraud_at is null then perform ichido.fail('conflict'); end if;
  update public.desk set fraud_at=null where id=d.id;
  update public.caller_card set fraud=false where id=d.id;
  perform ichido.set_light(d.station,d.id,d.status);
  perform ichido.event(d.id,'operator','fraud_safe','{}',p_name);
end $$;
revoke all on function public.cmd_fraud_safe(uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.cmd_fraud_safe(uuid,text,uuid) to service_role;

