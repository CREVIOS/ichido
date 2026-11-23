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
notify pgrst, 'reload schema';
commit;
