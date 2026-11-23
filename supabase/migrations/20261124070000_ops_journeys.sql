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
  perform 1 from public.station where id in (select station from public.desk where mass_incident=p_mass)
    order by id for share;
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
  if i is null or (ichido.reply_ok(i, f, c.flags) and ichido.work_fits(p_incident,i) and not (released and i = 'HELD_WAIT_OR_LEAVE')) then return; end if;
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
  if (p_needs_held or p_intent='HELD_WAIT_OR_LEAVE') and (d.card_back <> 'no' or d.remote_release = 'released') then perform ichido.fail('conflict'); end if;
  select * into st from public.station where id = d.station;
  insert into public.reply (incident, intent, slots, manual_version, operator_id)
    values (d.id, p_intent, jsonb_build_object('branch', st.branch, 'hours', st.counter_hours) || case when p_intent='TRANSIT_LEAVE'
      then jsonb_build_object('reference',(select railway_ref from public.partner_work where incident=d.id and recipient='railway')) else '{}'::jsonb end, p_manual, p_uid)
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
  -- The legacy assignee argument is retained for rolling upgrades. Dispatch has its own command.
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
  perform ichido.set_light(d.station,d.id,d.status::text);
  perform ichido.event(d.id,'operator','fraud_safe','{}',p_name);
