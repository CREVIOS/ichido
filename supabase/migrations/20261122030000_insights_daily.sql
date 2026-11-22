-- Insights v2: per-day guided count and median time to first reply, for the daily line chart.

create or replace function public.insights(p_days int default 14)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  tz constant text := 'Asia/Tokyo';
  since timestamptz;
begin
  if not (ichido.has_role('operator') or ichido.has_role('manager')) then perform ichido.fail('forbidden'); end if;
  if p_days not in (7, 14, 30) then perform ichido.fail('bad_request'); end if;
  since := (date_trunc('day', now() at time zone tz) - make_interval(days => p_days - 1)) at time zone tz;
  return (
    with c as (
      select d.*,
        exists (select 1 from public.case_event e where e.incident = d.id and e.kind = 'claimed') as claimed,
        exists (select 1 from public.reply r where r.incident = d.id) as replied,
        exists (select 1 from public.field_job f where f.incident = d.id) as dispatched
      from public.desk d where d.created_at >= since
    )
    select jsonb_build_object(
      'since', since,
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
          'first_reply_s', (select percentile_cont(0.5) within group (order by extract(epoch from r.first - c.created_at))
             from c join (select incident, min(sent_at) as first from public.reply group by incident) r on r.incident = c.id
             where (c.created_at at time zone tz)::date = g::date)
        ) order by g), '[]')
        from generate_series((since at time zone tz)::date, (now() at time zone tz)::date, interval '1 day') g),
      'per_hour', (
        select jsonb_agg(jsonb_build_object('hour', h, 'n',
          (select count(*) from c where extract(hour from c.created_at at time zone tz) = h)) order by h)
        from generate_series(0, 23) h),
      'languages', (
        select coalesce(jsonb_object_agg(lang, n), '{}')
        from (select coalesce(lang, 'none') as lang, count(*) as n from c group by 1) x),
      'median_first_reply_s', (
        select percentile_cont(0.5) within group (order by extract(epoch from r.first - c.created_at))
        from c join (select incident, min(sent_at) as first from public.reply group by incident) r on r.incident = c.id),
      'choices', (
        select coalesce(jsonb_object_agg(choice, n), '{}')
        from (select cc.choice, count(*) as n from public.caller_card cc join c on c.id = cc.id
              where cc.choice is not null group by 1) x)
    ) from c
  );
end $$;
