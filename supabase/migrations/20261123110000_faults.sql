-- Real-world fault paths (web/content/faults.ts): a fault type for every reason a card, passbook or cash is held,
-- the caller's own taps, the amount the caller stated on the handset, the bank's follow-up status, and a follow-up
-- page that outlives the two-hour pairing. Codes only; all wording lives in the catalogue.

-- 1. What the caller tapped (CALLER_FLAGS codes) and the bank's status, on the caller's own card (caller + operators read it).
alter table public.caller_card
  add column flags text[] not null default '{}',
  add column bank_status text check (bank_status ~ '^[a-z_]{1,32}$'),
  add column bank_due date,
  add column bank_updated_at timestamptz;

-- 2. The amount the caller stated on the handset (本人申告), typed by the operator. desk is operator-only under RLS,
--    so no caller can read or write it.
alter table public.desk add column stated_amount integer check (stated_amount between 1 and 10000000);

-- 3. Which fault types (and caller statements) each approved reply needs: REPLY_RULES in faults.ts, checked by
--    tests/faults.test.mjs. An intent with no row may be sent for any fault.
create table ichido.reply_rule (
  intent text primary key,
  faults text[] not null,
  needs_flags text[],      -- the caller must have tapped at least one of these
  blocked_by text[]        -- never once the caller tapped any of these
);
alter table ichido.reply_rule enable row level security;
revoke all on ichido.reply_rule from public, anon, authenticated;
grant select on ichido.reply_rule to service_role;
insert into ichido.reply_rule values
  ('HELD_WAIT_OR_LEAVE', '{card_retained}', null, '{forgot_card,card_kept_msg}'),
  ('CARD_FORGOTTEN', '{card_forgotten}', null, null),
  ('CARD_KEPT_RULE', '{card_kept}', null, null),
  ('CARD_UNREADABLE', '{card_unreadable}', null, null),
  ('RESIDENCE_CARD', '{card_retained,card_forgotten,card_kept,card_unreadable}', '{card_cant_use}', null),
  ('VISITOR_CARD', '{card_retained,card_forgotten,card_kept,card_unreadable}', '{foreign_card,leaving_japan}', null),
  ('CASH_DEBITED', '{debited_no_cash}', null, null),
  ('CASH_LEFT', '{cash_left}', null, null),
  ('CASH_IN_JAM', '{cash_jam}', '{cash_in_stuck}', null),
  ('LIMIT_REFUSED', '{limit_refused}', null, null),
  ('PASSBOOK_HELD', '{passbook_stuck}', '{passbook_inside}', null);

create function ichido.reply_ok(p_intent text, p_fault text, p_flags text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select p_fault = any (r.faults)
       and (r.needs_flags is null or p_flags && r.needs_flags)
       and not (p_flags && coalesce(r.blocked_by, '{}'))
    from ichido.reply_rule r where r.intent = p_intent), true)
$$;

-- Every reply insert is checked, whoever sends it. cmd_send already holds the desk row lock, and fault changes
-- and caller taps take the same lock, so the check cannot race them.
create function ichido.reply_allowed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare f text; fl text[];
begin
  select d.fault, c.flags into f, fl from public.desk d join public.caller_card c on c.id = d.id where d.id = new.incident;
  if not ichido.reply_ok(new.intent, f, fl) then perform ichido.fail('conflict'); end if;
  return new;
end $$;
create trigger reply_allowed before insert on public.reply for each row execute function ichido.reply_allowed();