end $$;
revoke all on function public.cmd_fraud_safe(uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.cmd_fraud_safe(uuid,text,uuid) to service_role;


-- Coverage is explicitly set by the shift lead. Existing accounts have no coverage until assigned.
alter table ichido.staff add column if not exists duty_station text references public.station(id),
  add column if not exists duty_function text check (duty_function in ('atm','hospital','city_office','transit','shelter')),
  add column if not exists available boolean not null default true;
alter table public.field_job add column if not exists acknowledged_at timestamptz,
  add column if not exists accepted_at timestamptz, add column if not exists declined_at timestamptz, add column if not exists help_at timestamptz,
  add column if not exists provider_at timestamptz;
update public.field_job set accepted_at=updated_at,acknowledged_at=coalesce(acknowledged_at,updated_at)
  where state in ('on_way','arrived','done') and accepted_at is null;
update ichido.staff s set duty_station='TABLE-A', duty_function='atm' from auth_ba."user" u
  where s.uid=u.id and u.email in ('guard1@ichido.demo','guard2@ichido.demo') and s.duty_station is null
    and exists (select from public.station where id='TABLE-A');

create or replace function public.available_responders(p_incident uuid) returns table(uid uuid,display_name text)
language sql stable security definer set search_path='' as $$
  select s.uid,s.display_name from public.desk d join public.station st on st.id=d.station
    join ichido.staff s on s.duty_station=d.station and s.duty_function=ichido.pack_of(st.kind)
    join auth_ba."user" u on u.id=s.uid
    where d.id=p_incident and s.available and not u.banned and s.role='field'
      and (auth.role()='service_role' or ichido.has_role('operator'))
      and not exists (select from public.field_job j where j.assignee=s.uid and j.incident<>d.id
        and not j.case_closed and j.state<>'done' and j.declined_at is null)
$$;
revoke all on function public.available_responders(uuid) from public,anon,authenticated;
grant execute on function public.available_responders(uuid) to authenticated,service_role;

create or replace function public.cmd_assign(p_uid uuid, p_name text, p_incident uuid, p_assignee uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.desk; guard text; prev public.field_job; company text;
begin
  select * into d from public.desk where id=p_incident for update;
  if d.finished_at is null then d:=ichido.owned_case(p_uid,p_incident);
  elsif d.operator_id is distinct from p_uid or d.abandoned or not exists(select from ichido.staff where uid=p_uid and role='operator')
    or not exists(select from public.field_job where incident=d.id and state<>'done' and not case_closed)
    then perform ichido.fail('forbidden'); end if;
  perform 1 from ichido.staff where uid=p_assignee for update;
  select display_name into guard from public.available_responders(p_incident) where uid=p_assignee;
  if guard is null then perform ichido.fail('bad_request'); end if;
  select * into prev from public.field_job where incident = d.id for update;
  if found and prev.assignee = p_assignee and not prev.case_closed and prev.declined_at is null then return; end if;
  select security_company into company from public.station where id = d.station;
  insert into public.field_job (incident, station, fault, assignee, generation, state, eta, case_closed, updated_at)
    values (d.id, d.station, d.fault, p_assignee, coalesce(prev.generation, 0) + 1, 'requested', null, false, now())
    on conflict (incident) do update set assignee = excluded.assignee, generation = excluded.generation,
      state = 'requested', accepted_at=null, acknowledged_at=null, declined_at=null, provider_at=null, help_at=null, reestimate_gen=null, assigned_at=now(), fault=excluded.fault, eta = null, case_closed = false, updated_at = now();
  update public.desk set status = 'field' where id = d.id and finished_at is null;
  update public.caller_card set status = case when d.finished_at is null then 'field'::public.case_status else d.status end, field_state = 'requested', eta = null where id = d.id;
  if d.finished_at is null then perform ichido.set_light(d.station, d.id, 'field'); end if;
  perform ichido.event(d.id, 'operator', case when prev.incident is null then 'dispatch' else 'redispatch' end,
                       jsonb_build_object('assignee', guard, 'company', company), p_name);
end $$;

create or replace function public.cmd_field(p_uid uuid, p_name text, p_incident uuid, p_generation int, p_state text, p_eta text)
returns void language plpgsql security definer set search_path = '' as $$
declare finished boolean; job public.field_job;
begin

  select d.finished_at is not null into finished from public.desk d
    join public.field_job j on j.incident = d.id join ichido.staff s on s.uid = j.assignee
    where d.id = p_incident and s.uid = p_uid and s.role = 'field' and j.generation = p_generation and not j.case_closed
    for update of d;
  if not found then perform ichido.fail('forbidden'); end if;
  select * into strict job from public.field_job where incident=p_incident for update;
  if job.declined_at is not null then perform ichido.fail('conflict'); end if;
  if p_state in ('accept','decline','help') then
    if p_state<>'help' and job.state<>'requested' then perform ichido.fail('conflict'); end if;
    update public.field_job set acknowledged_at=coalesce(acknowledged_at,now()),
      accepted_at=case when p_state='accept' then coalesce(accepted_at,now()) else accepted_at end,
      declined_at=case when p_state='decline' then now() end,
      help_at=case when p_state='help' then now() else help_at end where incident=p_incident;
    if p_state='decline' then update public.caller_card set field_state='none',eta=null where id=p_incident; end if;
    perform ichido.event(p_incident,'field','field_' || p_state,jsonb_build_object('generation',p_generation),p_name);
    return;
  end if;
  if p_state like 'correct_%' then
    p_state:=substr(p_state,9);
  elsif not ((p_state='on_way' and job.state in ('requested','on_way')) or
             (p_state='arrived' and job.state='on_way') or (p_state='done' and job.state='arrived')) then
    perform ichido.fail('conflict');
  end if;
  if p_state is null or p_state not in ('on_way','arrived','done') then perform ichido.fail('bad_request'); end if;
  update public.field_job set acknowledged_at=coalesce(acknowledged_at,now()), accepted_at=coalesce(accepted_at,now()), state = p_state, eta = case when p_state = 'on_way' then p_eta end, updated_at = now(),
         case_closed = p_state = 'done' and finished
    where incident = p_incident and assignee = p_uid and generation = p_generation and not case_closed;
  if not found then perform ichido.fail('forbidden'); end if;
  update public.caller_card set field_state = p_state, eta = case when p_state = 'on_way' then p_eta end where id = p_incident;
  perform ichido.event(p_incident, 'field', 'field',
    jsonb_strip_nulls(jsonb_build_object('state', p_state, 'eta', case when p_state = 'on_way' then p_eta end)), p_name);
end $$;

alter table ichido.alert_outbox add column if not exists lease uuid,
  add column if not exists available_at timestamptz not null default now(),
  add column if not exists attempts int not null default 0,
  add column if not exists delivered uuid[] not null default '{}',
  add column if not exists generation int;
-- A pending assignment stays deliverable until the worker responds or its generation ends.
create or replace function ichido.expire_alerts() returns void
language sql security definer set search_path = '' as $$
  delete from ichido.alert_outbox o where o.at < now() - interval '1 hour'
    and not exists (select from public.field_job j where o.kind='field_job' and j.incident=o.incident
      and j.assignee=o.target and j.generation=o.generation and not j.case_closed and j.acknowledged_at is null);
$$;

create or replace function public.alert_take(p_limit int) returns setof ichido.alert_outbox
language sql security definer set search_path='' as $$
  update ichido.alert_outbox set lease=gen_random_uuid(), attempts=attempts+1, available_at=now()+interval '2 minutes'
    where id in (select id from ichido.alert_outbox where available_at<=now() order by id
      for update skip locked limit greatest(1, least(p_limit,200))) returning *
$$;
create or replace function ichido.alert_field_job() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' or new.generation<>old.generation or new.assignee<>old.assignee then
    insert into ichido.alert_outbox(kind,incident,station,target,generation)
      values ('field_job',new.incident,new.station,new.assignee,new.generation);
  end if;
  return null;
end $$;
create or replace function public.alert_settle(p_id bigint,p_lease uuid,p_accepted uuid[],p_retry boolean) returns void
language plpgsql security definer set search_path='' as $$
declare o ichido.alert_outbox;
begin
  select * into o from ichido.alert_outbox where id=p_id and lease=p_lease for update;
  if not found then return; end if;
  if o.kind='field_job' and cardinality(p_accepted)>0 then
    update public.field_job set provider_at=coalesce(provider_at,now())
      where incident=o.incident and assignee=o.target and generation=o.generation;
  end if;
  if p_retry then
    update ichido.alert_outbox set lease=null, delivered=delivered || p_accepted,
      available_at=now()+make_interval(secs=>least(300,5*(2^least(attempts,6))::int)) where id=o.id;
  else delete from ichido.alert_outbox where id=o.id; end if;
end $$;
revoke all on function public.alert_settle(bigint,uuid,uuid[],boolean) from public, anon, authenticated;
grant execute on function public.alert_settle(bigint,uuid,uuid[],boolean) to service_role;

drop trigger if exists live_update on ichido.staff;
create trigger live_update after update on ichido.staff referencing new table as new_rows for each statement execute function ichido.live_send();
drop policy if exists live_roster_read on realtime.messages;
create policy live_roster_read on realtime.messages for select to authenticated
  using (extension='broadcast' and realtime.topic()='live:staff' and ichido.has_role('operator'));

create table if not exists public.partner_work (
  incident uuid not null references public.desk on delete cascade,
  recipient text not null, owner_id uuid not null references ichido.staff,
  due_at timestamptz not null, requested_at timestamptz, accepted_at timestamptz, railway_ref text,
  primary key(incident,recipient)
);
insert into public.partner_work(incident,recipient,owner_id,due_at)
  select distinct on (h.incident,h.recipient) h.incident,h.recipient,d.operator_id,h.expires_at
    from ichido.handoff h join public.desk d on d.id=h.incident
    where h.revoked_at is null and h.expires_at>now() and d.operator_id is not null and not d.abandoned
    order by h.incident,h.recipient,h.created_at
  on conflict do nothing;
alter table public.partner_work enable row level security;
revoke all on public.partner_work from public,anon,authenticated;
grant select on public.partner_work to authenticated;
grant all on public.partner_work to service_role;
drop policy if exists partner_ops on public.partner_work;
create policy partner_ops on public.partner_work for select to authenticated using (ichido.has_role('operator'));
drop trigger if exists live_update on public.partner_work;
create trigger live_update after update on public.partner_work referencing new table as new_rows for each statement execute function ichido.live_send();
drop trigger if exists live_insert on public.partner_work;
create trigger live_insert after insert on public.partner_work referencing new table as new_rows for each statement execute function ichido.live_send();
drop policy if exists live_partner on realtime.messages;
create policy live_partner on realtime.messages for select to authenticated using
  (extension='broadcast' and realtime.topic()='live:partner_work' and ichido.has_role('operator'));

create or replace function public.prepare_handoff(p_uid uuid,p_incident uuid,p_hash text,p_recipient text,p_due timestamptz)
returns table(id uuid, expires_at timestamptz) language plpgsql security definer set search_path='' as $$
begin
  if p_due is null or p_due<=now() or p_due>now()+interval '30 days' then perform ichido.fail('bad_request'); end if;
  return query select h.id,h.expires_at from public.create_handoff(p_uid,p_incident,p_hash,p_recipient) h;
  insert into public.partner_work(incident,recipient,owner_id,due_at)
    select d.id,p_recipient,coalesce(d.operator_id,p_uid),p_due from public.desk d where d.id=p_incident
    on conflict(incident,recipient) do nothing;
end $$;
create or replace function public.partner_progress(p_uid uuid,p_name text,p_incident uuid,p_recipient text,p_action text,p_ref text)
returns void language plpgsql security definer set search_path='' as $$
declare w public.partner_work;
begin
  perform 1 from public.desk where id=p_incident for update;
  select * into w from public.partner_work where incident=p_incident and recipient=p_recipient for update;
  if not found or w.owner_id<>p_uid or not exists(select from ichido.staff where uid=p_uid and role='operator') then perform ichido.fail('forbidden'); end if;
  if p_action='request' and w.requested_at is null then
    update public.partner_work set requested_at=now() where incident=w.incident and recipient=w.recipient;
  elsif p_action='accept' and w.requested_at is not null and w.accepted_at is null then
    if p_recipient='railway' and (p_ref is null or p_ref !~ '^[A-Z0-9][A-Z0-9-]{1,31}$') then perform ichido.fail('bad_request'); end if;
    update public.partner_work set accepted_at=now(), railway_ref=case when p_recipient='railway' then p_ref end
      where incident=w.incident and recipient=w.recipient;
  else perform ichido.fail('conflict'); end if;
  perform ichido.event(p_incident,'operator','partner_' || p_action,jsonb_build_object('recipient',p_recipient),p_name);
end $$;
revoke all on function public.prepare_handoff(uuid,uuid,text,text,timestamptz),public.partner_progress(uuid,text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.prepare_handoff(uuid,uuid,text,text,timestamptz),public.partner_progress(uuid,text,uuid,text,text,text) to service_role;

alter table public.caller_card add column if not exists confirmed_flags text[] not null default '{}';
create or replace function ichido.snapshot_flags() returns trigger language plpgsql set search_path='' as $$
begin
  new.confirmed_flags:=case when new.confirmed_rev is null then '{}'::text[] else new.flags end;
  return new;
end $$;
create or replace trigger snapshot_flags before update of confirmed_rev on public.caller_card for each row execute function ichido.snapshot_flags();

insert into ichido.reply_rule(intent,pack,faults,needs_flags) values ('TRANSIT_LEAVE','transit','{transit_lost_item}','{leave_soon}') on conflict do nothing;

create or replace function ichido.work_fits(i uuid,intent text) returns boolean language sql stable security definer set search_path='' as $$
 select case
 when intent in ('HOSP_STAFF_COMING','CITY_STAFF_COMING','SHELTER_STAFF_COMING','TRANSIT_ACCESS')
   then exists(select from public.field_job where incident=i and state='on_way' and declined_at is null and not case_closed)
 when intent in ('SHELTER_NEEDS','SHELTER_FAMILY')
   then exists(select from public.field_job where incident=i and accepted_at is not null and declined_at is null and not case_closed)
 when intent in ('HOSP_INTERPRETER','CITY_APPOINTMENT')
   then exists(select from public.partner_work where incident=i and recipient=case intent when 'HOSP_INTERPRETER' then 'medical_interpreter' else 'consult_desk' end and requested_at is not null)
 when intent='TRANSIT_LEAVE' then exists(select from public.partner_work where incident=i and recipient='railway' and accepted_at is not null and railway_ref is not null)
 else true end
$$;
revoke all on function ichido.work_fits(uuid,text) from public,anon,authenticated;
create or replace function ichido.reply_allowed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare f text; fl text[];
begin
  select d.fault, c.flags into f, fl from public.desk d left join public.caller_card c on c.id = d.id where d.id = new.incident;
  if not ichido.work_fits(new.incident,new.intent) or not ichido.reply_ok(new.intent, f, fl) then perform ichido.fail('conflict'); end if;
  return new;
end $$;

create or replace function ichido.check_field_reply() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.generation<>new.generation or old.state<>new.state or old.declined_at is distinct from new.declined_at then
    perform ichido.withdraw_unfit_reply(new.incident);
  end if;
  return null;
end $$;
create or replace trigger check_field_reply after update on public.field_job for each row execute function ichido.check_field_reply();

create or replace function public.blocked_work_replies(p_incident uuid) returns text[]
language sql stable security definer set search_path='' as $$
  select coalesce(array_agg(r.intent),'{}') from ichido.reply_rule r where
    (auth.role()='service_role' or ichido.has_role('operator')) and not ichido.work_fits(p_incident,r.intent)
$$;
revoke all on function public.blocked_work_replies(uuid) from public,anon,authenticated;
grant execute on function public.blocked_work_replies(uuid) to authenticated,service_role;

-- p_days=0 selects the last completed Monday-Sunday cohort in Tokyo. Outcomes are as of the query time.
create or replace function ichido.report_bounds(p_days int) returns table(start_at timestamptz,end_at timestamptz)
language sql stable set search_path='' as $$
  with t as (select now() at time zone 'Asia/Tokyo' as local_now)
  select (case when p_days=0 then date_trunc('week',local_now)-interval '7 days' else date_trunc('day',local_now)-make_interval(days=>p_days-1) end) at time zone 'Asia/Tokyo',
         (case when p_days=0 then date_trunc('week',local_now) else date_trunc('day',local_now)+interval '1 day' end) at time zone 'Asia/Tokyo' from t
$$;
revoke all on function ichido.report_bounds(int) from public,anon,authenticated;

create or replace function public.insights(p_days int default 14)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  tz constant text := 'Asia/Tokyo';
  since timestamptz; until_at timestamptz;
begin
  if not (ichido.has_role('operator') or ichido.has_role('manager')) then perform ichido.fail('forbidden'); end if;
  if p_days is null or p_days not in (0, 7, 14, 30) then perform ichido.fail('bad_request'); end if;
  select start_at,end_at into since,until_at from ichido.report_bounds(p_days);
  return (
    with c as (
      select d.*,
        (select min(e.at) from public.case_event e where e.incident=d.id and e.kind='claimed') as claim_at,
        exists (select 1 from public.case_event e where e.incident = d.id and e.kind = 'claimed') as claimed,
        exists (select 1 from public.reply r where r.incident = d.id) as replied,
        exists (select 1 from public.field_job f where f.incident = d.id) as dispatched
      from public.desk d where d.created_at >= since and d.created_at < until_at
    )
    select jsonb_build_object(
      'since', since, 'until',until_at, 'as_of',now(), 'period',p_days,
      'unanswered',count(*) filter(where not replied),
      'rated',(select count(*) from public.caller_card cc join c on c.id=cc.id where cc.rating is not null),
      'rating_eligible',count(*) filter(where status='guided' and not abandoned),
      'field_done',(select count(*) from public.field_job j join c on c.id=j.incident where j.state='done'),
      'partner_accepted',(select count(distinct w.incident) from public.partner_work w join c on c.id=w.incident where w.accepted_at is not null),
      'target',(select seconds from ichido.sla_target where reason='no_reply'),
      'funnel', jsonb_build_object(
        'received', count(*),
        'claimed', count(*) filter (where claimed),
        'confirmed', count(*) filter (where claimed and confirmed_rev is not null),
        'replied', count(*) filter (where claimed and confirmed_rev is not null and replied),
        'guided', count(*) filter (where claimed and confirmed_rev is not null and replied and status = 'guided')),
      'dispatched', count(*) filter (where dispatched),
      'abandoned', count(*) filter (where abandoned),
      'per_day', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'day', g::date,
          'n', (select count(*) from c where (c.created_at at time zone tz)::date = g::date),
          'guided', (select count(*) from c where (c.created_at at time zone tz)::date = g::date and c.status = 'guided'),
          'first_reply_s', (select percentile_cont(0.5) within group (order by extract(epoch from r.first - c.claim_at))
             from c join (select incident, min(sent_at) as first from public.reply group by incident) r on r.incident = c.id
             where (c.created_at at time zone tz)::date = g::date)
        ) order by g), '[]')
        from generate_series((since at time zone tz)::date, (until_at at time zone tz)::date - 1, interval '1 day') g),
      'per_hour', (
        select jsonb_agg(jsonb_build_object('hour', h, 'n',
          (select count(*) from c where extract(hour from c.created_at at time zone tz) = h)) order by h)
        from generate_series(0, 23) h),
      'languages', (
        select coalesce(jsonb_object_agg(lang, n), '{}')
        from (select coalesce(lang, 'none') as lang, count(*) as n from c group by 1) x),
      'median_first_reply_s', (
        select percentile_cont(0.5) within group (order by extract(epoch from r.first - c.claim_at))
        from c join (select incident, min(sent_at) as first from public.reply group by incident) r on r.incident = c.id),
      'choices', (
        select coalesce(jsonb_object_agg(choice, n), '{}')
        from (select cc.choice, count(*) as n from public.caller_card cc join c on c.id = cc.id
              where cc.choice is not null group by 1) x)
    ) from c
  );
