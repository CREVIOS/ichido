-- A caller who picked the wrong language can switch while the case is open; the operator sees the change on the timeline.
create function public.cmd_set_lang(p_uid uuid, p_lang text) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.desk;
begin
  if p_lang not in ('bn', 'en', 'ja', 'vi', 'id', 'ne') then perform ichido.fail('bad_request'); end if;
  d := ichido.caller_case(p_uid);
  if d.lang is not distinct from p_lang then return; end if;
  update public.desk set lang = p_lang where id = d.id;
  update public.caller_card set lang = p_lang where id = d.id;
  update ichido.binding set lang = p_lang where uid = p_uid;
  perform ichido.event(d.id, 'caller', 'lang_changed', jsonb_build_object('from', d.lang, 'to', p_lang));
end $$;
revoke all on function public.cmd_set_lang(uuid, text) from public, anon, authenticated;
grant execute on function public.cmd_set_lang(uuid, text) to service_role;

-- The caller's confirmed words stay in their own language; staff get a labelled machine translation beside them.
alter table public.desk add column caller_words_ja text;
