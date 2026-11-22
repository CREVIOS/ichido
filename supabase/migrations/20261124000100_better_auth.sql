-- Staff sign in with Better Auth (web/lib/auth.ts), whose tables live in their own schema, auth_ba. Callers stay
-- Supabase anonymous users. Tables generated with `npx auth generate` (Better Auth 1.7.27, generateId "uuid",
-- plugins twoFactor, passkey, admin, rate limit in the database, session field aal), then hand-checked: schema
-- qualified, idempotent, defaults for the plugin flags, a role check, a unique passkey credential id.
--
-- After this migration a staff member's database access needs a token minted by /api/auth/supabase-token for a live
-- Better Auth session that passed a second factor (aal2). Revoking that session cuts PostgREST and Realtime at once.

create schema if not exists auth_ba;
revoke all on schema auth_ba from public, anon, authenticated;

create table if not exists auth_ba."user" (
  "id" uuid default pg_catalog.gen_random_uuid() not null primary key,
  "name" text not null,
  "email" text not null unique,
  "emailVerified" boolean not null default false,
  "image" text,
  "createdAt" timestamptz default current_timestamp not null,
  "updatedAt" timestamptz default current_timestamp not null,
  "twoFactorEnabled" boolean not null default false,
  "role" text not null default 'field' check ("role" in ('operator', 'field', 'manager', 'admin', 'auditor')),
  "banned" boolean not null default false,
  "banReason" text,
  "banExpires" timestamptz
);

create table if not exists auth_ba."session" (
  "id" uuid default pg_catalog.gen_random_uuid() not null primary key,
  "expiresAt" timestamptz not null,
  "token" text not null unique,
  "createdAt" timestamptz default current_timestamp not null,
  "updatedAt" timestamptz not null,
  "ipAddress" text,
  "userAgent" text,
  "userId" uuid not null references auth_ba."user" ("id") on delete cascade,
  "impersonatedBy" text,
  "aal" text not null default 'aal1' check ("aal" in ('aal1', 'aal2'))
);

create table if not exists auth_ba."account" (
  "id" uuid default pg_catalog.gen_random_uuid() not null primary key,
  "accountId" text not null,
  "providerId" text not null,
  "userId" uuid not null references auth_ba."user" ("id") on delete cascade,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "scope" text,
  "password" text,
  "createdAt" timestamptz default current_timestamp not null,
  "updatedAt" timestamptz not null
);

create table if not exists auth_ba."verification" (
  "id" uuid default pg_catalog.gen_random_uuid() not null primary key,
  "identifier" text not null,
  "value" text not null,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz default current_timestamp not null,
  "updatedAt" timestamptz default current_timestamp not null
);

create table if not exists auth_ba."twoFactor" (
  "id" uuid default pg_catalog.gen_random_uuid() not null primary key,
  "secret" text not null,
  "backupCodes" text not null,
  "userId" uuid not null references auth_ba."user" ("id") on delete cascade,
  "verified" boolean default true,
  "failedVerificationCount" integer default 0,
  "lockedUntil" timestamptz
);

create table if not exists auth_ba."passkey" (
  "id" uuid default pg_catalog.gen_random_uuid() not null primary key,
  "name" text,
  "publicKey" text not null,
  "userId" uuid not null references auth_ba."user" ("id") on delete cascade,
  "credentialID" text not null,
  "counter" integer not null,
  "deviceType" text not null,
  "backedUp" boolean not null,
  "transports" text,
  "createdAt" timestamptz,
  "aaguid" text
);

create table if not exists auth_ba."rateLimit" (
  "id" uuid default pg_catalog.gen_random_uuid() not null primary key,
  "key" text not null unique,
  "count" integer not null,
  "lastRequest" bigint not null
);

-- Devices a staff member has signed in from (SHA-256 of the user agent): a new one sends a sign-in alert.
create table if not exists auth_ba.known_device (
  user_id uuid not null references auth_ba."user" ("id") on delete cascade,
  device text not null,
  first_seen timestamptz not null default now(),
  primary key (user_id, device)
);

create index if not exists "session_userId_idx" on auth_ba."session" ("userId");
create index if not exists "account_userId_idx" on auth_ba."account" ("userId");
create index if not exists "verification_identifier_idx" on auth_ba."verification" ("identifier");
create index if not exists "twoFactor_secret_idx" on auth_ba."twoFactor" ("secret");
create index if not exists "twoFactor_userId_idx" on auth_ba."twoFactor" ("userId");
create index if not exists "passkey_userId_idx" on auth_ba."passkey" ("userId");
create unique index if not exists "passkey_credentialID_idx" on auth_ba."passkey" ("credentialID");

revoke all on all tables in schema auth_ba from public, anon, authenticated;

