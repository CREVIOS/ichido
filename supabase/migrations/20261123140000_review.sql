-- 要確認 (For review): where the operator decides on what the AI and the Ichido Bot drafted.
-- Items are derived from existing rows (bot_suggestion, case_record, machine translations, hand-off links); a decision
-- is one review_state row per item version, written only by the commands below, with a timeline event.

create table public.review_state (
  kind text not null check (kind in ('suggestion', 'record', 'translation', 'handoff')),
  incident uuid not null references public.desk on delete cascade,
  ref text not null check (char_length(ref) <= 80),   -- the item version: suggestion rev, 'summary', 'words:<rev>', 'teachback:<event>', hand-off id
  decision text not null check (decision in ('accepted', 'dismissed', 'approved', 'confirmed', 'flagged', 'reissued', 'revoked')),
  note text check (char_length(note) <= 500),         -- staff-only note on an after-call record; never sent to a caller
  reviewed_by uuid not null references ichido.staff,
  reviewer text not null,
  reviewed_at timestamptz not null default now(),
  primary key (kind, incident, ref)
);
alter table public.review_state enable row level security;
revoke all on public.review_state from public, anon, authenticated;
grant select on public.review_state to authenticated;
grant all on public.review_state to service_role;
create policy operator_read on public.review_state for select to authenticated using (ichido.has_role('operator'));
alter publication supabase_realtime add table public.review_state;

-- The signed-in operator's unreviewed items, on their own cases, newest first.
create function public.review_queue() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if not ichido.has_role('operator') then perform ichido.fail('forbidden'); end if;
  return coalesce((
    select jsonb_agg(to_jsonb(q) order by q.at desc) from (
      -- The prepared suggestion for the caller's confirmed revision, while no reply has been sent since.
      select 'suggestion' as kind, d.id as incident, s.rev::text as ref, s.at, d.station, st.label->>'ja' as station_label,
        d.fault, d.lang, d.status,
        jsonb_build_object('suggestion', s.suggestion, 'slots', jsonb_build_object('branch', st.branch, 'hours', st.counter_hours)) as data
      from public.desk d join public.bot_suggestion s on s.incident = d.id join public.station st on st.id = d.station
      where d.operator_id = me and d.finished_at is null and s.rev = d.confirmed_rev
        and not exists (select 1 from public.reply r where r.incident = d.id and r.sent_at >= s.at)
        and not exists (select 1 from public.review_state v where v.kind = 'suggestion' and v.incident = d.id and v.ref = s.rev::text)
      union all
      -- The bot's after-call record of a guided case, for a week.
      select 'record', d.id, 'summary', r.at, d.station, st.label->>'ja', d.fault, d.lang, d.status,
        to_jsonb(r) - 'incident' || jsonb_build_object('finished_at', d.finished_at)
      from public.desk d join public.case_record r on r.incident = d.id join public.station st on st.id = d.station
      where d.operator_id = me and d.status = 'guided' and r.summary is not null and r.at > now() - interval '7 days'
        and not exists (select 1 from public.review_state v where v.kind = 'record' and v.incident = d.id and v.ref = 'summary')
      union all
      -- Machine translations of the caller's confirmed words, on open cases.
      select 'translation', d.id, 'words:' || d.confirmed_rev,
        coalesce((select max(e.at) from public.case_event e where e.incident = d.id and e.kind = 'confirmed'), d.created_at),
        d.station, st.label->>'ja', d.fault, d.lang, d.status,
        jsonb_build_object('source', 'words', 'text', d.caller_words, 'ja', d.caller_words_ja)
      from public.desk d join public.station st on st.id = d.station
      where d.operator_id = me and d.finished_at is null and d.lang <> 'ja' and d.confirmed_rev is not null
        and d.caller_words is not null and d.caller_words_ja is not null
        and not exists (select 1 from public.review_state v where v.kind = 'translation' and v.incident = d.id and v.ref = 'words:' || d.confirmed_rev)
      union all
      -- … and of the current teach-back.
      select 'translation', d.id, 'teachback:' || e.id, e.at, d.station, st.label->>'ja', d.fault, d.lang, d.status,
        jsonb_build_object('source', 'teachback', 'text', c.teachback, 'ja', c.teachback_ja)
      from public.desk d join public.caller_card c on c.id = d.id join public.station st on st.id = d.station
        join lateral (select x.id, x.at from public.case_event x where x.incident = d.id and x.kind = 'teachback' order by x.id desc limit 1) e on true
      where d.operator_id = me and d.finished_at is null and d.lang <> 'ja' and c.teachback is not null and c.teachback_ja is not null
        and not exists (select 1 from public.review_state v where v.kind = 'translation' and v.incident = d.id and v.ref = 'teachback:' || e.id)
      union all
      -- Live hand-off links nobody has opened yet, or that expire within two hours.
      select 'handoff', d.id, h.id::text, h.created_at, d.station, st.label->>'ja', d.fault, d.lang, d.status,
        jsonb_build_object('recipient', h.recipient, 'created_at', h.created_at, 'expires_at', h.expires_at, 'views', h.views)
      from ichido.handoff h join public.desk d on d.id = h.incident join public.station st on st.id = d.station
      where d.operator_id = me and h.revoked_at is null and h.expires_at > now()
        and (h.views = 0 or h.expires_at < now() + interval '2 hours')
        and not exists (select 1 from public.review_state v where v.kind = 'handoff' and v.incident = d.id and v.ref = h.id::text)
    ) q
  ), '[]');
