-- Transaction-only proof. An existing confirmed owner acts solely within a
-- new synthetic organization; every temporary row is removed by ROLLBACK.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE FUNCTION pg_temp.irp171_expect_rejection(p_sql text,p_code text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE rejected boolean:=false;
BEGIN
 IF p_code IS NULL THEN RAISE EXCEPTION 'A rejection code is required';END IF;
 BEGIN EXECUTE p_sql;
 EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE IS DISTINCT FROM p_code THEN RAISE;END IF;
  rejected:=true;
 END;
 -- Outside the catch: a successful command can never satisfy its own test.
 IF NOT rejected THEN RAISE EXCEPTION 'Expected rejection did not occur' USING ERRCODE='P0004';END IF;
END $$;
DO $helper_test$
DECLARE caught boolean:=false;
BEGIN
 BEGIN PERFORM pg_temp.irp171_expect_rejection('SELECT 1','P0001');
 EXCEPTION WHEN SQLSTATE 'P0004' THEN caught:=true;END;
 IF NOT caught THEN RAISE EXCEPTION 'Rejection helper accepted successful SQL';END IF;
 PERFORM pg_temp.irp171_expect_rejection('DO $e$ BEGIN RAISE EXCEPTION ''Intended test rejection'' USING ERRCODE=''P0001'';END $e$','P0001');
 caught:=false;
 BEGIN PERFORM pg_temp.irp171_expect_rejection('DO $e$ BEGIN RAISE EXCEPTION ''Wrong test rejection'' USING ERRCODE=''42501'';END $e$','P0001');
 EXCEPTION WHEN SQLSTATE '42501' THEN caught:=true;END;
 IF NOT caught THEN RAISE EXCEPTION 'Rejection helper accepted the wrong SQLSTATE';END IF;
END $helper_test$;
SELECT 'turnover_rejection_helper_self_test_passed' AS verification;
CREATE FUNCTION pg_temp.irp171_finish(p_tenant uuid,p_property uuid,p_task jsonb,p_business_date date) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE x jsonb;checks jsonb;
BEGIN
 x:=public.irp_pms_pilot_update_turnover(p_tenant,p_property,(p_task->>'id')::uuid,gen_random_uuid(),(p_task->>'version')::bigint,(p_task->>'room_state_version')::bigint,p_business_date,'start','{}');
 SELECT jsonb_object_agg(item->>'key',true) INTO checks FROM jsonb_array_elements(x->'task'->'checklist') item;
 x:=public.irp_pms_pilot_update_turnover(p_tenant,p_property,(x->'task'->>'id')::uuid,gen_random_uuid(),(x->'task'->>'version')::bigint,(x->'room'->>'state_version')::bigint,p_business_date,'submit_cleaning',jsonb_build_object('checklist',checks));
 RETURN public.irp_pms_pilot_update_turnover(p_tenant,p_property,(x->'task'->>'id')::uuid,gen_random_uuid(),(x->'task'->>'version')::bigint,(x->'room'->>'state_version')::bigint,p_business_date,'approve_inspection',jsonb_build_object('work_reviewed',true,'room_ready',true));
END $$;
DO $setup$
DECLARE actor uuid;t uuid:=gen_random_uuid();
BEGIN
 SELECT u.id INTO actor FROM auth.users u JOIN irp_pms.memberships m ON m.user_id=u.id WHERE m.tenant_id='faa76112-c793-43db-92bd-f9faecd8d93a' AND m.role='owner' AND u.email_confirmed_at IS NOT NULL ORDER BY u.id LIMIT 1;
 IF actor IS NULL THEN RAISE EXCEPTION 'Confirmed test organization owner required';END IF;
 INSERT INTO irp_pms.tenants(id,name) VALUES(t,'Transaction-only171 turnover');
 INSERT INTO irp_pms.memberships(tenant_id,user_id,role) VALUES(t,actor,'owner');
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);PERFORM set_config('irp171.actor',actor::text,true);PERFORM set_config('irp171.tenant',t::text,true);
END $setup$;
SET LOCAL ROLE authenticated;
DO $home$
DECLARE t uuid:=current_setting('irp171.tenant')::uuid;actor uuid:=current_setting('irp171.actor')::uuid;p uuid;rt uuid;room uuid;d date;home jsonb;w jsonb;x jsonb;made jsonb;done jsonb;created_request uuid:=gen_random_uuid();version bigint;booking jsonb;report jsonb;
BEGIN
 home:=public.irp_pms_pilot_create_property(t,gen_random_uuid(),'Temporary171 home','UTC','whole_home',4);p:=(home->>'property_id')::uuid;rt:=(home->>'room_type_id')::uuid;room:=(home->>'room_id')::uuid;
 w:=public.irp_pms_pilot_workspace(t,p);d:=(w->>'business_date')::date;version:=(w->'rooms'->0->>'state_version')::bigint;
 PERFORM public.irp_pms_pilot_set_capacity(t,p,rt,d,d+5,1);
 made:=public.irp_pms_pilot_create_turnover(t,p,room,created_request,version,d,d,actor,'Synthetic171 home preparation');
 IF made->'task'->>'creation_operating_model' IS DISTINCT FROM 'whole_home' OR jsonb_array_length(made->'task'->'checklist') IS DISTINCT FROM 6 OR (made->'room'->>'state_version')::bigint IS DISTINCT FROM version+1 THEN RAISE EXCEPTION 'Home checklist or Dirty revision is wrong';END IF;
 PERFORM pg_temp.irp171_expect_rejection(format('SELECT public.irp_pms_pilot_create_turnover(%L,%L,%L,%L,%L,%L,%L,%L,%L)',t,p,room,gen_random_uuid(),version,d-1,d,actor,'Stale171 create'),'PT409');
 PERFORM pg_temp.irp171_expect_rejection(format('SELECT public.irp_pms_pilot_update_turnover(%L,%L,%L,%L,1,%L,%L,''start'',''{}''::jsonb)',t,p,made->'task'->>'id',gen_random_uuid(),version+1,d-1),'PT412');
 PERFORM pg_temp.irp171_expect_rejection(format('SELECT public.irp_pms_pilot_set_housekeeping(%L,%L,%L,%L,%L,''Clean'')',t,p,room,gen_random_uuid(),version+1),'P0001');
 done:=pg_temp.irp171_finish(t,p,made->'task',d);
 IF done->'task'->>'state' IS DISTINCT FROM 'completed' OR done->'room'->>'housekeeping' IS DISTINCT FROM 'Clean' THEN RAISE EXCEPTION 'Whole-home cleaning/inspection did not complete';END IF;
 x:=public.irp_pms_pilot_create_turnover(t,p,room,created_request,version,d,d,actor,'Synthetic171 home preparation');
 IF x IS DISTINCT FROM made||jsonb_build_object('replayed',true) THEN RAISE EXCEPTION 'Create original receipt was not preserved';END IF;
 booking:=public.irp_pms_pilot_create_reservation(t,p,gen_random_uuid(),rt,'Synthetic171 checked-out home',d,d+2,1,20000,0);
 booking:=public.irp_pms_pilot_stay_action(t,p,(booking->>'id')::uuid,'check_in',room);
 PERFORM pg_temp.irp171_expect_rejection(format('SELECT public.irp_pms_pilot_create_turnover(%L,%L,%L,%L,%L,%L,%L,%L,%L)',t,p,room,gen_random_uuid(),(done->'room'->>'state_version')::bigint+1,d,d,actor,'Occupied171 manual work'),'P0001');
 booking:=public.irp_pms_pilot_stay_action(t,p,(booking->>'id')::uuid,'check_out',NULL);
 report:=public.irp_pms_pilot_turnovers(t,p,d,d+3);
 IF jsonb_array_length(report->'open_tasks') IS DISTINCT FROM 1 OR report->'open_tasks'->0->>'origin_kind' IS DISTINCT FROM 'checkout' OR (report->'open_tasks'->0->>'version')::bigint IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'Checkout did not create exactly one generation';END IF;
 PERFORM public.irp_pms_pilot_stay_action(t,p,(booking->>'id')::uuid,'check_out',NULL);
 IF public.irp_pms_pilot_turnovers(t,p,d,d+3)->'open_tasks' IS DISTINCT FROM report->'open_tasks' THEN RAISE EXCEPTION 'Checkout replay created duplicate work';END IF;
 PERFORM pg_temp.irp171_expect_rejection(format('SELECT public.irp_pms_pilot_configure_property(%L,%L,''Temporary171 renamed'',''Pacific/Honolulu'')',t,p),'P0001');
 PERFORM set_config('irp171.home',jsonb_build_object('property',p,'type',rt,'room',room,'date',d,'create_request',created_request,'created',made,'version',version)::text,true);