-- Existing staff keep their uid, name and role: cases, replies and guard jobs still point at them. They have no
-- password here; scripts/seed-staff.mjs (local) or an invite (production) sets one.
insert into auth_ba."user" ("id", "name", "email", "emailVerified", "role", "createdAt", "updatedAt")
select s.uid, s.display_name, lower(u.email), true, s.role::text, now(), now()
from ichido.staff s join auth.users u on u.id = s.uid
where u.email is not null
on conflict ("id") do nothing;

alter table ichido.staff drop constraint if exists staff_uid_fkey;
alter table ichido.staff add constraint staff_uid_fkey foreign key (uid) references auth_ba."user" ("id") on delete cascade;
-- The old Supabase password accounts for staff go: no second way in.
delete from auth.users u using ichido.staff s where u.id = s.uid and u.is_anonymous is not true;

-- ichido.staff stays the role the database checks; it follows the Better Auth user.
create or replace function auth_ba.sync_staff() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into ichido.staff (uid, role, display_name) values (new."id", new."role"::public.staff_role, new."name")
  on conflict (uid) do update set role = excluded.role, display_name = excluded.display_name;
  return new;
end $$;
drop trigger if exists sync_staff on auth_ba."user";
create trigger sync_staff after insert or update of "role", "name" on auth_ba."user"
  for each row execute function auth_ba.sync_staff();
revoke all on function auth_ba.sync_staff() from public, anon, authenticated;

-- The caller's staff role, only for a token minted for a live aal2 Better Auth session (claim session_id).
-- A Supabase anonymous caller's session_id is a GoTrue session and never matches.
create or replace function ichido.my_role() returns public.staff_role
language sql stable security definer set search_path = '' as $$
  select s.role
  from ichido.staff s
  join auth_ba."session" x on x."userId" = s.uid
  join auth_ba."user" u on u."id" = s.uid
  where s.uid = auth.uid()
    and x."id" = case when auth.jwt() ->> 'session_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                      then (auth.jwt() ->> 'session_id')::uuid end
    and x."expiresAt" > now()
    and x."aal" = 'aal2'
    and not u."banned"
$$;
revoke all on function ichido.my_role() from public, anon, authenticated;

-- Reading as a manager also covers admin (does what a manager does) and auditor (reads what a manager reads).
-- Every has_role('manager') in policies and functions guards a read; writes check the role of p_uid themselves.
create or replace function ichido.has_role(r public.staff_role) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(case when r = 'manager' then ichido.my_role() in ('manager', 'admin', 'auditor')
                       else ichido.my_role() = r end, false)
$$;
create or replace function ichido.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select ichido.my_role() is not null
$$;

-- Auditors read the case history (cases, timelines, replies, guard jobs); they never see drafts or callers' cards.
do $$
declare t text;
begin
  foreach t in array array['desk', 'case_event', 'reply', 'field_job'] loop
    execute format('drop policy if exists auditor_read on public.%I', t);
    execute format('create policy auditor_read on public.%I for select to authenticated using (ichido.has_role(''auditor''))', t);
  end loop;
end $$;

-- Admin does what a manager does: disaster areas too.
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
revoke all on function public.cmd_disaster(uuid, text, text[], text) from public, anon, authenticated;
grant execute on function public.cmd_disaster(uuid, text, text[], text) to service_role;

-- Account administration, append-only: invites, role changes, disabling, MFA resets, session revocations.
-- Codes and ids only; the admin page words them (web/content/admin.ts).
create table if not exists ichido.staff_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  action text not null check (action ~ '^[a-z_]{1,40}$'),
  target uuid,
  data jsonb not null default '{}'
);
create index if not exists staff_audit_at on ichido.staff_audit (at desc);

create or replace function ichido.staff_audit_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'staff_audit is append-only';
end $$;
drop trigger if exists append_only on ichido.staff_audit;
create trigger append_only before update or delete on ichido.staff_audit
  for each row execute function ichido.staff_audit_append_only();
drop trigger if exists append_only_truncate on ichido.staff_audit;
create trigger append_only_truncate before truncate on ichido.staff_audit
  for each statement execute function ichido.staff_audit_append_only();

alter table ichido.staff_audit enable row level security;
revoke all on ichido.staff_audit from public, anon, authenticated;
grant select on ichido.staff_audit to authenticated;
drop policy if exists audit_read on ichido.staff_audit;
create policy audit_read on ichido.staff_audit for select to authenticated
  using (ichido.has_role('admin') or ichido.has_role('auditor'));

-- Expired sessions and one-time tokens.
select cron.unschedule('ichido-expire-auth') where exists (select from cron.job where jobname = 'ichido-expire-auth');
select cron.schedule('ichido-expire-auth', '*/15 * * * *', $cron$
  delete from auth_ba."session" where "expiresAt" < now();
  delete from auth_ba."verification" where "expiresAt" < now();
$cron$);
