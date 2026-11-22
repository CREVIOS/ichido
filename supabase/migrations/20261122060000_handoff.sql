-- Read-only hand-off links: a case record for the bank, the police or the security company, instead of emailed files.
-- Only a SHA-256 of the token is stored; links expire and can be revoked; every view is written to the timeline.
create table ichido.handoff (
  id uuid primary key default gen_random_uuid(),
  incident uuid not null references public.desk on delete cascade,
  token_hash text not null unique,
  recipient text not null check (recipient in ('bank', 'police', 'security')),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  views int not null default 0
);
create index handoff_incident on ichido.handoff (incident);
alter table ichido.handoff enable row level security;
revoke all on ichido.handoff from public, anon, authenticated;
grant all on ichido.handoff to service_role;
