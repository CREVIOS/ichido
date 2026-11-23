-- Alerts and messaging (web/lib/alerts.ts, web/lib/line.ts). Idempotent.
--   public.push_subscription  one Web Push subscription or Expo push token per staff session and platform. It goes
--                             with the session: signing out, revoking or expiring the session deletes it (cascade).
--   ichido.alert_outbox       what happened, as codes (no caller text): filled by triggers on the existing tables,
--                             drained and delivered by the server (after commands, device calls and bot steps).
--   ichido.line_link          a caller's opt-in to LINE updates for one case: a one-time code, then the LINE user id,
--                             deleted after 7 days, on "stop" or when the user blocks the account.

-- 1. Push subscriptions: staff read and delete their own rows; the server writes them through /api/cmd.
create table if not exists public.push_subscription (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references ichido.staff on delete cascade,
  session_id uuid not null references auth_ba."session" ("id") on delete cascade,
  platform text not null check (platform in ('web', 'expo')),
  endpoint text not null unique check (length(endpoint) <= 1024),
  p256dh text check (length(p256dh) <= 256),
  auth text check (length(auth) <= 64),
  created_at timestamptz not null default now(),
  unique (session_id, platform),
  check (platform = 'expo' or (p256dh is not null and auth is not null))
);
create index if not exists push_subscription_uid on public.push_subscription (uid);
alter table public.push_subscription enable row level security;
revoke all on public.push_subscription from public, anon, authenticated;
grant select, delete on public.push_subscription to authenticated;
grant all on public.push_subscription to service_role;
drop policy if exists own_push_read on public.push_subscription;
create policy own_push_read on public.push_subscription for select to authenticated using (uid = auth.uid() and ichido.is_staff());
drop policy if exists own_push_delete on public.push_subscription;
create policy own_push_delete on public.push_subscription for delete to authenticated using (uid = auth.uid() and ichido.is_staff());