END $home$;
DO $hotel$
DECLARE t uuid:=current_setting('irp171.tenant')::uuid;actor uuid:=current_setting('irp171.actor')::uuid;p uuid;rt uuid;property jsonb;r1 jsonb;r2 jsonb;w jsonb;d date;made jsonb;done jsonb;res jsonb;moved jsonb;again jsonb;report jsonb;closure jsonb;x jsonb;task jsonb;submit jsonb;checks jsonb;from_version bigint;to_version bigint;move_request uuid:=gen_random_uuid();submit_request uuid:=gen_random_uuid();
BEGIN
 property:=public.irp_pms_pilot_create_property(t,gen_random_uuid(),'Temporary171 hotel','UTC','hotel',NULL);p:=(property->>'property_id')::uuid;
 rt:=(public.irp_pms_pilot_save_room_type(t,p,NULL,'Synthetic171 type',2)->>'id')::uuid;
 r1:=public.irp_pms_pilot_save_room(t,p,NULL,rt,'TEMP171-101');r2:=public.irp_pms_pilot_save_room(t,p,NULL,rt,'TEMP171-102');
 w:=public.irp_pms_pilot_workspace(t,p);d:=(w->>'business_date')::date;PERFORM public.irp_pms_pilot_set_capacity(t,p,rt,d,d+5,2);
 made:=public.irp_pms_pilot_create_turnover(t,p,(r1->>'id')::uuid,gen_random_uuid(),(r1->>'state_version')::bigint,d,d,actor,'Synthetic171 hotel preparation');
 IF jsonb_array_length(made->'task'->'checklist') IS DISTINCT FROM 5 THEN RAISE EXCEPTION 'Hotel checklist mismatch';END IF;
 done:=pg_temp.irp171_finish(t,p,made->'task',d);r1:=done->'room';
 made:=public.irp_pms_pilot_create_turnover(t,p,(r2->>'id')::uuid,gen_random_uuid(),(r2->>'state_version')::bigint,d,d,actor,'Synthetic171 second room preparation');done:=pg_temp.irp171_finish(t,p,made->'task',d);r2:=done->'room';
 res:=public.irp_pms_pilot_create_reservation(t,p,gen_random_uuid(),rt,'Synthetic171 move guest',d,d+2,1,20000,0);res:=public.irp_pms_pilot_stay_action(t,p,(res->>'id')::uuid,'check_in',(r1->>'id')::uuid);
 from_version:=(r1->>'state_version')::bigint+1;to_version:=(r2->>'state_version')::bigint;
 moved:=public.irp_pms_pilot_move_room(t,p,(res->>'id')::uuid,move_request,(res->>'source_version')::bigint,(r1->>'id')::uuid,from_version,(r2->>'id')::uuid,to_version,'Synthetic171 room move');
 again:=public.irp_pms_pilot_move_room(t,p,(res->>'id')::uuid,move_request,(res->>'source_version')::bigint,(r1->>'id')::uuid,from_version,(r2->>'id')::uuid,to_version,'Synthetic171 room move');
 IF again IS DISTINCT FROM moved||jsonb_build_object('replayed',true) THEN RAISE EXCEPTION 'Move original receipt changed';END IF;
 report:=public.irp_pms_pilot_turnovers(t,p,d,d+3);task:=report->'open_tasks'->0;
 IF jsonb_array_length(report->'open_tasks') IS DISTINCT FROM 1 OR task->>'origin_kind' IS DISTINCT FROM 'room_move' OR task->>'room_id' IS DISTINCT FROM r1->>'id' THEN RAISE EXCEPTION 'Move dispatched the wrong physical room';END IF;
 closure:=public.irp_pms_pilot_create_room_closure(t,p,(r1->>'id')::uuid,gen_random_uuid(),(moved->'from_room'->>'state_version')::bigint,d,d,d+1,'Synthetic171 maintenance before cleaning');
 PERFORM pg_temp.irp171_expect_rejection(format('SELECT public.irp_pms_pilot_update_turnover(%L,%L,%L,%L,1,%L,%L,''start'',''{}''::jsonb)',t,p,task->>'id',gen_random_uuid(),closure->>'room_state_version',d),'P0001');
 x:=public.irp_pms_pilot_release_room_closure(t,p,(closure->'closure'->>'id')::uuid,gen_random_uuid(),(closure->>'room_state_version')::bigint,d,'Synthetic171 repair finished');
 x:=public.irp_pms_pilot_update_turnover(t,p,(task->>'id')::uuid,gen_random_uuid(),1,(x->>'room_state_version')::bigint,d,'start','{}');
 SELECT jsonb_object_agg(item->>'key',true) INTO checks FROM jsonb_array_elements(x->'task'->'checklist') item;
 submit:=public.irp_pms_pilot_update_turnover(t,p,(task->>'id')::uuid,submit_request,2,(x->'room'->>'state_version')::bigint,d,'submit_cleaning',jsonb_build_object('checklist',checks));
 r1:=public.irp_pms_pilot_save_room(t,p,(r1->>'id')::uuid,rt,'TEMP171-101 renamed');
 PERFORM pg_temp.irp171_expect_rejection(format('SELECT public.irp_pms_pilot_update_turnover(%L,%L,%L,%L,3,%L,%L,''approve_inspection'',''{"work_reviewed":true,"room_ready":true}''::jsonb)',t,p,task->>'id',gen_random_uuid(),r1->>'state_version',d),'P0001');
 x:=public.irp_pms_pilot_update_turnover(t,p,(task->>'id')::uuid,gen_random_uuid(),3,(r1->>'state_version')::bigint,d,'return_for_cleaning',jsonb_build_object('reason','Confirm synthetic renamed room'));
 IF (x->'task'->>'work_generation')::bigint IS DISTINCT FROM 2 OR x->'task'->'submission' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Return did not reset work context';END IF;
 done:=pg_temp.irp171_finish(t,p,x->'task',d);
 IF (done->'task'->>'version')::bigint IS DISTINCT FROM 7 OR done->'task'->>'state' IS DISTINCT FROM 'completed' THEN RAISE EXCEPTION 'New work generation did not complete';END IF;
 again:=public.irp_pms_pilot_update_turnover(t,p,(task->>'id')::uuid,submit_request,2,(submit->'task'->>'submitted_room_version')::bigint-1,d,'submit_cleaning',jsonb_build_object('checklist',checks));
 IF again IS DISTINCT FROM submit||jsonb_build_object('replayed',true) THEN RAISE EXCEPTION 'Prior submission receipt was rewritten by later generation';END IF;
 PERFORM set_config('irp171.hotel',jsonb_build_object('property',p,'type',rt,'room',r1->>'id','date',d)::text,true);
