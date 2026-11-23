-- All actors and cases belong to this transaction. The test runner rolls it back.
create function pg_temp.refused(statement text, expected text) returns boolean language plpgsql as $$
begin
  execute statement;
  return false;
exception when raise_exception then
  if sqlerrm <> expected then raise; end if;
  return true;
end $$;

do $$
declare
  op uuid:=gen_random_uuid(); worker uuid:=gen_random_uuid(); backup uuid:=gen_random_uuid();
  session_id uuid:=gen_random_uuid(); caller uuid:=gen_random_uuid(); sub uuid:=gen_random_uuid();
  prefix text:=left(gen_random_uuid()::text,8); atm text:=prefix||'a'; rail text:=prefix||'r';
  shelter text:=prefix||'s'; a uuid; r uuid; s uuid; m uuid; reply_key uuid; job public.field_job;
  msg ichido.alert_outbox; counts jsonb; prior jsonb; start_at timestamptz; snap public.caller_card;
begin
  insert into auth_ba."user"(id,email,name,role) values
    (op,prefix||'op@example.invalid','Dispatch','operator'), (worker,prefix||'w@example.invalid','Worker','field'),
    (backup,prefix||'b@example.invalid','Backup','field');
  insert into auth_ba."session"(id,"userId","expiresAt","updatedAt",token,aal) values(session_id,op,now()+interval '2 hours',now(),gen_random_uuid()::text,'aal2');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',op,'session_id',session_id,'role','service_role')::text,true);
  insert into auth.users(id,is_anonymous) values(caller,true);
  insert into public.station(id,kind,label,branch,counter_hours,security_company) values
    (atm,'atm','{}','{}','{}','test'),(rail,'transit','{}','{}','{}','test'),(shelter,'shelter','{}','{}','{}','test');
  a:=public.record_fault(atm,replace(gen_random_uuid()::text,'-',''),'simulator','card_retained');
  r:=public.record_fault(rail,replace(gen_random_uuid()::text,'-',''),'simulator','transit_lost_item');
  s:=public.record_fault(shelter,replace(gen_random_uuid()::text,'-',''),'simulator','shelter_needs');
  assert not exists(select from public.desk where id in (r,s) and mass_incident is not null),'cross-pack grouping';
  perform public.cmd_claim(op,'Dispatch',a); perform public.cmd_claim(op,'Dispatch',r); perform public.cmd_claim(op,'Dispatch',s);
  insert into public.mass_incident default values returning id into m;
  update public.desk set mass_incident=m where id in (a,r,s);
  insert into ichido.binding(incident,uid,lang,expires) values(a,caller,'en',now()+interval '1 hour');
  assert (public.mass_preview(m)->>'eligible')::int=1,'paired ATM only';
  assert public.cmd_broadcast(op,'Dispatch',m)=1,'send eligibility';
  assert not exists(select from public.caller_card where id in (r,s) and notice='mass_leave'),'no bank notice outside ATM';
  assert pg_temp.refused(format('select public.cmd_disaster(%L,%L,%L,%L)',op,'Dispatch',array[atm,shelter],'earthquake'),'bad_request');
  assert (select disaster is null from public.station where id=atm),'mixed selection rolls back';

  update public.desk set card_back='no',confirmed_rev=1 where id=a;
  reply_key:=public.cmd_send(op,'Dispatch',a,'HELD_WAIT_OR_LEAVE','fixture',true);
  update public.caller_card set choice='wait',teachback='wait',teachback_reply=reply_key where id=a;
  perform public.cmd_remote_release(op,'Dispatch',a,'released');
  select * into snap from public.caller_card where id=a;
  assert snap.reply_id is null and snap.choice is null and snap.teachback is null and snap.teachback_reply is null and snap.notice='guidance_changed';
  perform public.cmd_send(op,'Dispatch',a,'HANDSET','fixture',false);
  assert (select notice is null from public.caller_card where id=a);
  perform public.cmd_fraud(op,'Dispatch',a,null);
  assert (select fraud from public.caller_card where id=a);
  assert not exists(select from public.field_job where incident=a);
  assert not exists(select from public.partner_work where incident=a);
  assert pg_temp.refused(format('select public.cmd_fraud(%L,%L,%L,null)',op,'Dispatch',r),'bad_request');
  perform public.cmd_fraud_safe(op,'Dispatch',a);
  assert (select not fraud from public.caller_card where id=a);
  assert (select state='review' from public.light where station=atm);

  update ichido.staff set duty_station=shelter,duty_function='shelter',available=true where uid in(worker,backup);
  assert not exists(select from public.available_responders(a) where uid=worker);
  update ichido.staff set duty_function='transit' where uid=worker;
  assert not exists(select from public.available_responders(s) where uid=worker);
  update ichido.staff set duty_function='shelter',available=false where uid=worker;
  assert pg_temp.refused(format('select public.cmd_assign(%L,%L,%L,%L)',op,'Dispatch',s,worker),'bad_request');
  update ichido.staff set available=true where uid=worker;
  perform public.cmd_assign(op,'Dispatch',s,worker);
  assert not ichido.work_fits(s,'SHELTER_NEEDS');
  assert exists(select from public.my_external_work() where incident=s and task='field_unack');
  select * into msg from ichido.alert_outbox where incident=s and kind='field_job';
  -- An isolated test message sorts ahead of any queued application messages.
  insert into ichido.alert_outbox(id,incident,kind,station,target,generation) overriding system value
    values (-msg.id,s,'field_job',shelter,worker,1);
  update ichido.alert_outbox set at=now()-interval '2 hours' where id=-msg.id;
  perform ichido.expire_alerts();
  select * into msg from public.alert_take(1);
  assert msg.lease is not null and msg.generation=1;
  assert (select available_at>now() from ichido.alert_outbox where id=msg.id);
  perform public.alert_settle(msg.id,msg.lease,'{}',true);
  assert (select lease is null and available_at>now() from ichido.alert_outbox where id=msg.id);
  update ichido.alert_outbox set available_at=now() where id=msg.id;
  select * into msg from public.alert_take(1);
  perform public.alert_settle(msg.id,msg.lease,array[sub],false);
  assert (select provider_at is not null and acknowledged_at is null from public.field_job where incident=s);
  assert not exists(select from ichido.alert_outbox where id=msg.id);
  perform public.cmd_field(worker,'Worker',s,1,'help',null);
  assert not ichido.work_fits(s,'SHELTER_NEEDS') and (select acknowledged_at is not null from public.field_job where incident=s);
  perform public.cmd_field(worker,'Worker',s,1,'accept',null);
  assert ichido.work_fits(s,'SHELTER_NEEDS') and not ichido.work_fits(s,'SHELTER_STAFF_COMING');
  perform public.cmd_field(worker,'Worker',s,1,'help',null);
  assert (select help_at is not null from public.field_job where incident=s);
  perform public.cmd_field(worker,'Worker',s,1,'decline',null);
  assert not ichido.work_fits(s,'SHELTER_NEEDS');
  perform public.cmd_assign(op,'Dispatch',s,backup);
  assert exists(select from public.field_standdown where incident=s and assignee=worker);
  assert pg_temp.refused(format('select public.cmd_field(%L,%L,%L,2,%L,null)',backup,'Backup',s,'done'),'conflict');
  perform public.cmd_field(backup,'Backup',s,2,'on_way','10-20');
  assert ichido.work_fits(s,'SHELTER_STAFF_COMING');

  update public.caller_card set flags='{leave_soon,share_item,item_bag}',confirmed_rev=1 where id=r;
  update public.caller_card set flags=array_append(flags,'item_in_station') where id=r;
  assert (select not 'item_in_station'=any(confirmed_flags) from public.caller_card where id=r);
  update public.caller_card set flags=array_remove(flags,'item_bag') where id=r;
  update public.caller_card set flags=array_append(flags,'item_bag') where id=r;
  assert (select not 'item_bag'=any(confirmed_flags) from public.caller_card where id=r);
  update public.desk set confirmed_rev=1 where id=r;
  assert pg_temp.refused(format('select public.cmd_send(%L,%L,%L,%L,%L,false)',op,'Dispatch',r,'TRANSIT_LEAVE','fixture'),'conflict');
  perform public.prepare_handoff(op,r,replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),'railway',now()+interval '2 hours');
  assert exists(select from public.my_external_work() where incident=r and task='railway');
  assert pg_temp.refused(format('select public.partner_progress(%L,%L,%L,%L,%L,%L)',op,'Dispatch',r,'railway','accept','JR-ABC'),'conflict');
  perform public.partner_progress(op,'Dispatch',r,'railway','request',null);
  perform public.partner_progress(op,'Dispatch',r,'railway','accept','JR-ABC');
  reply_key:=public.cmd_send(op,'Dispatch',r,'TRANSIT_LEAVE','fixture',false);
  assert (select slots->>'reference'='JR-ABC' from public.reply where id=reply_key);
  assert not exists(select from public.my_external_work() where incident=r);

  perform public.ops_field_promise(s,2,'on_way',now()-interval '5 minutes');
  update public.desk set status='guided',finished_at=now() where id=s;
  assert exists(select from public.my_external_work() where incident=s and task='field' and due_at<now());
  assert public.ops_promise_expire((select id from public.promise where incident=s and kind='eta' and settled_at is null))='expired';
  assert exists(select from public.my_external_work() where incident=s and task='field' and due_at<now());
  perform public.cmd_field(backup,'Backup',s,2,'arrived',null);
  perform public.cmd_field(backup,'Backup',s,2,'done',null);
  assert not exists(select from public.my_external_work() where incident=s);
  select b.start_at into start_at from ichido.report_bounds(0) b;
  assert extract(isodow from start_at at time zone 'Asia/Tokyo')=1;
  assert (select b.end_at-b.start_at=interval '7 days' from ichido.report_bounds(0) b); -- completed JST week
  prior:=public.shift_insights(0);
  update public.desk set created_at=start_at+interval '1 hour' where id in(r,s);
  counts:=public.shift_insights(0);
  assert (counts->'funnel'->>'received')::int=(prior->'funnel'->>'received')::int+2;
  assert (counts->>'unanswered')::int=(prior->>'unanswered')::int+1;
  assert (counts->>'partner_accepted')::int=(prior->>'partner_accepted')::int+1;
  assert jsonb_array_length(counts->'per_day')=7 and counts?'rating_eligible' and counts?'field_done';
end $$;