end $$;

create or replace function public.insights_ratings(p_days int default 14)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  tz constant text := 'Asia/Tokyo';
  since timestamptz; until_at timestamptz;
begin
  if not (ichido.has_role('operator') or ichido.has_role('manager')) then perform ichido.fail('forbidden'); end if;
  if p_days is null or p_days not in (0, 7, 14, 30) then perform ichido.fail('bad_request'); end if;
  select start_at,end_at into since,until_at from ichido.report_bounds(p_days);
  return (
    select coalesce(jsonb_object_agg(rating, n), '{}')
    from (select cc.rating, count(*) as n from public.caller_card cc join public.desk d on d.id = cc.id
          where d.created_at >= since and d.created_at < until_at and cc.rating is not null group by 1) x
  );
end $$;

create or replace function public.insights_bot(p_days int default 14) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  tz constant text := 'Asia/Tokyo';
  since timestamptz; until_at timestamptz;
begin
  if not (ichido.has_role('operator') or ichido.has_role('manager')) then perform ichido.fail('forbidden'); end if;
  if p_days is null or p_days not in (0, 7, 14, 30) then perform ichido.fail('bad_request'); end if;
  select start_at,end_at into since,until_at from ichido.report_bounds(p_days);
  return (
    select jsonb_build_object(
      'records', count(*),
      'claim_s', percentile_cont(0.5) within group (order by r.claim_s),
      'first_reply_s', percentile_cont(0.5) within group (order by r.first_reply_s),
      'guard_arrival_s', percentile_cont(0.5) within group (order by r.guard_arrival_s),
      'total_s', percentile_cont(0.5) within group (order by r.total_s))
    from public.case_record r join public.desk d on d.id = r.incident where d.created_at >= since and d.created_at < until_at
  );