-- One row per session and platform; an endpoint moves to whoever registered it last on that browser or phone.
create or replace function public.push_subscribe(p_uid uuid, p_session uuid, p_platform text, p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.push_subscription where endpoint = p_endpoint and session_id <> p_session;
  insert into public.push_subscription (uid, session_id, platform, endpoint, p256dh, auth)
    values (p_uid, p_session, p_platform, p_endpoint, p_p256dh, p_auth)
    on conflict (session_id, platform) do update set endpoint = excluded.endpoint, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
end $$;

-- Live subscriptions of the given staff, or of anyone in the given roles: an aal2 session that has not expired, of
-- an account that is not disabled. Signed in is on duty: subscriptions end with the session.
create or replace function public.alert_subscriptions(p_uids uuid[], p_roles text[])
returns table (id uuid, uid uuid, platform text, endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.uid, p.platform, p.endpoint, p.p256dh, p.auth
    from public.push_subscription p
    join ichido.staff s on s.uid = p.uid
    join auth_ba."session" x on x.id = p.session_id
    join auth_ba."user" u on u.id = x."userId"
   where x."expiresAt" > now() and x.aal = 'aal2' and not u.banned
     and (p.uid = any (coalesce(p_uids, '{}')) or s.role::text = any (coalesce(p_roles, '{}')))
$$;

-- 2. The outbox. kind: new_case, sla, remind, promise_due, field_job, line_reply, line_bank, line_closed, disaster.
create table if not exists ichido.alert_outbox (
  id bigint generated always as identity primary key,
  kind text not null,
  incident uuid,
  station text,
  target uuid,                -- one staff member (owner, assignee); null = everyone in the kind's roles
  data jsonb not null default '{}',
  at timestamptz not null default now()
);
alter table ichido.alert_outbox enable row level security;
revoke all on ichido.alert_outbox from public, anon, authenticated;
grant all on ichido.alert_outbox to service_role;

-- Take up to p_limit rows, oldest first; concurrent drains never take the same row.
create or replace function public.alert_take(p_limit int) returns setof ichido.alert_outbox
language sql security definer set search_path = '' as $$
  delete from ichido.alert_outbox where id in (
    select id from ichido.alert_outbox order by id for update skip locked limit greatest(1, least(p_limit, 200))
  ) returning *
$$;

-- 3. LINE follow-up links. The code is stored only as a SHA-256 digest and works once, for 15 minutes.
create table if not exists ichido.line_link (
  incident uuid primary key references public.desk on delete cascade,
  code_digest text unique,
  code_expires timestamptz,
  line_user text check (line_user ~ '^U[0-9a-f]{32}$'),
  linked_at timestamptz,
  expires timestamptz not null
);
create index if not exists line_link_user on ichido.line_link (line_user);
alter table ichido.line_link enable row level security;
revoke all on ichido.line_link from public, anon, authenticated;
grant all on ichido.line_link to service_role;

-- 4. Triggers that fill the outbox. Codes and ids only, never caller words.
create or replace function ichido.alert_desk() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into ichido.alert_outbox (kind, incident, station) values ('new_case', new.id, new.station);
  elsif old.finished_at is null and new.finished_at is not null
        and exists (select from ichido.line_link where incident = new.id and line_user is not null) then
    insert into ichido.alert_outbox (kind, incident, station) values ('line_closed', new.id, new.station);
  end if;
  return null;
end $$;
drop trigger if exists alert_desk on public.desk;
create trigger alert_desk after insert or update of finished_at on public.desk for each row execute function ichido.alert_desk();

-- SLA breaches come from the existing escalation cron (ichido.escalate_due writes an 'escalated' event); reminders
-- and expired promises from the Ichido Bot; bank status from the operator.
create or replace function ichido.alert_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  d record;
begin
  if new.kind not in ('escalated', 'bot_remind', 'promise_due', 'bank_status') then return null; end if;
  select id, station, operator_id into d from public.desk where id = new.incident;
  if not found then return null; end if;
  if new.kind = 'bank_status' then
    if exists (select from ichido.line_link where incident = d.id and line_user is not null) then
      insert into ichido.alert_outbox (kind, incident, station, data)
        values ('line_bank', d.id, d.station, jsonb_build_object('status', new.data ->> 'status', 'due', new.data ->> 'due'));
    end if;
    return null;
  end if;
  insert into ichido.alert_outbox (kind, incident, station, target, data)
    values (case new.kind when 'escalated' then 'sla' when 'bot_remind' then 'remind' else 'promise_due' end,
            d.id, d.station, d.operator_id, jsonb_strip_nulls(jsonb_build_object('reason', new.data ->> 'reason')));
  return null;
end $$;
drop trigger if exists alert_event on public.case_event;
create trigger alert_event after insert on public.case_event for each row execute function ichido.alert_event();

-- A new job, or the job handed to another guard (a new generation): only the assigned guard.
create or replace function ichido.alert_field_job() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.generation <> old.generation or new.assignee <> old.assignee then
    insert into ichido.alert_outbox (kind, incident, station, target) values ('field_job', new.incident, new.station, new.assignee);
  end if;
  return null;
end $$;
drop trigger if exists alert_field_job on public.field_job;
create trigger alert_field_job after insert or update of generation, assignee on public.field_job
  for each row execute function ichido.alert_field_job();

-- An approved reply the operator sent: to the caller's LINE, if they linked it.
create or replace function ichido.alert_reply() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select from ichido.line_link where incident = new.incident and line_user is not null) then
    insert into ichido.alert_outbox (kind, incident, data) values ('line_reply', new.incident, jsonb_build_object('reply', new.id));
  end if;
  return null;
end $$;
drop trigger if exists alert_reply on public.reply;
create trigger alert_reply after insert on public.reply for each row execute function ichido.alert_reply();

-- Disaster mode switched on (one alert per statement, for the managers' Slack channel).
create or replace function ichido.alert_disaster() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  s text[];
begin
  select array_agg(distinct station order by station) into s from new_rows where kind = 'entered';
  if s is not null then
    insert into ichido.alert_outbox (kind, data) values ('disaster', jsonb_build_object('stations', to_jsonb(s)));
  end if;
  return null;
end $$;
drop trigger if exists alert_disaster on public.disaster_event;
create trigger alert_disaster after insert on public.disaster_event referencing new table as new_rows
  for each statement execute function ichido.alert_disaster();

revoke all on function public.push_subscribe(uuid, uuid, text, text, text, text), public.alert_subscriptions(uuid[], text[]),
  public.alert_take(int), ichido.alert_desk(), ichido.alert_event(), ichido.alert_field_job(), ichido.alert_reply(),
  ichido.alert_disaster() from public, anon, authenticated;
grant execute on function public.push_subscribe(uuid, uuid, text, text, text, text), public.alert_subscriptions(uuid[], text[]),
  public.alert_take(int) to service_role;

-- 5. Expiry: LINE links after 7 days (or an unused code after 15 minutes), undelivered alerts after an hour.
create or replace function ichido.expire_alerts() returns void
language sql security definer set search_path = '' as $$
  delete from ichido.line_link where expires < now() or (line_user is null and code_expires < now());
  delete from ichido.alert_outbox where at < now() - interval '1 hour';
$$;
revoke all on function ichido.expire_alerts() from public, anon, authenticated;
grant execute on function ichido.expire_alerts() to service_role;
select cron.unschedule('ichido-expire-alerts') where exists (select from cron.job where jobname = 'ichido-expire-alerts');
select cron.schedule('ichido-expire-alerts', '*/5 * * * *', 'select ichido.expire_alerts()');
