begin;

-- Device voice: a Help Point with a microphone and speaker takes the phone's place in a case's voice session.
-- An operator starts it for an unclaimed AI case and picks the language. The server creates an anonymous user
-- for the device session and binds it like a paired phone, so the token, agent, front line and monitor paths
-- are the caller's own. binding.device names the station whose device owns the binding (null for a phone).
alter table ichido.binding add column if not exists device text references public.station on delete cascade;
-- For the operator view: the Help Point holds the case's voice session (set by start, cleared by stop).
alter table public.desk add column if not exists device_voice boolean not null default false;

-- An operator on a live, unbanned aal2 session (as monitor_voice checks). Returns the display name for the timeline.
create or replace function ichido.voice_operator(p_uid uuid,p_session uuid) returns text
language plpgsql stable security definer set search_path='' as $$
declare n text;
begin
  select st.display_name into n from auth_ba."session" s join auth_ba."user" u on u.id=s."userId"
    join ichido.staff st on st.uid=u.id
    where s.id=p_session and u.id=p_uid and not u.banned and st.role='operator' and s.aal='aal2' and s."expiresAt">clock_timestamp();
  if not found then perform ichido.fail('forbidden'); end if;
  return n;
end $$;

-- Start device voice. p_device is a fresh anonymous user the server created for this session.
-- Refuses a claimed, legacy, text-only or assisted case, and a case that already has a caller (phone or device).
create or replace function public.device_voice_start(p_uid uuid,p_session uuid,p_incident uuid,p_lang text,p_device uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare op text; d public.desk; dr public.draft; g uuid;
begin
  op:=ichido.voice_operator(p_uid,p_session);
  -- Voice languages only: Nepali has no speech recognition (web/content/catalogue.ts VOICE_LANGS).
  if p_lang is null or p_lang not in ('bn','vi','id','en','ja') then perform ichido.fail('bad_request'); end if;
  if not exists(select from auth.users where id=p_device and is_anonymous)
    or exists(select from ichido.staff where uid=p_device)
    or exists(select from ichido.binding where uid=p_device) then perform ichido.fail('forbidden'); end if;
  select * into d from public.desk where id=p_incident and finished_at is null for update;
  if not found then perform ichido.fail('not_found'); end if;
  if d.handler<>'ai' or d.operator_id is not null or d.text_only or d.assisted_source is not null
    then perform ichido.fail('conflict'); end if;
  delete from ichido.binding where incident=d.id and expires<=clock_timestamp();
  if exists(select from ichido.binding where incident=d.id) then perform ichido.fail('conflict'); end if;
  -- The device takes the case: no phone can pair with the code on its display any more.
  delete from ichido.pair_code where incident=d.id;
  delete from ichido.device_code where incident=d.id;
  -- A front-line client: the greeting trigger writes the AI greeting instead of downgrading the case to legacy.
  perform set_config('ichido.frontline_client','1',true);
  insert into ichido.binding(incident,uid,lang,expires,device)
    values(d.id,p_device,p_lang,clock_timestamp()+interval '30 minutes',d.station) returning voice_room into g;
  update public.desk set lang=p_lang,device_voice=true where id=d.id;
  update public.caller_card set lang=p_lang where id=d.id;
  perform ichido.event(d.id,'operator','paired',jsonb_build_object('lang',p_lang,'device',d.station),op);
  select * into strict dr from public.draft where incident=d.id;
  perform public.frontline_submit(p_device,g,gen_random_uuid(),dr.rev,'start',null,'{}'::jsonb,null,null);
  return g;
end $$;

-- Stop device voice: the binding goes (binding_state resets the draft); the caller deletes the room.
create or replace function public.device_voice_stop(p_uid uuid,p_session uuid,p_incident uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare op text; g uuid;
begin
  op:=ichido.voice_operator(p_uid,p_session);
  perform 1 from public.desk where id=p_incident for update;
  delete from ichido.binding where incident=p_incident and device is not null returning voice_room into g;
  if not found then perform ichido.fail('not_found'); end if;
  update public.desk set device_voice=false where id=p_incident;
  perform ichido.event(p_incident,'operator','device_voice_stopped','{}',op);
  return g;
end $$;

-- The device's live binding on its station's open case, for /api/device/voice and the button confirm.
create or replace function public.device_voice(p_station text) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('uid',b.uid,'incident',b.incident,'lang',b.lang,'expires',b.expires,
    'voice_room',b.voice_room,'rev',dr.rev,'triage',dr.triage,'fault',d.fault,'handler',d.handler)
  from public.desk d join ichido.binding b on b.incident=d.id and b.device=p_station
  join public.draft dr on dr.incident=d.id
  where d.station=p_station and d.finished_at is null and not d.text_only and b.expires>clock_timestamp()
$$;

-- A device has no screen to tap the AI's suggestions: the button press that confirms the spoken read-back
-- accepts the suggested taps of that revision. p_flags must come from draft.triage (exclusive taps resolved by
-- the caller of this function); they replace the caller card's flags.
create or replace function public.device_accept_triage(p_uid uuid,p_rev int,p_flags text[]) returns void
language plpgsql security definer set search_path='' as $$
declare d public.desk; dr public.draft; f text; current text[];
begin
  d:=ichido.caller_case(p_uid);
  if not exists(select from ichido.binding where incident=d.id and uid=p_uid and device is not null)
    then perform ichido.fail('forbidden'); end if;
  select * into strict dr from public.draft where incident=d.id;
  if dr.rev is distinct from p_rev or dr.triage is null then perform ichido.fail('conflict'); end if;
  if exists(select from unnest(coalesce(p_flags,'{}')) x where not coalesce(dr.triage->'taps','[]'::jsonb) ? x)
    then perform ichido.fail('forbidden'); end if;
  select flags into current from public.caller_card where id=d.id;
  foreach f in array coalesce(current,'{}') loop
    if not f = any(p_flags) then perform public.cmd_flag(p_uid,f,false); end if;
  end loop;
  foreach f in array coalesce(p_flags,'{}') loop perform public.cmd_flag(p_uid,f,true); end loop;
end $$;

-- The device's status poll gains voice=1 while its binding is live, so it joins the room.
create or replace function public.device_display(p_station text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'code', dc.code,
    'ttl', case when dc.code is not null then greatest(0, floor(extract(epoch from pc.expires - now())))::int end,
    'guard', nullif(cc.field_state, 'none'),
    'voice', case when b.incident is not null and not d.text_only then 1 end))
  from public.desk d
  join public.caller_card cc on cc.id = d.id
  left join ichido.pair_code pc on pc.incident = d.id and pc.expires > now()
  left join ichido.device_code dc on dc.incident = pc.incident and dc.digest = pc.digest
  left join ichido.binding b on b.incident = d.id and b.device = p_station and b.expires > now()
  where d.station = p_station and d.finished_at is null
$$;

-- The spoken hand-off is delivered once per voice room and AI epoch, whether a turn or the agent's state poll
-- returns it (web/app/api/livekit/frontline/route.ts). True the first time.
create table if not exists ichido.voice_farewell (
  generation uuid not null, epoch int not null, at timestamptz not null default now(), primary key (generation, epoch)
);
alter table ichido.voice_farewell enable row level security;
revoke all on ichido.voice_farewell from public,anon,authenticated,service_role;
create or replace function public.voice_farewell(p_generation uuid,p_epoch int) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  insert into ichido.voice_farewell(generation,epoch) values(p_generation,p_epoch) on conflict do nothing;
  return found;
end $$;

revoke all on function ichido.voice_operator(uuid,uuid), public.device_voice_start(uuid,uuid,uuid,text,uuid),
  public.device_voice_stop(uuid,uuid,uuid), public.device_voice(text), public.device_accept_triage(uuid,int,text[]),
  public.device_display(text), public.voice_farewell(uuid,int) from public,anon,authenticated;
grant execute on function public.device_voice_start(uuid,uuid,uuid,text,uuid), public.device_voice_stop(uuid,uuid,uuid),
  public.device_voice(text), public.device_accept_triage(uuid,int,text[]), public.device_display(text),
  public.voice_farewell(uuid,int) to service_role;

commit;