-- When the fault type or the caller's taps change, guidance that no longer fits leaves the caller's screen
-- (with any choice and teach-back that answered it) until the operator sends a reply that does.
create function ichido.withdraw_unfit_reply(p_incident uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.caller_card; i text; f text;
begin
  select * into c from public.caller_card where id = p_incident for update;
  select intent into i from public.reply where id = c.reply_id;
  select fault into f from public.desk where id = p_incident;
  if i is null or ichido.reply_ok(i, f, c.flags) then return; end if;
  update public.caller_card set reply_id = null, choice = null, teachback = null, teachback_ja = null,
         teachback_reply = null, teachback_result = null where id = p_incident;
  perform ichido.event(p_incident, 'system', 'reply_withdrawn', jsonb_build_object('intent', i));
end $$;

-- The operator corrects the fault type when the caller's story shows the machine alert was wrong.
create function public.cmd_set_fault(p_uid uuid, p_name text, p_incident uuid, p_fault text) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.desk;
begin
  if p_fault !~ '^[a-z_]{1,32}$' then perform ichido.fail('bad_request'); end if;
  d := ichido.owned_case(p_uid, p_incident);
  if d.fault = p_fault then return; end if;
  update public.desk set fault = p_fault where id = d.id;
  update public.caller_card set fault = p_fault where id = d.id;
  update public.field_job set fault = p_fault where incident = d.id;
  perform ichido.event(d.id, 'operator', 'fault_changed', jsonb_build_object('from', d.fault, 'to', p_fault), p_name);
  perform ichido.withdraw_unfit_reply(d.id);
end $$;

-- A caller's own tap (a CALLER_FLAGS code), on or off, while the case is open.
create function public.cmd_flag(p_uid uuid, p_flag text, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.desk;
begin
  if p_flag !~ '^[a-z_]{1,32}$' or p_on is null then perform ichido.fail('bad_request'); end if;
  d := ichido.caller_case(p_uid);
  update public.caller_card
     set flags = case when p_on then array_append(flags, p_flag) else array_remove(flags, p_flag) end
   where id = d.id and (p_flag = any (flags)) <> p_on;
  if not found then return; end if;
  perform ichido.event(d.id, 'caller', 'flag', jsonb_build_object('flag', p_flag, 'on', p_on));
  perform ichido.withdraw_unfit_reply(d.id);
end $$;

-- The amount the caller stated on the handset, entered by the owning operator for a cash fault (null clears it).
create function public.cmd_stated_amount(p_uid uuid, p_name text, p_incident uuid, p_amount int, p_amount_faults text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.desk;
begin
  if p_amount is not null and p_amount not between 1 and 10000000 then perform ichido.fail('bad_request'); end if;
  d := ichido.owned_case(p_uid, p_incident);
  if not (d.fault = any (p_amount_faults)) then perform ichido.fail('conflict'); end if;
  update public.desk set stated_amount = p_amount where id = d.id;
  perform ichido.event(d.id, 'operator', 'stated_amount', jsonb_strip_nulls(jsonb_build_object('amount', p_amount)), p_name);
end $$;

-- The bank's follow-up status, recorded by any operator on the bank's behalf, open or closed case.
create function public.cmd_bank_status(p_uid uuid, p_name text, p_incident uuid, p_status text, p_due date) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from ichido.staff where uid = p_uid and role = 'operator') then perform ichido.fail('forbidden'); end if;
  if p_status !~ '^[a-z_]{1,32}$' then perform ichido.fail('bad_request'); end if;
  update public.caller_card set bank_status = p_status, bank_due = p_due, bank_updated_at = now() where id = p_incident;
  if not found then perform ichido.fail('not_found'); end if;
  perform ichido.event(p_incident, 'operator', 'bank_status', jsonb_strip_nulls(jsonb_build_object('status', p_status, 'due', p_due)), p_name);
end $$;

-- 4. Follow-up: when a case closes with guidance confirmed, the caller's phone keeps read access to it for 30 days
--    (served by the `followup` command), after the two-hour pairing has expired.
create table ichido.follow_up (
  incident uuid primary key references public.desk on delete cascade,
  uid uuid not null references auth.users on delete cascade,
  expires timestamptz not null
);
create index follow_up_uid on ichido.follow_up (uid);
alter table ichido.follow_up enable row level security;
revoke all on ichido.follow_up from public, anon, authenticated;
grant all on ichido.follow_up to service_role;

create function ichido.keep_follow_up() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into ichido.follow_up (incident, uid, expires)
    select b.incident, b.uid, now() + interval '30 days' from ichido.binding b where b.incident = new.id
    on conflict (incident) do nothing;
  return null;
end $$;
create trigger keep_follow_up after update of finished_at on public.desk for each row
  when (old.finished_at is null and new.finished_at is not null and new.status = 'guided' and not new.abandoned)
  execute function ichido.keep_follow_up();

do $$
declare f text;
begin
  foreach f in array array[
    'cmd_set_fault(uuid,text,uuid,text)', 'cmd_flag(uuid,text,boolean)',
    'cmd_stated_amount(uuid,text,uuid,int,text[])', 'cmd_bank_status(uuid,text,uuid,text,date)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
revoke all on function ichido.reply_ok(text, text, text[]), ichido.reply_allowed(), ichido.withdraw_unfit_reply(uuid),
  ichido.keep_follow_up() from public, anon, authenticated;