end $$;

create or replace function public.insights_ops(p_days int default 14) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  tz constant text := 'Asia/Tokyo';
  since timestamptz; until_at timestamptz;
begin
  if not (ichido.has_role('operator') or ichido.has_role('manager')) then perform ichido.fail('forbidden'); end if;
  if p_days is null or p_days not in (0, 7, 14, 30) then perform ichido.fail('bad_request'); end if;
  select start_at,end_at into since,until_at from ichido.report_bounds(p_days);
  return (
    with c as (
      select d.*, d.fault = 'card_retained' as captured,
        d.fault = 'card_retained' and d.status = 'guided' and d.finished_at is not null
          and (d.finished_at at time zone tz)::date = (d.created_at at time zone tz)::date as same_day
      from public.desk d where d.created_at >= since and d.created_at < until_at
    ), e as (
      select e.kind from public.case_event e join c on c.id = e.incident where e.kind in ('takeover', 'broadcast')
    ), p as (
      select p.outcome from public.promise p join c on c.id = p.incident
    )
    select jsonb_build_object(
      'fraud', (select count(*) from c where exists (select from public.case_event ev where ev.incident=c.id and ev.kind='fraud')),
      'abusive', (select count(*) from c where abusive_at is not null),
      'takeovers', (select count(*) from e where kind = 'takeover'),
      'mass_incidents', (select count(distinct mass_incident) from c),
      'broadcasts', (select count(*) from e where kind = 'broadcast'),
      'promises', (select count(*) from p),
      'promises_expired', (select count(*) from p where outcome = 'expired'),
      'captured', (select count(*) from c where captured),
      'resolved_same_day', (select count(*) from c where same_day),
      'per_day', (
        select coalesce(jsonb_agg(jsonb_build_object('day', g::date,
          'captured', (select count(*) from c where captured and (c.created_at at time zone tz)::date = g::date),
          'resolved', (select count(*) from c where same_day and (c.created_at at time zone tz)::date = g::date)) order by g), '[]')
        from generate_series((since at time zone tz)::date, (until_at at time zone tz)::date - 1, interval '1 day') g)
    )
  );
