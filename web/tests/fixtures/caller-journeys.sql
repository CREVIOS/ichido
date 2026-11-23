do $$
declare
  op uuid:=gen_random_uuid(); worker uuid:=gen_random_uuid(); phone uuid:=gen_random_uuid();
  station_id text:=gen_random_uuid()::text; shelter text:=gen_random_uuid()::text; i uuid; s uuid; r uuid; gen int;
begin
  insert into auth_ba."user"(id,email,name,role) values(op,op||'@example.invalid','Operator','operator'),(worker,worker||'@example.invalid','Worker','field');
  perform set_config('request.jwt.claims', jsonb_build_object('role','service_role')::text,true);
  insert into auth.users(id,is_anonymous) values(phone,true);
  insert into public.station(id,kind,label,branch,counter_hours,security_company) values
    (station_id,'atm','{}','{}','{}','fixture'),(shelter,'shelter','{}','{}','{}','fixture');
  i:=public.record_fault(station_id,md5(random()::text),'device','card_retained');
  perform public.cmd_claim(op,'Operator',i);
  begin
    perform public.assisted_intake(op,'Operator',i,'card_retained','bn','handset',false,'no','unknown','{}');
    assert false,'requires explicit consent';
  exception when raise_exception then assert sqlerrm='bad_request'; end;
  perform public.assisted_intake(op,'Operator',i,'card_retained','bn','handset',true,'no','unknown','{}');
  r:=public.cmd_send(op,'Operator',i,'HELD_WAIT_OR_LEAVE','retained-card/v2',true);
  perform public.assisted_delivery(op,'Operator',i,r,'in_person','আমি অপেক্ষা করব');
  assert (select status='guided' and assisted_source='handset' from public.desk where id=i);
  assert (select count(*)=2 from public.case_event where incident=i and kind in ('assisted_intake','assisted_delivery') and actor='operator');

  s:=public.record_fault(shelter,md5(random()::text),'device','shelter_needs');
  perform public.cmd_claim(op,'Operator',s);
  insert into ichido.binding(incident,uid,lang,expires) values(s,phone,'bn',now()+interval '2 hours');
  update public.desk set lang='bn' where id=s;
  perform public.cmd_flag(phone,'diet_allergy',true);
  perform public.cmd_flag(phone,'allergy_child',true);
  perform public.cmd_flag(phone,'helper',true);
  perform public.cmd_draft(phone,0,null,null,'পরিবারের খাবার',false);
  perform public.cmd_set_lang(phone,'ja');
  perform public.cmd_confirm(phone,1);
  assert (select caller_words_lang='bn' from public.desk where id=s);
  update ichido.staff set duty_station=shelter,duty_function='shelter',available=true where uid=worker;
  perform public.cmd_assign(op,'Operator',s,worker);
  select generation into gen from public.field_job where incident=s;
  assert (select allergy_flags=array['diet_allergy','allergy_child'] from public.field_job where incident=s);
  begin
    perform public.ack_allergy(op,s,gen,array['diet_allergy','allergy_child']);
    assert false,'only assigned worker';
  exception when raise_exception then assert sqlerrm='conflict'; end;
  begin
    perform public.ack_allergy(worker,s,gen-1,array['diet_allergy','allergy_child']);
    assert false,'stale assignment generation';
  exception when raise_exception then assert sqlerrm='conflict'; end;
  begin
    perform public.ack_allergy(worker,s,gen,array['diet_allergy']);
    assert false,'must acknowledge the exact confirmed choices';
  exception when raise_exception then assert sqlerrm='conflict'; end;
  perform public.cmd_field(worker,'Worker',s,gen,'accept',null);
  assert not ichido.work_fits(s,'SHELTER_NEEDS'),'worker has not acknowledged the allergy';
  perform public.ack_allergy(worker,s,gen,array['diet_allergy','allergy_child']);
  assert ichido.work_fits(s,'SHELTER_NEEDS');
  assert (select allergy_ack_at is not null from public.field_job where incident=s);
  perform public.cmd_field(worker,'Worker',s,gen,'on_way','10-20');
  assert public.caller_screen(phone)->'card'->>'eta_at' is not null;
  perform public.cmd_flag(phone,'allergy_child',false);
  assert (select allergy_flags=array['diet_allergy'] and allergy_ack_at is null from public.field_job where incident=s);
  perform public.cmd_reset_caller(op,'Operator',s);
  assert public.caller_screen(phone) is null;
  assert (select reason='replaced' from ichido.pair_end where uid=phone);
  assert (select reply_id is null and flags='{}' and confirmed_rev is null from public.caller_card where id=s);
  assert (select allergy_flags='{}' and allergy_ack_at is null from public.field_job where incident=s);
  -- Replacing a phone leaves the assigned work but starts the new intake with no previous person's facts.
  insert into ichido.binding(incident,uid,lang,expires) values(s,phone,'en',now()-interval '1 minute');
  assert public.caller_screen(phone) is null;
  delete from ichido.binding where incident=s;
  assert (select reason='expired' from ichido.pair_end where uid=phone);
  insert into ichido.binding(incident,uid,lang,expires) values(s,phone,'en',now()+interval '1 hour');
  perform public.cmd_abandon(op,'Operator',s);
  assert (select reason='abandoned' from ichido.pair_end where uid=phone);
  assert public.caller_screen(phone) is null;

  -- A bad code for a second visit cannot retire the caller's guided case.
  insert into ichido.binding(incident,uid,lang,expires) values(i,phone,'bn',now()+interval '1 hour');
  s:=public.cmd_display_press(shelter,md5(random()::text),'shelter_checkin','ABCDEF','fixture-digest');
  begin
    perform public.frontline_pair(phone,shelter,'wrong','ne',true);
    assert false,'bad second visit code accepted';
  exception when raise_exception then assert sqlerrm='forbidden'; end;
  assert public.caller_screen(phone)->'card'->>'id'=i::text;
  assert public.frontline_pair(phone,shelter,'fixture-digest','ne',true)=s;
  assert public.caller_screen(phone)->'card'->>'id'=s::text;
  assert public.caller_screen(phone)->'card'->>'confirmed_rev' is null;

  begin
    perform public.bank_update(op,'Operator',i,'contact_by',current_date+1,null);
    assert false,'callback requires an established channel';
  exception when raise_exception then assert sqlerrm='bad_request'; end;
  perform public.bank_update(op,'Operator',i,'contact_by',current_date+1,'phone');
  assert (select callback_channel='phone' from public.caller_card where id=i);
end $$;
