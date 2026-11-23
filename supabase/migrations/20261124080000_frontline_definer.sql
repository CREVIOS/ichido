-- Front-line trigger functions write tables that only the database itself may write (frontline_turn, caller_card,
-- the queue). They ran with the rights of whoever wrote the row, so a direct service-role update (for example the
-- triage or translation the server stores on desk) failed with "permission denied". Run them as their owner, like
-- every other trigger function here, and keep them uncallable from outside.
alter function ichido.frontline_owner() security definer;
alter function ichido.frontline_card() security definer;
alter function ichido.queue_frontline(uuid, integer, text) security definer;
alter function ichido.frontline_greeting() security definer;
alter function ichido.autonomous_allowed() security definer;
alter function ichido.withdraw_frontline_guidance() security definer;
alter function ichido.frontline_transition() security definer;
alter function ichido.frontline_human_reply() security definer;
revoke all on function ichido.frontline_owner(), ichido.frontline_card(), ichido.queue_frontline(uuid, integer, text),
  ichido.frontline_greeting(), ichido.autonomous_allowed(), ichido.withdraw_frontline_guidance(),
  ichido.frontline_transition(), ichido.frontline_human_reply() from public, anon, authenticated;