END $hotel$;
RESET ROLE;
DO $downgrade$
DECLARE t uuid:=current_setting('irp171.tenant')::uuid;actor uuid:=current_setting('irp171.actor')::uuid;
BEGIN
 UPDATE irp_pms.memberships SET role='staff' WHERE tenant_id=t AND user_id=actor;
END $downgrade$;
SET LOCAL ROLE authenticated;
DO $recovery$
DECLARE t uuid:=current_setting('irp171.tenant')::uuid;actor uuid:=current_setting('irp171.actor')::uuid;h jsonb:=current_setting('irp171.home')::jsonb;p uuid:=(h->>'property')::uuid;d date:=(h->>'date')::date;x jsonb;
BEGIN
 x:=public.irp_pms_pilot_create_turnover(t,p,(h->>'room')::uuid,(h->>'create_request')::uuid,(h->>'version')::bigint,d,d,actor,'Synthetic171 home preparation');
 IF x IS DISTINCT FROM h->'created'||jsonb_build_object('replayed',true) THEN RAISE EXCEPTION 'Downgraded original actor lost member-authorized create receipt';END IF;
 IF public.irp_pms_pilot_turnover_request_status(t,p,(h->>'create_request')::uuid)->>'found' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Original actor status recovery missing';END IF;
 PERFORM pg_temp.irp171_expect_rejection(format('SELECT public.irp_pms_pilot_update_turnover(%L,%L,%L,%L,1,1,%L,''cancel'',''{"reason":"Denied171 manager action"}''::jsonb)',t,p,h->'created'->'task'->>'id',gen_random_uuid(),d),'42501');
END $recovery$;
RESET ROLE;
SET CONSTRAINTS ALL IMMEDIATE;
DO $invariants$
DECLARE t uuid:=current_setting('irp171.tenant')::uuid;
BEGIN
 IF EXISTS(SELECT 1 FROM irp_pms.folio_openings WHERE tenant_id=t) OR EXISTS(SELECT 1 FROM irp_pms.folio_entries WHERE tenant_id=t) THEN RAISE EXCEPTION 'Turnover posted financial data';END IF;
 IF NOT EXISTS(SELECT 1 FROM irp_pms.turnover_origins WHERE tenant_id=t AND origin_kind='checkout') OR NOT EXISTS(SELECT 1 FROM irp_pms.turnover_origins WHERE tenant_id=t AND origin_kind='room_move') THEN RAISE EXCEPTION 'Missing actual vacancy provenance';END IF;
END $invariants$;
SELECT 'turnover_transaction_proof_passed' AS verification;
ROLLBACK;
