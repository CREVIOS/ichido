do $$
declare
 uid1 uuid:=gen_random_uuid(); stranger uuid:=gen_random_uuid(); op uuid:=gen_random_uuid();
 site text:=gen_random_uuid()::text; i uuid; g uuid; lease jsonb; scope jsonb; r uuid; req uuid; a jsonb; rev int; seq1 bigint;
 manual constant text:='retained-card/v2'; scenario text;
begin
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 update ichido.ops_setting set value=0 where key='qa_sample';
 insert into auth.users(id,is_anonymous) values(uid1,true),(stranger,true);
 insert into auth_ba."user"(id,email,name,role) values(op,op||'@example.invalid','Operator','operator');
 insert into public.station(id,kind,label,branch,counter_hours,security_company) values(site,'shelter','{}','{}','{}','fixture');
 foreach scenario in array array['partial','takeover','nepali','closed','expired','full','screen'] loop
   i:=public.cmd_display_press(site,md5(random()::text),'shelter_checkin','ABCDEF',md5(site));
   perform public.frontline_pair(uid1,site,md5(site),'en',true);
   select voice_room into g from ichido.binding where uid=uid1;
   perform public.frontline_submit(uid1,g,gen_random_uuid(),0,'start',null,'{}',null,null);
   if scenario<>'screen' then
     lease:=public.voice_begin(uid1,g,'en');
     scope:=jsonb_build_object('session',lease->'session','uid',uid1,'generation',g,'job','job','lang','en','epoch',lease->'epoch','incident',i);
     req:=gen_random_uuid();
     a:=public.voice_submit(scope,uid1,g,req,0,'text','local fixture','{}',null,null);
     assert (public.voice_submit(scope,uid1,g,req,0,'text','local fixture','{}',null,null)->>'replay')::boolean;
     assert (select channel='voice' from public.frontline_turn where incident=i and request_id=req);
     assert public.voice_finish(scope,uid1,g,req,'readback','{}',null,null,null,manual);
   end if;
   select dr.rev into rev from public.draft dr where incident=i;
   req:=gen_random_uuid();
   a:=public.frontline_submit(uid1,g,req,rev,'tap',null,'{"flag":"need_news","on":true,"off":[]}',null,null);
   perform public.frontline_finish(uid1,g,req,'readback','{}',null,null,null,manual);
   select dr.rev into rev from public.draft dr where incident=i;
   req:=gen_random_uuid();
   perform public.frontline_submit(uid1,g,req,rev,'confirm',null,'{}',null,null);
   assert public.frontline_finish(uid1,g,req,'SHELTER_INFO','{}',null,null,null,manual);
   select reply_id,seq into r,seq1 from public.frontline_turn where incident=i and request_id=req and speaker='ai';
   update ichido.ops_setting set value=1 where key='ai_closure';
   begin perform public.resolve_info(uid1,r,rev,'en',true,manual); assert false,'undelivered';
   exception when raise_exception then assert sqlerrm='conflict'; end;
   begin update public.desk set status='guided' where id=i; assert false,'direct close lacks acknowledgement';
   exception when raise_exception then assert sqlerrm='conflict'; end;
   if scenario='screen' then
     assert public.info_delivery(uid1,r,rev,'en',manual);
     update ichido.ops_setting set value=0 where key='ai_closure';
     begin perform public.resolve_info(uid1,r,rev,'en',true,manual); assert false,'pilot disabled';
     exception when raise_exception then assert sqlerrm='conflict'; end;
     update ichido.ops_setting set value=1 where key='ai_closure';
     begin perform public.resolve_info(uid1,r,rev+1,'en',true,manual); assert false,'changed revision';
     exception when raise_exception then assert sqlerrm='conflict'; end;
     begin perform public.resolve_info(uid1,r,rev,'en',false,manual); assert false,'explicit answer required';
     exception when raise_exception then assert sqlerrm='conflict'; end;
     insert into public.promise(incident,kind,due_at) values(i,'recheck',now()+interval '1 hour');
     begin perform public.resolve_info(uid1,r,rev,'en',true,manual); assert false,'outstanding action';
     exception when raise_exception then assert sqlerrm='conflict'; end;
     update public.promise set settled_at=now() where incident=i;
     assert public.resolve_info(uid1,r,rev,'en',true,manual)=g;
     assert (select resolved_by='ai' and finished_at is not null from public.desk where id=i);
     assert (select reason='closure' from ichido.frontline_qa where incident=i);
     assert exists(select from ichido.follow_up where incident=i and uid=uid1);
     begin perform public.recontact(stranger,i); assert false,'foreign receipt';
     exception when raise_exception then assert sqlerrm='forbidden'; end;
     perform public.followup_rate(uid1,i,1);
     assert (select reason='dispute' from ichido.frontline_qa where incident=i);
     perform public.recontact(uid1,i);
     perform public.recontact(uid1,i);
     assert (select reason='recontact' from ichido.frontline_qa where incident=i);
     assert exists(select from ichido.binding b join public.desk d on d.id=b.incident
        where b.uid=uid1 and b.incident<>i and d.handler='queued');
     continue;
   end if;
   assert not public.info_delivery(uid1,r,rev,'en',manual),'reading cannot override a voice delivery';
   perform public.voice_step(scope,'play',seq1);
   if scenario='full' then
     perform public.voice_step(scope,'full',seq1);
     assert public.info_delivery(uid1,r,rev,'en',manual);
     assert public.resolve_info(uid1,r,rev,'en',true,manual)=g;
     continue;
   end if;
   if scenario='expired' then update ichido.binding set voice_expires=now()-interval '1 second' where uid=uid1;
   elsif scenario='partial' then perform public.voice_step(scope,'partial',seq1);
   elsif scenario='takeover' then perform public.frontline_takeover(op,'Operator',i,(lease->>'epoch')::int);
   elsif scenario='nepali' then perform public.cmd_set_lang(uid1,'ne');
   else perform public.voice_step(scope,'end');
   end if;
   begin perform public.voice_step(scope,'full',seq1); assert false,'obsolete playout';
   exception when raise_exception then assert sqlerrm in ('forbidden','conflict'); end;
   begin perform public.resolve_info(uid1,r,rev,'en',true,manual); assert false,'partial or revoked';
   exception when raise_exception then assert sqlerrm='conflict'; end;
   delete from public.desk where id=i;
 end loop;
end $$;
