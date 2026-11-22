-- A stable order for the guard's list: when this guard got the job (set on assignment and reassignment),
-- so cards don't jump when the guard taps "on the way" or "arrived".
alter table public.field_job add column assigned_at timestamptz not null default now();

create function ichido.field_job_assigned_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.assignee is distinct from old.assignee or new.generation is distinct from old.generation then
    new.assigned_at := now();
  end if;
  return new;
end $$;

create trigger field_job_assigned_at before insert or update on public.field_job
  for each row execute function ichido.field_job_assigned_at();
