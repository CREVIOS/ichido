do $$
declare
 phone uuid:=gen_random_uuid(); manager uuid:=gen_random_uuid(); op uuid:=gen_random_uuid();
 ms uuid:=gen_random_uuid(); os uuid:=gen_random_uuid(); site text:=gen_random_uuid()::text;
 i uuid; g uuid; r uuid; req uuid; seq1 bigint; rev int; l text; sample_count int; listed jsonb; m jsonb; lease jsonb;
 prior jsonb; receipts uuid[]; start_count int; oldtime timestamptz:=now()-interval '8 days';
begin
 insert into auth.users(id,is_anonymous) values(phone,true);
 insert into auth_ba."user"(id,email,name,role) values
   (manager,manager||'@example.invalid','QA','manager'),(op,op||'@example.invalid','Operator','operator');
 insert into auth_ba."session"(id,"userId","expiresAt",token,aal,"updatedAt") values
   (ms,manager,now()+interval '1 hour',ms::text,'aal2',now()),(os,op,now()+interval '1 hour',os::text,'aal2',now());
 insert into public.station(id,kind,label,branch,counter_hours,security_company) values(site,'shelter','{}','{}','{}','fixture');
 delete from ichido.qa_stratum where pack='shelter' and locale in ('en','bn');
 update ichido.ops_setting set value=1 where key in ('qa_sample','ai_closure');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',manager,'session_id',ms)::text,true);
 prior:=public.frontline_insights(7);
 start_count:=(prior->>'started')::int;
 assert not has_function_privilege('authenticated','public.resolve_info(uuid,uuid,int,text,boolean,text)','execute');
 assert not has_function_privilege('anon','public.voice_step(jsonb,text,bigint)','execute');
 assert not has_table_privilege('authenticated','ichido.ai_resolution','select');
 foreach l in array array['en','bn'] loop
   for k in 1..10 loop
     i:=public.cmd_display_press(site,md5(random()::text),'shelter_checkin','ABCDEF',md5(site));
     perform public.frontline_pair(phone,site,md5(site),l,true);
     select voice_room into g from ichido.binding where uid=phone;
     perform public.frontline_submit(phone,g,gen_random_uuid(),0,'start',null,'{}',null,null);
     req:=gen_random_uuid();
     perform public.frontline_submit(phone,g,req,0,'tap',null,'{"flag":"need_news","on":true,"off":[]}',null,null);
     perform public.frontline_finish(phone,g,req,'readback','{}',null,null,null,'retained-card/v2');
     select dr.rev into rev from public.draft dr where dr.incident=i;
     req:=gen_random_uuid();
     perform public.frontline_submit(phone,g,req,rev,'confirm',null,'{}',null,null);
     assert public.frontline_finish(phone,g,req,'SHELTER_INFO','{}',null,null,null,'retained-card/v2');
     select reply_id into r from public.frontline_turn where incident=i and request_id=req and speaker='ai';
     if l='bn' and k=10 then
       lease:=public.monitor_voice(op,os,i);
       assert (lease->>'expires')::timestamptz<=clock_timestamp()+interval '60 seconds';
       begin perform public.monitor_voice(manager,ms,i); assert false,'manager cannot listen';
       exception when raise_exception then assert sqlerrm='forbidden'; end;
       insert into public.frontline_turn(incident,generation,request_id,speaker,locale,words,wording,rev,epoch,at)
         values(i,g,gen_random_uuid(),'caller',l,'PRIVATE retention fixture','text',0,0,oldtime) returning seq into seq1;
       insert into public.frontline_translation values(seq1,'PRIVATE translation');
       assert not exists(select from public.frontline_translation where seq=seq1),'late translation dropped';
       update public.desk set caller_words='PRIVATE retention fixture',caller_words_ja='PRIVATE translation',ai_summary='PRIVATE summary',ai_summary_at=oldtime where id=i;
       update public.draft set words='PRIVATE retention fixture' where incident=i;
       perform ichido.purge_frontline_words();
       assert (select words is null and wording='text' from public.frontline_turn where seq=seq1);
       assert (select caller_words is null and caller_words_ja is null and ai_summary is null from public.desk where id=i);
       assert (select words is null from public.draft where incident=i);
     end if;
     assert public.info_delivery(phone,r,rev,l,'retained-card/v2');
     perform public.resolve_info(phone,r,rev,l,true,'retained-card/v2');
   end loop;
   select count(*) into sample_count from ichido.frontline_qa q join public.desk d on d.id=q.incident
     where d.station=site and d.lang=l;
   assert sample_count=1,'one random closure for each ten in this language and pack';
 end loop;
 assert exists(select from public.expired_monitors() where id=(lease->>'lease')::uuid);
 m:=public.frontline_insights(7);
 assert (m->>'started')::int=start_count+20;
 assert (m->>'resolved')::int=(prior->>'resolved')::int+20;
 assert (m->>'open')::int=(prior->>'open')::int;
 select array_agg(d.id order by r.acknowledged_at) into receipts from public.desk d join ichido.ai_resolution r on d.id=r.incident where d.station=site;
 update ichido.ai_resolution set acknowledged_at=now()-interval '26 hours',delivered_at=now()-interval '26 hours 1 minute'
   where incident=any(receipts[1:3]);
 update ichido.ai_resolution set recontact_at=acknowledged_at+interval '23 hours' where incident=receipts[1];
 update ichido.ai_resolution set recontact_at=acknowledged_at+interval '25 hours' where incident=receipts[2];
 update ichido.follow_up set expires=now()-interval '4 hours' where incident=receipts[3];
 m:=public.frontline_insights(7);
 assert (m->>'mature')::int=(prior->>'mature')::int+3;
 assert (m->>'covered')::int=(prior->>'covered')::int+2;
 assert (m->>'recontact')::int=(prior->>'recontact')::int+1;
 perform public.frontline_qa(op,os,'safety_miss',i);
 listed:=public.frontline_qa(manager,ms,'list');
 assert exists(select from jsonb_array_elements(listed) row where row->>'incident'=i::text and row->>'reason'='safety_miss');
 assert listed::text not like '%PRIVATE%';
 begin perform public.frontline_qa(op,os,'list'); assert false,'operator cannot read QA';
 exception when raise_exception then assert sqlerrm='forbidden'; end;
 for k in 1..2 loop
   i:=public.cmd_display_press(site,md5(random()::text),'shelter_checkin','ABCDEF',md5(site));
   perform public.frontline_pair(phone,site,md5(site),'en',true);
   select voice_room into g from ichido.binding where uid=phone;
   perform public.frontline_submit(phone,g,gen_random_uuid(),0,'start',null,'{}',null,null);
   perform public.frontline_submit(phone,g,gen_random_uuid(),0,'tap',null,'{"flag":"need_news","on":true,"off":[]}',null,null);
   select dr.rev into rev from public.draft dr where dr.incident=i;
   perform public.frontline_submit(phone,g,gen_random_uuid(),rev,'confirm',null,'{}',null,null);
   perform public.cmd_human(phone);
   perform public.frontline_takeover(op,'Operator',i,null);
   update public.desk set queued_at=now()-interval '10 minutes' where id=i;
   insert into public.reply(incident,operator_id,intent,manual_version,sent_at) values
     (i,op,'SHELTER_INFO','retained-card/v2',now()-interval '10 minutes'+make_interval(secs=>10*k));
   perform public.cmd_abandon(op,'Operator',i);
 end loop;
 m:=public.frontline_insights(7);
 assert (m->>'abandoned')::int=(prior->>'abandoned')::int+2;
 assert (m->>'contact_n')::int=(prior->>'contact_n')::int+2;
 assert (m->'escalations'->>'human_request')::int=coalesce((prior->'escalations'->>'human_request')::int,0)+2;
 if (prior->>'contact_n')::int=0 then
   assert (m->>'contact_p50')::numeric=15 and (m->>'contact_p95')::numeric=19.5;
 end if;
 update auth_ba."session" set "expiresAt"=now()-interval '1 second' where id=ms;
 begin perform public.frontline_qa(manager,ms,'list'); assert false,'expired manager';
 exception when raise_exception then assert sqlerrm='forbidden'; end;
end $$;