end $$;

-- A decision on one item of the operator's own case, once. Accepting a suggestion goes through cmd_accept_suggestion.
create function public.cmd_review(p_uid uuid, p_name text, p_kind text, p_incident uuid, p_ref text, p_decision text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare d public.desk; valid boolean; note text := nullif(btrim(p_note), '');
begin
  select * into d from public.desk where id = p_incident for update;
  if not found then perform ichido.fail('not_found'); end if;
  if d.operator_id is distinct from p_uid then perform ichido.fail('forbidden'); end if;
  if note is not null and (p_kind <> 'record' or p_decision <> 'approved' or char_length(note) > 500) then perform ichido.fail('bad_request'); end if;
  valid := case p_kind
    when 'suggestion' then p_decision in ('accepted', 'dismissed') and d.finished_at is null
      and exists (select 1 from public.bot_suggestion s where s.incident = d.id and s.rev = d.confirmed_rev and s.rev::text = p_ref)
    when 'record' then p_decision in ('approved', 'dismissed') and p_ref = 'summary'
      and exists (select 1 from public.case_record r where r.incident = d.id and r.summary is not null)
    when 'translation' then p_decision in ('confirmed', 'flagged', 'dismissed') and d.finished_at is null and (
      (p_ref = 'words:' || d.confirmed_rev and d.caller_words_ja is not null)
      or (p_ref = 'teachback:' || (select max(e.id) from public.case_event e where e.incident = d.id and e.kind = 'teachback')
          and exists (select 1 from public.caller_card c where c.id = d.id and c.teachback_ja is not null)))
    when 'handoff' then p_decision in ('reissued', 'revoked', 'dismissed')
      and exists (select 1 from ichido.handoff h where h.id::text = p_ref and h.incident = d.id and h.revoked_at is null and h.expires_at > now())
    else false end;
  if not coalesce(valid, false) then perform ichido.fail('conflict'); end if;
  insert into public.review_state (kind, incident, ref, decision, note, reviewed_by, reviewer)
    values (p_kind, d.id, p_ref, p_decision, note, p_uid, p_name)
    on conflict do nothing;
  if not found then perform ichido.fail('conflict'); end if;
  -- Reissue and revoke write their own hand-off events.
  if p_kind <> 'handoff' or p_decision = 'dismissed' then
    perform ichido.event(d.id, 'operator', p_kind || '_' || p_decision, '{}', p_name);
  end if;
end $$;

-- Accept the prepared suggestion: the operator's own send (and dispatch) commands, in one transaction with the decision,
-- so accepting can never do more than the operator could do by hand, and never twice.
create function public.cmd_accept_suggestion(p_uid uuid, p_name text, p_incident uuid, p_rev int, p_intent text, p_manual text, p_needs_held boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare s public.bot_suggestion; r uuid; g uuid;
begin
  select * into s from public.bot_suggestion where incident = p_incident;
  if not found or s.rev <> p_rev or s.suggestion->>'intent' is distinct from p_intent then perform ichido.fail('conflict'); end if;
  r := public.cmd_send(p_uid, p_name, p_incident, p_intent, p_manual, p_needs_held);
  perform public.cmd_review(p_uid, p_name, 'suggestion', p_incident, p_rev::text, 'accepted');
  g := nullif(s.suggestion->'guard'->>'uid', '')::uuid;
  if coalesce((s.suggestion->>'dispatch')::boolean, false) and g is not null then
    perform public.cmd_assign(p_uid, p_name, p_incident, g);
  end if;
  return r;
end $$;

-- The Ichido Bot's numbers for /automation, over the last p_days days: counts and seconds only.
create function public.bot_stats(p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare since timestamptz;
begin
  if not ichido.has_role('operator') then perform ichido.fail('forbidden'); end if;
  if p_days not in (7, 14, 30) then perform ichido.fail('bad_request'); end if;
  since := now() - make_interval(days => p_days);
  return (
    with runs as (select d.id from public.desk d where d.created_at >= since and exists (select 1 from public.bot_step b where b.incident = d.id))
    select jsonb_build_object(
      'runs', (select count(*) from runs),
      'routed', (select count(*) from public.bot_step b join runs on runs.id = b.incident where b.step = 'route' and b.status = 'done'),
      'prepared', (select count(*) from public.bot_step b join runs on runs.id = b.incident where b.step = 'prepare' and b.status = 'done'),
      'reminded', (select count(*) from public.bot_step b join runs on runs.id = b.incident where b.step in ('remind_reply', 'remind_guard') and b.status = 'done'),
      'recorded', (select count(*) from public.bot_step b join runs on runs.id = b.incident where b.step = 'record' and b.status = 'done'),
      'first_reply_s', (select avg(r.first_reply_s) from public.case_record r join runs on runs.id = r.incident),
      'reply_target_s', (select seconds from ichido.sla_target where reason = 'no_reply'))
  );
end $$;

revoke all on function public.review_queue(), public.bot_stats(int) from public, anon;
grant execute on function public.review_queue(), public.bot_stats(int) to authenticated;
revoke all on function public.cmd_review(uuid, text, text, uuid, text, text, text),
  public.cmd_accept_suggestion(uuid, text, uuid, int, text, text, boolean) from public, anon, authenticated;
grant execute on function public.cmd_review(uuid, text, text, uuid, text, text, text),
  public.cmd_accept_suggestion(uuid, text, uuid, int, text, text, boolean) to service_role;