end $$;

create or replace function public.insights_packs(p_days int default 14) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare tz constant text := 'Asia/Tokyo'; since timestamptz; until_at timestamptz;
begin
  if not (ichido.has_role('operator') or ichido.has_role('manager')) then perform ichido.fail('forbidden'); end if;
  if p_days is null or p_days not in (0, 7, 14, 30) then perform ichido.fail('bad_request'); end if;
  select start_at,end_at into since,until_at from ichido.report_bounds(p_days);
  return (
    select coalesce(jsonb_object_agg(pack, jsonb_build_object('received', n, 'guided', g)), '{}')
    from (select ichido.pack_of(st.kind) as pack, count(*) as n, count(*) filter (where d.status = 'guided') as g
          from public.desk d join public.station st on st.id = d.station
          where d.created_at >= since and d.created_at < until_at group by 1) x
  );
end $$;

create or replace function public.shift_insights(p_days int) returns jsonb language sql stable security invoker set search_path='' as $$
 select public.insights(p_days) || jsonb_build_object('ratings',public.insights_ratings(p_days),'bot',public.insights_bot(p_days),
   'ops',public.insights_ops(p_days),'packs',public.insights_packs(p_days))
$$;
revoke all on function public.shift_insights(int) from public,anon,authenticated;
grant execute on function public.shift_insights(int) to authenticated;

