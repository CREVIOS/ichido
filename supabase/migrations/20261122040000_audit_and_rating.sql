-- 1. The case timeline is an audit trail: no role may change or remove an event once written.
create function ichido.case_event_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- A delete is allowed only as part of removing the whole case (ON DELETE CASCADE), never on its own.
  if tg_op = 'DELETE' and not exists (select 1 from public.desk where id = old.incident) then return old; end if;
  raise exception 'case_event is append-only' using errcode = 'P0001', detail = 'forbidden';
end $$;

create trigger case_event_append_only before update or delete on public.case_event
  for each row execute function ichido.case_event_append_only();

-- 2. One-tap rating after a guided case closes: three faces, no free text, counted in insights.
alter table public.caller_card add column rating smallint check (rating between 1 and 3);

create function public.cmd_rate(p_uid uuid, p_rating int) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.desk;
begin
  if p_rating not between 1 and 3 then perform ichido.fail('bad_request'); end if;
  select d2.* into d from public.desk d2 join ichido.binding b on b.incident = d2.id
    where b.uid = p_uid and b.expires > now() for update of d2;
  if not found then perform ichido.fail('forbidden'); end if;
  if d.finished_at is null or d.status <> 'guided' then perform ichido.fail('conflict'); end if;
  update public.caller_card set rating = p_rating where id = d.id and rating is null;
  if not found then perform ichido.fail('conflict'); end if;
  perform ichido.event(d.id, 'caller', 'rated', jsonb_build_object('rating', p_rating));
end $$;

revoke all on function public.cmd_rate(uuid, int) from public, anon, authenticated;
grant execute on function public.cmd_rate(uuid, int) to service_role;

-- 3. Insights carries the rating counts alongside everything else.
create or replace function public.insights_ratings(p_days int default 14)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  tz constant text := 'Asia/Tokyo';
  since timestamptz;
begin
  if not (ichido.has_role('operator') or ichido.has_role('manager')) then perform ichido.fail('forbidden'); end if;
  if p_days not in (7, 14, 30) then perform ichido.fail('bad_request'); end if;
  since := (date_trunc('day', now() at time zone tz) - make_interval(days => p_days - 1)) at time zone tz;
  return (
    select coalesce(jsonb_object_agg(rating, n), '{}')
    from (select cc.rating, count(*) as n from public.caller_card cc join public.desk d on d.id = cc.id
          where d.created_at >= since and cc.rating is not null group by 1) x
  );
end $$;
revoke all on function public.insights_ratings(int) from public, anon;
grant execute on function public.insights_ratings(int) to authenticated;
