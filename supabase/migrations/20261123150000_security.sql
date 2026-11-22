-- PostgREST exposes ichido for service operations and the operator's SLA targets.
alter table ichido.staff enable row level security;
alter table ichido.binding enable row level security;
alter table ichido.pair_code enable row level security;
alter table ichido.pair_attempt enable row level security;
alter table ichido.device_event enable row level security;
revoke all on ichido.staff, ichido.binding, ichido.pair_code, ichido.pair_attempt, ichido.device_event
  from public, anon, authenticated;
revoke execute on all functions in schema ichido from public, anon, authenticated;
grant execute on function ichido.has_role(public.staff_role), ichido.is_staff(), ichido.owns(uuid),
  ichido.owns_station(text), ichido.guards_station(text) to authenticated;

-- Existing phones keep their room. A replacement binding always receives a different room.
alter table ichido.binding add column voice_room uuid;
update ichido.binding set voice_room = incident;
alter table ichido.binding alter column voice_room set default gen_random_uuid(), alter column voice_room set not null;

create function public.finish_voice_command(p_cmd text, p_uid uuid, p_name text, p_incident uuid,
  p_reply uuid default null, p_result text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare old_room uuid;
begin
  perform ichido.owned_case(p_uid, p_incident);
  select voice_room into old_room from ichido.binding where incident = p_incident;
  case p_cmd
    when 'outcome' then
      perform public.cmd_outcome(p_uid, p_name, p_incident, p_reply, p_result);
      if p_result = 'clarify' then return null; end if;
    when 'reset_caller' then perform public.cmd_reset_caller(p_uid, p_name, p_incident);
    when 'abandon' then perform public.cmd_abandon(p_uid, p_name, p_incident);
    else perform ichido.fail('bad_request');
  end case;
  return old_room;
end $$;
revoke all on function public.finish_voice_command(text,uuid,text,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.finish_voice_command(text,uuid,text,uuid,uuid,text) to service_role;

-- Check the current identity as well as the assignment if an account changes role.
create or replace function ichido.owns(i uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select from ichido.binding b join auth.users u on u.id = b.uid
    where b.incident = i and b.uid = auth.uid() and b.expires > now() and u.is_anonymous
      and not exists (select from ichido.staff s where s.uid = b.uid))
$$;
create or replace function ichido.owns_station(s text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select from ichido.binding b join public.desk d on d.id = b.incident
    where b.uid = auth.uid() and d.station = s and ichido.owns(b.incident))
$$;
create or replace function ichido.guards_station(s text) returns boolean
language sql stable security definer set search_path = '' as $$
  select ichido.has_role('field') and exists (
    select from public.field_job f where f.station = s and f.assignee = auth.uid() and not f.case_closed)
$$;

create policy operator_presence_read on realtime.messages for select to authenticated
  using (realtime.topic() = 'ichido:operator-presence' and extension = 'presence' and ichido.has_role('operator'));
create policy operator_presence_write on realtime.messages for insert to authenticated
  with check (realtime.topic() = 'ichido:operator-presence' and extension = 'presence' and ichido.has_role('operator'));

create function public.mcp_field_staff() returns table(uid uuid, display_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not ichido.has_role('operator') then perform ichido.fail('forbidden'); end if;
  return query select s.uid, s.display_name from ichido.staff s where s.role = 'field' order by s.display_name;
end $$;
revoke all on function public.mcp_field_staff() from public, anon, authenticated, service_role;
grant execute on function public.mcp_field_staff() to authenticated;

create table ichido.rate_bucket (
  scope text not null,
  key text not null,
  used integer not null,
  expires_at timestamptz not null,
  primary key (scope, key)
);
create index rate_bucket_expires on ichido.rate_bucket (expires_at);
alter table ichido.rate_bucket enable row level security;
revoke all on ichido.rate_bucket from public, anon, authenticated;
select cron.schedule('ichido-expire-rate-buckets', '*/10 * * * *',
  'delete from ichido.rate_bucket where expires_at <= now()');

-- One row per active key. The unique index serializes parallel requests from all server instances.
create function public.take_rate_limit(p_scope text, p_key text, p_limit integer, p_seconds integer, p_check_only boolean default false)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  t timestamptz := clock_timestamp();
begin
  if p_scope is null or length(p_scope) not between 1 and 64
     or p_key is null or length(p_key) not between 1 and 256
     or p_limit is null or p_limit not between 1 and 100000
     or p_seconds is null or p_seconds not between 1 and 86400 then
    perform ichido.fail('bad_request');
  end if;
  if p_check_only then
    return not exists (select from ichido.rate_bucket where scope = p_scope and key = p_key and expires_at > t and used >= p_limit);
  end if;
  insert into ichido.rate_bucket as b (scope, key, used, expires_at)
    values (p_scope, p_key, 1, t + make_interval(secs => p_seconds))
    on conflict (scope, key) do update
      set used = case when b.expires_at <= t then 1 else b.used + 1 end,
          expires_at = case when b.expires_at <= t then excluded.expires_at else b.expires_at end
      where b.expires_at <= t or b.used < p_limit;
  return found;
end $$;

-- Keep the existing rolling windows, including attempts from before this migration.
create index pair_attempt_uid_at on ichido.pair_attempt (uid, at);
create index pair_attempt_station_at on ichido.pair_attempt (station, at);
create index silent_alert_uid_at on ichido.silent_alert (uid, at);
create index silent_alert_station_at on ichido.silent_alert (station, at);
select cron.schedule('ichido-expire-caller-attempts', '*/10 * * * *', $cron$
  delete from ichido.pair_attempt where at < now() - interval '1 hour';
  delete from ichido.silent_alert where at < now() - interval '1 hour';
$cron$);

create or replace function public.note_pair_attempt(p_uid uuid, p_station text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  station_key text := coalesce((select id from public.station where id = p_station), '');
  since timestamptz;
begin
  perform pg_advisory_xact_lock(1, hashtext(p_uid::text));
  perform pg_advisory_xact_lock(2, hashtext(station_key));
  since := clock_timestamp() - interval '5 minutes';
  if (select count(*) from ichido.pair_attempt where uid = p_uid and at > since) >= 5
     or (select count(*) from ichido.pair_attempt where station = station_key and at > since) >= 30 then
    return false;
  end if;
  insert into ichido.pair_attempt (uid, station, at) values (p_uid, station_key, clock_timestamp());
  return true;
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
  update public.desk set text_only = true where id = i and not text_only;
  if found then
    update public.caller_card set text_only = true where id = i;
    perform ichido.event(i, 'caller', 'text_only', '{}');
  end if;
end $$;

create function public.issue_pair_code(p_uid uuid, p_incident uuid, p_digest text, p_display text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare op_name text;
begin
  select s.display_name into op_name from ichido.staff s join public.desk d on d.operator_id = s.uid
    where d.id = p_incident and d.finished_at is null and s.uid = p_uid and s.role = 'operator' for update of d;
  if not found then perform ichido.fail('forbidden'); end if;
  delete from ichido.binding where incident = p_incident and expires <= clock_timestamp();
  if exists (select from ichido.binding where incident = p_incident) then perform ichido.fail('conflict'); end if;
  insert into ichido.pair_code (incident, digest, expires) values (p_incident, p_digest, clock_timestamp() + interval '5 minutes')
    on conflict (incident) do update set digest = excluded.digest, expires = excluded.expires;
  if p_display is null then
    delete from ichido.device_code where incident = p_incident;
  else
    insert into ichido.device_code (incident, code, digest) values (p_incident, p_display, p_digest)
      on conflict (incident) do update set code = excluded.code, digest = excluded.digest;
    perform ichido.event(p_incident, 'operator', 'device_code', '{}', op_name);
  end if;
end $$;

create or replace function public.redeem_pair(p_uid uuid, p_station text, p_digest text, p_lang text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare i uuid;
begin
  if not exists (select from auth.users where id = p_uid and is_anonymous)
     or exists (select from ichido.staff where uid = p_uid) then perform ichido.fail('forbidden'); end if;
  perform pg_advisory_xact_lock(1, hashtext(p_uid::text));
  select id into i from public.desk where station = p_station and finished_at is null for update;
  if not found then perform ichido.fail('forbidden'); end if;
  delete from ichido.pair_code where incident = i and digest = p_digest and expires > clock_timestamp();
  if not found then perform ichido.fail('forbidden'); end if;
  delete from ichido.binding where (uid = p_uid or incident = i) and expires <= clock_timestamp();
  insert into ichido.binding (incident, uid, lang, expires) values (i, p_uid, p_lang, now() + interval '2 hours')
    on conflict do nothing;
  if not found then perform ichido.fail('forbidden'); end if;
  update public.desk set lang = p_lang where id = i;
  update public.caller_card set lang = p_lang where id = i;
  perform ichido.event(i, 'caller', 'paired', jsonb_build_object('lang', p_lang));
  return i;
end $$;

create or replace function ichido.caller_case(p_uid uuid) returns public.desk
language plpgsql security definer set search_path = '' as $$
declare d public.desk;
begin
  select d2.* into d from public.desk d2 join ichido.binding b on b.incident = d2.id
    join auth.users u on u.id = b.uid
    where b.uid = p_uid and b.expires > clock_timestamp() and u.is_anonymous
      and not exists (select from ichido.staff s where s.uid = p_uid) for update of d2;
  if not found or not exists (select from ichido.binding where uid = p_uid and incident = d.id and expires > clock_timestamp()) then
    perform ichido.fail('forbidden');
  end if;
  if d.finished_at is not null then perform ichido.fail('conflict'); end if;
  return d;
end $$;

-- Close and guard transitions must serialize on the desk, including an abandonment while a guard is travelling.
create or replace function public.cmd_field(p_uid uuid, p_name text, p_incident uuid, p_generation int, p_state text, p_eta text)
returns void language plpgsql security definer set search_path = '' as $$
declare finished boolean;
begin
  if p_state is null or p_state not in ('on_way', 'arrived', 'done') then perform ichido.fail('bad_request'); end if;
  select d.finished_at is not null into finished from public.desk d
    join public.field_job j on j.incident = d.id join ichido.staff s on s.uid = j.assignee
    where d.id = p_incident and s.uid = p_uid and s.role = 'field' and j.generation = p_generation and not j.case_closed
    for update of d;
  if not found then perform ichido.fail('forbidden'); end if;
  update public.field_job set state = p_state, eta = case when p_state = 'on_way' then p_eta end, updated_at = now(),
         case_closed = p_state = 'done' and finished
    where incident = p_incident and assignee = p_uid and generation = p_generation and not case_closed;
  if not found then perform ichido.fail('forbidden'); end if;
  update public.caller_card set field_state = p_state, eta = case when p_state = 'on_way' then p_eta end where id = p_incident;
  perform ichido.event(p_incident, 'field', 'field',
    jsonb_strip_nulls(jsonb_build_object('state', p_state, 'eta', case when p_state = 'on_way' then p_eta end)), p_name);
end $$;
update public.field_job j set case_closed = true from public.desk d
  where j.incident = d.id and d.finished_at is not null and j.state = 'done' and not j.case_closed;

create function public.create_handoff(p_uid uuid, p_incident uuid, p_hash text, p_recipient text)
returns table(id uuid, expires_at timestamptz) language plpgsql security definer set search_path = '' as $$
declare op_name text;
begin
  select display_name into op_name from ichido.staff where uid = p_uid and role = 'operator';
  if not found then perform ichido.fail('forbidden'); end if;
  perform 1 from public.desk where public.desk.id = p_incident for key share;
  if not found then perform ichido.fail('not_found'); end if;
  return query insert into ichido.handoff as h (incident, token_hash, recipient, created_by, expires_at)
    values (p_incident, p_hash, p_recipient, p_uid, clock_timestamp() + interval '24 hours') returning h.id, h.expires_at;
  perform ichido.event(p_incident, 'operator', 'handoff', jsonb_build_object('recipient', p_recipient), op_name);
end $$;

create function public.revoke_handoff(p_uid uuid, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare op_name text; link ichido.handoff;
begin
  select display_name into op_name from ichido.staff where uid = p_uid and role = 'operator';
  if not found then perform ichido.fail('forbidden'); end if;
  update ichido.handoff set revoked_at = clock_timestamp() where id = p_id and revoked_at is null returning * into link;
  if not found then perform ichido.fail('conflict'); end if;
  perform ichido.event(link.incident, 'operator', 'handoff_revoked', jsonb_build_object('recipient', link.recipient), op_name);
end $$;

create function public.view_handoff(p_hash text) returns table(incident uuid, recipient text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare link ichido.handoff;
begin
  select h.* into link from ichido.handoff h where h.token_hash = p_hash for update;
  if not found or link.revoked_at is not null or link.expires_at <= clock_timestamp() then return; end if;
  if not public.take_rate_limit('handoff_token', link.id::text, 30, 60) then return; end if;
  update ichido.handoff h set views = h.views + 1 where h.id = link.id;
  perform ichido.event(link.incident, 'system', 'handoff_viewed', jsonb_build_object('recipient', link.recipient));
  return query select link.incident, link.recipient, link.expires_at;
end $$;

revoke all on function public.take_rate_limit(text,text,integer,integer,boolean), public.issue_pair_code(uuid,uuid,text,text),
  public.create_handoff(uuid,uuid,text,text), public.revoke_handoff(uuid,uuid), public.view_handoff(text)
  from public, anon, authenticated;
grant execute on function public.take_rate_limit(text,text,integer,integer,boolean), public.issue_pair_code(uuid,uuid,text,text),
  public.create_handoff(uuid,uuid,text,text), public.revoke_handoff(uuid,uuid), public.view_handoff(text)
  to service_role;