create or replace function public.ops_promise_expire(p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare p public.promise; d public.desk; j public.field_job;
begin
  select * into p from public.promise where id = p_id;
  if not found then return 'gone'; end if;
  select * into d from public.desk where id = p.incident for update;
  select * into p from public.promise where id = p_id for update;
  if p.settled_at is not null then return 'settled'; end if;
  if d.finished_at is not null and (d.abandoned or p.kind not in ('eta','arrived')) then
    update public.promise set settled_at = now(), outcome = 'closed' where id = p_id;
    return 'closed';
  end if;
  if p.kind in ('eta', 'arrived') then
    select * into j from public.field_job where incident = d.id for update;
    if not found or j.generation <> p.generation or j.case_closed
       or j.state <> (case p.kind when 'eta' then 'on_way' else 'arrived' end) then
      update public.promise set settled_at = now(), outcome = 'replaced' where id = p_id;
      return 'moved';
    end if;
    update public.field_job set reestimate_gen = j.generation where incident = d.id;
  end if;
  update public.promise set settled_at = now(), outcome = 'expired' where id = p_id;
  update public.caller_card set notice = 'still_working', notice_at = now() where id = d.id and not fraud and d.finished_at is null;
  perform ichido.event(d.id, 'bot', 'promise_due', jsonb_strip_nulls(jsonb_build_object('kind', p.kind, 'by', p.made_by)));
  return 'expired';
end $$;

-- The per-case workflow exits at guided closure. Continue timers for workers still in the field.
select cron.schedule('ichido-guided-field-promises','* * * * *',$job$
  select public.ops_promise_expire(p.id) from public.promise p join public.desk d on d.id=p.incident
    where d.finished_at is not null and not d.abandoned and p.kind in ('eta','arrived')
      and p.settled_at is null and p.due_at<=now() order by p.due_at limit 100
$job$);

create or replace function public.my_external_work() returns table(incident uuid,station text,task text,due_at timestamptz)
language sql stable security definer set search_path='' as $$
 select w.incident,d.station,w.recipient,w.due_at from public.partner_work w join public.desk d on d.id=w.incident
   where ichido.has_role('operator') and w.owner_id=auth.uid() and w.accepted_at is null
 union all
 select d.id,d.station,'field',case when j.state='requested' then j.assigned_at+make_interval(secs=>t.seconds)
   else (select p.due_at from public.promise p where p.incident=j.incident and p.generation=j.generation
     and p.kind=case j.state when 'on_way' then 'eta' else 'arrived' end and (p.settled_at is null or p.outcome='expired')
     order by p.created_at desc limit 1) end from public.desk d
   join public.field_job j on j.incident=d.id join ichido.sla_target t on t.reason='guard_late'
   where ichido.has_role('operator') and d.operator_id=auth.uid() and j.state<>'done' and not j.case_closed
 order by due_at
$$;
revoke all on function public.my_external_work() from public,anon,authenticated;
grant execute on function public.my_external_work() to authenticated;

create table if not exists public.field_standdown (
  incident uuid not null references public.desk on delete cascade, generation int not null,
  assignee uuid not null references ichido.staff, station text not null, at timestamptz not null default now(),
  primary key(incident,generation)
);
alter table public.field_standdown enable row level security;
revoke all on public.field_standdown from public,anon,authenticated;
grant select on public.field_standdown to authenticated;
drop policy if exists my_standdown on public.field_standdown;
create policy my_standdown on public.field_standdown for select to authenticated using (assignee=auth.uid() and ichido.has_role('field'));
drop trigger if exists live_insert on public.field_standdown;
create trigger live_insert after insert on public.field_standdown referencing new table as new_rows for each statement execute function ichido.live_send();
drop policy if exists live_standdown on realtime.messages;
create policy live_standdown on realtime.messages for select to authenticated using(extension='broadcast' and realtime.topic()='live:field_standdown' and ichido.has_role('field'));
create or replace function ichido.stand_down() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.field_standdown(incident,generation,assignee,station) values(old.incident,old.generation,old.assignee,old.station);
  return null;
end $$;
create or replace trigger stand_down after update of generation on public.field_job for each row
when (old.assignee<>new.assignee) execute function ichido.stand_down();

create or replace function public.disaster_preview(p_stations text[]) returns integer language sql stable security definer set search_path='' as $$
  select count(distinct d.id)::int from public.station s join public.desk d on d.station=s.id
    join ichido.binding b on b.incident=d.id and b.expires>now()
    where s.id=any(p_stations) and ichido.pack_of(s.kind)='atm' and d.finished_at is null
    and (ichido.has_role('operator') or ichido.my_role() in ('manager','admin'))
$$;
revoke all on function public.disaster_preview(text[]) from public,anon,authenticated;
grant execute on function public.disaster_preview(text[]) to authenticated;

-- Old mass groups and active instructions may predate pack or dispatch checks.
update public.caller_card c set notice=null, notice_at=null from public.station st
  where c.station=st.id and ichido.pack_of(st.kind)<>'atm' and c.notice='mass_leave';
update public.desk d set mass_incident=null from public.station st
  where d.station=st.id and ichido.pack_of(st.kind)<>'atm' and d.mass_incident is not null;
select ichido.withdraw_unfit_reply(d.id) from public.desk d join public.caller_card c on c.id=d.id
  join public.reply r on r.id=c.reply_id where d.finished_at is null
  and ((d.remote_release='released' and r.intent='HELD_WAIT_OR_LEAVE') or not ichido.work_fits(d.id,r.intent));

revoke all on function ichido.snapshot_flags(), ichido.check_field_reply(), ichido.stand_down() from public,anon,authenticated;

alter table public.desk add column if not exists summary_checked boolean not null default false;
