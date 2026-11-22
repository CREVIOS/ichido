create table ichido.sla_target (
  reason text primary key check (reason in ('unclaimed', 'no_reply', 'guard_late')),
  seconds integer not null check (seconds > 0)
);
insert into ichido.sla_target values ('unclaimed', 60), ('no_reply', 180), ('guard_late', 600);

create table public.escalation (
  incident uuid not null references public.desk on delete cascade,
  level smallint not null default 1 check (level > 0),
  reason text not null references ichido.sla_target,
  at timestamptz not null default now(),
  primary key (incident, reason)
);
alter table ichido.sla_target enable row level security;
alter table public.escalation enable row level security;
revoke all on ichido.sla_target, public.escalation from public, anon, authenticated;
grant select on ichido.sla_target, public.escalation to authenticated, service_role;
grant insert on public.escalation to service_role;
create policy operator_targets on ichido.sla_target for select to authenticated
  using (ichido.has_role('operator'));
create policy staff_escalations on public.escalation for select to authenticated
  using (ichido.has_role('operator') or ichido.has_role('manager'));
alter publication supabase_realtime add table public.escalation;

create index reply_incident on public.reply (incident);

create function ichido.escalate_due() returns void
language plpgsql set search_path = '' as $$
declare
  d record;
begin
  -- Claims, replies and closure lock the desk. A busy case can wait for the next tick.
  for d in select id, operator_id, created_at from public.desk
           where finished_at is null order by id for no key update skip locked
  loop
    with timers(reason, started) as (
      select 'unclaimed', d.created_at where d.operator_id is null
      union all
      select 'no_reply', min(e.at) from public.case_event e
        where d.operator_id is not null and e.incident = d.id and e.kind = 'claimed'
          and not exists (select 1 from public.reply r where r.incident = d.id)
      union all
      select 'guard_late', job.updated_at from (
        select updated_at from public.field_job where incident = d.id
          and state = 'requested' and not case_closed for share skip locked
      ) job
    ), added as (
      insert into public.escalation (incident, reason)
        select d.id, reason from timers join ichido.sla_target using (reason)
        where started < now() - make_interval(secs => seconds)
        on conflict (incident, reason) do nothing
        returning incident, level, reason
    )
    insert into public.case_event (incident, actor, kind, data)
      select incident, 'system', 'escalated', jsonb_build_object('level', level, 'reason', reason)
      from added;
  end loop;
end $$;
revoke all on function ichido.escalate_due() from public, anon, authenticated;
grant execute on function ichido.escalate_due() to service_role;

create extension if not exists pg_cron;
select cron.schedule('ichido-escalate-due', '* * * * *', 'select ichido.escalate_due()');
